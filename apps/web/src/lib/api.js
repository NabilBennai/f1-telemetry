const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8788";

async function request(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`Erreur API (${res.status}) sur ${path}`);
  return res.json();
}

export function fetchSessions({ search, from, to } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return request(`/api/sessions${qs ? `?${qs}` : ""}`);
}

export function renameSession(id, name) {
  return fetch(`${API_URL}/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Erreur renommage session (${res.status})`);
    return res.json();
  });
}

export function fetchLaps(sessionId) {
  return request(`/api/sessions/${sessionId}/laps`);
}

export function fetchTelemetry(sessionId, { laps, metrics } = {}) {
  const params = new URLSearchParams();
  if (laps && laps.length) params.set("laps", laps.join(","));
  if (metrics && metrics.length) params.set("metrics", metrics.join(","));
  const qs = params.toString();
  return request(`/api/sessions/${sessionId}/telemetry${qs ? `?${qs}` : ""}`);
}
