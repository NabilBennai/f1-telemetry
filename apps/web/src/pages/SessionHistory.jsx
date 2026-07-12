import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchLaps, fetchSessions, fetchTelemetry, renameSession } from "../lib/api";
import { colorForLap } from "../lib/palette";

const COLORS = {
  panel: "#121418",
  panelBorder: "#22262d",
  track: "#1B1E24",
  text: "#E8E9EC",
  muted: "#6B7280",
  amber: "#FFB627",
  cyan: "#22D3D3",
};

const METRICS = [
  { key: "speed", label: "Vitesse", unit: "km/h" },
  { key: "rpm", label: "Régime moteur", unit: "rpm" },
  { key: "throttle", label: "Accélérateur", unit: "" },
  { key: "brake", label: "Frein", unit: "" },
  { key: "steer", label: "Direction", unit: "" },
  { key: "gear", label: "Rapport", unit: "" },
  { key: "engineTemp", label: "Température moteur", unit: "°C" },
  { key: "tyreFLSurf", label: "Pneu AVG (surface)", unit: "°C" },
  { key: "tyreFRSurf", label: "Pneu AVD (surface)", unit: "°C" },
  { key: "tyreRLSurf", label: "Pneu ARG (surface)", unit: "°C" },
  { key: "tyreRRSurf", label: "Pneu ARD (surface)", unit: "°C" },
];

const DEFAULT_METRICS = ["speed", "throttle", "brake"];

