// Analyse d'un tour de télémétrie : détection des virages (minima locaux de
// vitesse), extraction de points de pilotage (freinage, apex, réaccélération),
// comparaison à un tour de référence, puis envoi d'un résumé compact (jamais
// la télémétrie brute) à une API LLM compatible OpenAI pour obtenir un
// commentaire de coaching en langage naturel.

const SMOOTH_WINDOW = 5;
const MIN_SPEED_DROP = 15; // km/h — en dessous, on ignore (bruit / faux virage)
const MIN_CORNER_GAP_MS = 1500; // distance minimale entre deux virages détectés
const NEIGHBOR_WINDOW = 5; // demi-fenêtre (en échantillons) pour valider un minimum local

function smooth(values, window = SMOOTH_WINDOW) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    const slice = values.slice(start, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function findLocalMinimaIndexes(speed) {
  const indexes = [];
  for (let i = NEIGHBOR_WINDOW; i < speed.length - NEIGHBOR_WINDOW; i++) {
    const isMin = speed[i] <= speed[i - NEIGHBOR_WINDOW] && speed[i] <= speed[i + NEIGHBOR_WINDOW];
    if (isMin) indexes.push(i);
  }
  return indexes;
}

function dedupeByGap(indexes, t, minGapMs) {
  const kept = [];
  for (const i of indexes) {
    const last = kept[kept.length - 1];
    if (last === undefined || t[i] - t[last] >= minGapMs) kept.push(i);
  }
  return kept;
}

// Segmente un tour en virages à partir des échantillons (déjà triés par
// lap_time_ms croissant) et calcule, pour chacun, les points de pilotage clés.
export function detectCorners(rows) {
  if (rows.length < NEIGHBOR_WINDOW * 2 + 1) return [];

  const t = rows.map((r) => r.lap_time_ms);
  const rawSpeed = rows.map((r) => r.speed);
  const speed = smooth(rawSpeed);
  const throttle = rows.map((r) => r.throttle);
  const brake = rows.map((r) => r.brake);
  const steer = rows.map((r) => r.steer);

  const candidates = findLocalMinimaIndexes(speed);
  const apexIndexes = dedupeByGap(candidates, t, MIN_CORNER_GAP_MS);

  const corners = [];
  for (const apexIdx of apexIndexes) {
    const lookbackStart = Math.max(0, apexIdx - 40);
    const entrySpeed = Math.max(...speed.slice(lookbackStart, apexIdx + 1));
    if (entrySpeed - speed[apexIdx] < MIN_SPEED_DROP) continue;

    const lookaheadEnd = Math.min(speed.length, apexIdx + 25);
    const exitSpeed = speed[lookaheadEnd - 1];

    let brakingPointT = null;
    for (let i = apexIdx; i >= lookbackStart; i--) {
      if (brake[i] > 0.1) brakingPointT = t[i];
      else if (brakingPointT !== null) break;
    }

    let throttleReapplyDelayMs = null;
    for (let i = apexIdx; i < lookaheadEnd; i++) {
      if (throttle[i] > 0.3) {
        throttleReapplyDelayMs = t[i] - t[apexIdx];
        break;
      }
    }

    const steerWindow = steer.slice(
      Math.max(0, apexIdx - 10),
      Math.min(steer.length, apexIdx + 10),
    );
    const maxSteerAbs = Math.max(...steerWindow.map(Math.abs));

    corners.push({
      apexTimeMs: t[apexIdx],
      entrySpeed: Math.round(entrySpeed),
      apexSpeed: Math.round(speed[apexIdx]),
      exitSpeed: Math.round(exitSpeed),
      brakingPointMsBeforeApex: brakingPointT !== null ? t[apexIdx] - brakingPointT : null,
      throttleReapplyDelayMs,
      maxSteerAbs: Number(maxSteerAbs.toFixed(2)),
    });
  }

  return corners;
}

// Associe les virages de deux tours dans l'ordre où ils apparaissent (même
// tracé => même nombre de virages dans le même ordre) et calcule les deltas.
export function compareCorners(cornersA, cornersB) {
  const count = Math.min(cornersA.length, cornersB.length);
  const deltas = [];
  for (let i = 0; i < count; i++) {
    const a = cornersA[i];
    const b = cornersB[i];
    deltas.push({
      corner: i + 1,
      apexSpeedDelta: a.apexSpeed - b.apexSpeed,
      brakingPointDeltaMs:
        a.brakingPointMsBeforeApex !== null && b.brakingPointMsBeforeApex !== null
          ? a.brakingPointMsBeforeApex - b.brakingPointMsBeforeApex
          : null,
      throttleReapplyDeltaMs:
        a.throttleReapplyDelayMs !== null && b.throttleReapplyDelayMs !== null
          ? a.throttleReapplyDelayMs - b.throttleReapplyDelayMs
          : null,
      exitSpeedDelta: a.exitSpeed - b.exitSpeed,
    });
  }
  return deltas;
}

function buildMessages({
  sessionName,
  lapNumber,
  lapTimeMs,
  referenceLapNumber,
  referenceLapTimeMs,
  corners,
  deltas,
}) {
  const system = `Tu es un ingénieur de course qui analyse la télémétrie d'un pilote sur simulateur F1 26.
Tu reçois des données déjà résumées virage par virage (jamais la télémétrie brute).
Réponds en français, de façon concise et actionnable : 3 à 5 points maximum, priorité aux virages où l'écart de temps est le plus important.
Pour chaque point, précise le virage concerné et l'action concrète à corriger (point de freinage, vitesse d'apex, réaccélération, direction).
Ne mentionne pas les valeurs négatives comme si le pilote actuel était pire par défaut : un delta négatif de temps de réaccélération est bon, précise-le explicitement.`;

  const payload = {
    session: sessionName,
    tour_analysé: lapNumber,
    temps_tour_ms: lapTimeMs,
    tour_référence: referenceLapNumber,
    temps_référence_ms: referenceLapTimeMs,
    virages: corners,
    deltas_vs_référence: deltas,
  };

  const user = `Voici l'analyse virage par virage du tour ${lapNumber} comparé au tour de référence ${referenceLapNumber} :\n\n${JSON.stringify(payload, null, 2)}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function requestCoachComment(analysis) {
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("LLM_API_KEY manquant (voir apps/bridge/.env.example)");
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(analysis),
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Erreur API LLM (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
