import cors from "cors";
import express from "express";

// Whitelist des métriques exposables via /telemetry?metrics=... (protège contre
// l'injection SQL par nom de colonne, impossible à paramétrer avec des placeholders).
const METRIC_COLUMNS = {
  speed: "speed",
  rpm: "rpm",
  gear: "gear",
  throttle: "throttle",
  brake: "brake",
  steer: "steer",
  engineTemp: "engine_temp",
  tyreFLSurf: "tyre_fl_surf",
  tyreFRSurf: "tyre_fr_surf",
  tyreRLSurf: "tyre_rl_surf",
  tyreRRSurf: "tyre_rr_surf",
};

export function createApiApp(pool) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/sessions", async (req, res) => {
    const { search, from, to } = req.query;
    const clauses = [];
    const params = [];

    if (search) {
      clauses.push("s.name LIKE ?");
      params.push(`%${search}%`);
    }
    if (from) {
      clauses.push("s.started_at >= ?");
      params.push(from);
    }
    if (to) {
      clauses.push("s.started_at <= ?");
      params.push(to);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.started_at, s.ended_at,
              COUNT(t.id) AS sample_count, MAX(t.lap) AS lap_count
       FROM sessions s
       LEFT JOIN telemetry_samples t ON t.session_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.started_at DESC`,
      params,
    );
    res.json(rows);
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name requis" });
    }
    await pool.query("UPDATE sessions SET name = ? WHERE id = ?", [name, req.params.id]);
    res.json({ ok: true });
  });

  app.get("/api/sessions/:id/laps", async (req, res) => {
    const [rows] = await pool.query(
      `SELECT lap, COUNT(*) AS sample_count, MIN(last_lap_ms) AS last_lap_ms
       FROM telemetry_samples
       WHERE session_id = ? AND lap > 0
       GROUP BY lap
       ORDER BY lap ASC`,
      [req.params.id],
    );
    res.json(rows);
  });

  app.get("/api/sessions/:id/telemetry", async (req, res) => {
    const lapsParam = req.query.laps;
    const metricsParam = req.query.metrics;

    const laps = lapsParam
      ? String(lapsParam)
          .split(",")
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0)
      : [];

    const metricKeys = metricsParam
      ? String(metricsParam)
          .split(",")
          .filter((key) => Object.hasOwn(METRIC_COLUMNS, key))
      : Object.keys(METRIC_COLUMNS);

    if (metricKeys.length === 0) {
      return res.status(400).json({ error: "aucune métrique valide" });
    }

    const columns = metricKeys.map((key) => `${METRIC_COLUMNS[key]} AS ${key}`).join(", ");
    const clauses = ["session_id = ?"];
    const params = [req.params.id];

    if (laps.length > 0) {
      clauses.push(`lap IN (${laps.map(() => "?").join(",")})`);
      params.push(...laps);
    }

    const [rows] = await pool.query(
      `SELECT lap, lap_time_ms, ${columns}
       FROM telemetry_samples
       WHERE ${clauses.join(" AND ")}
       ORDER BY lap ASC, lap_time_ms ASC`,
      params,
    );
    res.json(rows);
  });

  return app;
}