// Regroupe les échantillons par tour et les aligne sur des paliers de 100ms
// (la fréquence d'échantillonnage du bridge) pour pouvoir superposer plusieurs
// tours sur un même axe "temps dans le tour".
function pivotByLap(rows, metricKey, laps) {
  const buckets = new Map();
  for (const row of rows) {
    if (!laps.includes(row.lap)) continue;
    const t = Math.round(row.lap_time_ms / 100) * 100;
    if (!buckets.has(t)) buckets.set(t, { t });
    buckets.get(t)[`lap${row.lap}`] = row[metricKey];
  }
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function Label({ children }) {
  return (
    <div
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: COLORS.muted,
        fontSize: 11,
      }}
    >
      {children}
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.panelBorder}`,
        borderRadius: 8,
        padding: "16px 18px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function MetricChart({ metric, rows, laps }) {
  const data = useMemo(() => pivotByLap(rows, metric.key, laps), [rows, metric.key, laps]);

  return (
    <Panel>
      <Label>
        {metric.label}
        {metric.unit ? ` (${metric.unit})` : ""}
      </Label>
      <div style={{ width: "100%", height: 220, marginTop: 8 }}>
        <ResponsiveContainer>
          <LineChart
            data={data}
            syncId="lapCompare"
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#2c2c2a" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatSeconds}
              stroke={COLORS.muted}
              fontSize={11}
              tickLine={false}
            />
            <YAxis stroke={COLORS.muted} fontSize={11} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: COLORS.track, border: `1px solid ${COLORS.panelBorder}` }}
              labelStyle={{ color: COLORS.text }}
              labelFormatter={formatSeconds}
              formatter={(value, name) => [value, name.replace("lap", "Tour ")]}
            />
            {laps.map((lap) => (
              <Line
                key={lap}
                type="monotone"
                dataKey={`lap${lap}`}
                name={`lap${lap}`}
                stroke={colorForLap(lap)}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function SummaryTable({ rows, laps, metrics }) {
  const summary = useMemo(() => {
    return laps.map((lap) => {
      const lapRows = rows.filter((r) => r.lap === lap);
      const stats = { lap };
      for (const metric of metrics) {
        const values = lapRows
          .map((r) => r[metric.key])
          .filter((v) => v !== null && v !== undefined);
        if (!values.length) continue;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        stats[metric.key] = { min, max, avg };
      }
      return stats;
    });
  }, [rows, laps, metrics]);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={thStyle}>Tour</th>
            {metrics.map((m) => (
              <th key={m.key} style={thStyle}>
                {m.label} (min / moy / max)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={row.lap}>
              <td style={tdStyle}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: colorForLap(row.lap),
                    marginRight: 6,
                  }}
                />
                Tour {row.lap}
              </td>
              {metrics.map((m) => (
                <td key={m.key} style={tdStyle}>
                  {row[m.key]
                    ? `${row[m.key].min.toFixed(1)} / ${row[m.key].avg.toFixed(1)} / ${row[m.key].max.toFixed(1)}`
                    : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "6px 10px",
  borderBottom: `1px solid ${COLORS.panelBorder}`,
  color: COLORS.muted,
  fontWeight: 600,
};
const tdStyle = {
  padding: "6px 10px",
  borderBottom: `1px solid ${COLORS.panelBorder}`,
  color: COLORS.text,
};

export default function SessionHistory() {
  const [sessions, setSessions] = useState([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [laps, setLaps] = useState([]);
  const [selectedLaps, setSelectedLaps] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState(DEFAULT_METRICS);
  const [rows, setRows] = useState([]);
  const [showTable, setShowTable] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSessions({ search, from, to })
      .then(setSessions)
      .catch((e) => setError(e.message));
  }, [search, from, to]);

  useEffect(() => {
    if (!selectedSessionId) return;
    fetchLaps(selectedSessionId)
      .then((data) => {
        setLaps(data);
        setSelectedLaps(data.slice(0, 3).map((l) => l.lap));
      })
      .catch((e) => setError(e.message));
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId || selectedLaps.length === 0 || selectedMetrics.length === 0) {
      setRows([]);
      return;
    }
    fetchTelemetry(selectedSessionId, { laps: selectedLaps, metrics: selectedMetrics })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [selectedSessionId, selectedLaps, selectedMetrics]);

  const toggleLap = (lap) => {
    setSelectedLaps((prev) =>
      prev.includes(lap) ? prev.filter((l) => l !== lap) : [...prev, lap],
    );
  };

  const toggleMetric = (key) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  };

  const activeMetrics = METRICS.filter((m) => selectedMetrics.includes(m.key));

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <Panel style={{ marginBottom: 16 }}>
        <Label>Rechercher une session</Label>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Nom de session..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Session</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Tours</th>
                <th style={thStyle}>Échantillons</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  style={{
                    cursor: "pointer",
                    background: s.id === selectedSessionId ? COLORS.track : "transparent",
                  }}
                >
                  <td style={tdStyle}>
                    <input
                      type="text"
                      defaultValue={s.name}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        if (e.target.value !== s.name) renameSession(s.id, e.target.value);
                      }}
                      style={{ ...inputStyle, width: 220 }}
                    />
                  </td>
                  <td style={tdStyle}>{new Date(s.started_at).toLocaleString("fr-FR")}</td>
                  <td style={tdStyle}>{s.lap_count ?? 0}</td>
                  <td style={tdStyle}>{s.sample_count}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={4}>
                    Aucune session trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {selectedSessionId && (
        <>
          <Panel style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              <div>
                <Label>Tours à afficher</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {laps.map((l) => (
                    <label
                      key={l.lap}
                      style={chipStyle(selectedLaps.includes(l.lap), colorForLap(l.lap))}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLaps.includes(l.lap)}
                        onChange={() => toggleLap(l.lap)}
                        style={{ display: "none" }}
                      />
                      Tour {l.lap}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label>Métriques à afficher</Label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {METRICS.map((m) => (
                    <label
                      key={m.key}
                      style={chipStyle(selectedMetrics.includes(m.key), COLORS.amber)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMetrics.includes(m.key)}
                        onChange={() => toggleMetric(m.key)}
                        style={{ display: "none" }}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
              {selectedLaps.map((lap) => (
                <span key={lap} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: colorForLap(lap),
                      display: "inline-block",
                    }}
                  />
                  <span style={{ color: COLORS.text, fontSize: 12 }}>Tour {lap}</span>
                </span>
              ))}
              <button type="button" onClick={() => setShowTable((v) => !v)} style={buttonStyle}>
                {showTable ? "Voir les courbes" : "Voir en tableau"}
              </button>
            </div>
          </Panel>

          {error && <Panel style={{ marginBottom: 16, color: "#FF3B3B" }}>{error}</Panel>}

          {showTable ? (
            <Panel>
              <SummaryTable rows={rows} laps={selectedLaps} metrics={activeMetrics} />
            </Panel>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {activeMetrics.map((metric) => (
                <MetricChart key={metric.key} metric={metric} rows={rows} laps={selectedLaps} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inputStyle = {
  background: COLORS.track,
  border: `1px solid ${COLORS.panelBorder}`,
  borderRadius: 6,
  padding: "6px 10px",
  color: COLORS.text,
  fontSize: 13,
};

const buttonStyle = {
  background: COLORS.track,
  border: `1px solid ${COLORS.panelBorder}`,
  borderRadius: 6,
  padding: "6px 12px",
  color: COLORS.cyan,
  fontSize: 12,
  cursor: "pointer",
  marginLeft: "auto",
};

function chipStyle(active, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 12,
    cursor: "pointer",
    border: `1px solid ${active ? color : COLORS.panelBorder}`,
    background: active ? `${color}22` : "transparent",
    color: active ? color : COLORS.muted,
  };
}
