import { useEffect, useRef, useState } from "react";

/*
  F1 26 — Live Telemetry Dashboard (React)
  -----------------------------------------------------------------
  MODE DÉMO : ce composant génère des données simulées pour que tu
  puisses voir le rendu tourner immédiatement, sans le jeu ni le bridge.

  MODE RÉEL : mets CONNECT_WEBSOCKET à true et lance le bridge Node
  fourni à côté (apps/bridge), qui écoute le port UDP 20777 et relaie
  les paquets parsés en JSON sur ws://localhost:8787.
  -----------------------------------------------------------------
*/

const CONNECT_WEBSOCKET = true;
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8787";

const COLORS = {
  bg: "#0A0B0D",
  panel: "#121418",
  panelBorder: "#22262d",
  amber: "#FFB627",
  cyan: "#22D3D3",
  red: "#FF3B3B",
  green: "#4ADE80",
  blue: "#5B8CFF",
  text: "#E8E9EC",
  muted: "#6B7280",
  track: "#1B1E24",
};

function useDemoTelemetry() {
  const [state, setState] = useState(() => makeFrame(0));
  const t = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      t.current += 1;
      setState(makeFrame(t.current));
    }, 66);
    return () => clearInterval(id);
  }, []);

  return state;
}

function makeFrame(tick) {
  const s = tick / 15;
  const lapPhase = (s % 90) / 90;
  const throttle = Math.max(0, Math.sin(s * 0.9) * 0.6 + 0.55);
  const brake = Math.max(0, -Math.sin(s * 0.9) * 0.5);
  const speed = Math.round(60 + Math.sin(s * 0.45) * 130 + 140 * throttle - 60 * brake);
  const rpm = Math.round(4000 + throttle * 8500 - brake * 2000 + Math.sin(s * 3) * 200);
  const gear = Math.max(1, Math.min(8, Math.round(1 + (speed / 340) * 7)));
  const steer = Math.sin(s * 0.6) * (0.3 + 0.4 * Math.abs(Math.sin(s * 0.15)));
  const drs = speed > 270 && brake < 0.05;

  return {
    connected: true,
    speed: Math.max(0, speed),
    rpm: Math.max(1000, rpm),
    gear,
    throttle: Math.min(1, throttle),
    brake: Math.min(1, brake),
    steer,
    drs,
    position: 3,
    lap: 12 + Math.floor(tick / (15 * 90)),
    sector: lapPhase < 0.33 ? 1 : lapPhase < 0.66 ? 2 : 3,
    lapTimeMs: Math.round(lapPhase * 88000),
    lastLapMs: 88412,
    tyres: {
      FL: { surf: 91 + Math.round(Math.sin(s) * 2), press: 23.1 },
      FR: { surf: 89 + Math.round(Math.sin(s + 1) * 2), press: 22.9 },
      RL: { surf: 87 + Math.round(Math.sin(s + 2) * 2), press: 21.8 },
      RR: { surf: 88 + Math.round(Math.sin(s + 0.5) * 2), press: 21.9 },
    },
    engineTemp: 104,
    weather: "Clear",
    trackTemp: 34,
    airTemp: 24,
    packets: 15000 + tick * 3,
  };
}

function useWebSocketTelemetry() {
  const [state, setState] = useState({ connected: false });
  useEffect(() => {
    if (!CONNECT_WEBSOCKET) return;
    let ws;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        try {
          setState(JSON.parse(ev.data));
        } catch {}
      };
      ws.onopen = () => setState((s) => ({ ...s, connected: true }));
      ws.onclose = () => setState((s) => ({ ...s, connected: false }));
    } catch {}
    return () => ws && ws.close();
  }, []);
  return state;
}

function formatMs(ms) {
  if (!ms) return "--:--.---";
  const m = Math.floor(ms / 60000);
  const sec = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${m}:${sec}`;
}

function Label({ children }) {
  return (
    <div
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLORS.muted,
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

function Mono({ children, size = 22, color = COLORS.text, weight = 600 }) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: size,
        color,
        fontWeight: weight,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </span>
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

function RevLights({ pct }) {
  const n = 15;
  const lit = Math.round(pct * n);
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
      {Array.from({ length: n }).map((_, i) => {
        const on = i < lit;
        let color = COLORS.green;
        if (i / n > 0.55) color = COLORS.amber;
        if (i / n > 0.85) color = COLORS.red;
        return (
          <div
            key={i}
            style={{
              width: 22,
              height: 10,
              borderRadius: 2,
              background: on ? color : COLORS.track,
              boxShadow: on ? `0 0 8px ${color}99` : "none",
              transition: "background 60ms linear",
            }}
          />
        );
      })}
    </div>
  );
}

function PedalBar({ value, color, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 34,
          height: 130,
          background: COLORS.track,
          borderRadius: 4,
          display: "flex",
          alignItems: "flex-end",
          overflow: "hidden",
          border: `1px solid ${COLORS.panelBorder}`,
        }}
      >
        <div
          style={{
            width: "100%",
            height: `${Math.round(value * 100)}%`,
            background: color,
            transition: "height 60ms linear",
          }}
        />
      </div>
      <Label>{label}</Label>
    </div>
  );
}

function SteeringGauge({ steer }) {
  const angle = steer * 90;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width="110" height="70" viewBox="0 0 110 70">
        <path d="M10 65 A 45 45 0 0 1 100 65" fill="none" stroke={COLORS.track} strokeWidth="8" />
        <line
          x1="55"
          y1="65"
          x2={55 + 42 * Math.sin((angle * Math.PI) / 180)}
          y2={65 - 42 * Math.cos((angle * Math.PI) / 180)}
          stroke={COLORS.cyan}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="55" cy="65" r="4" fill={COLORS.cyan} />
      </svg>
      <Label>Direction</Label>
    </div>
  );
}

function TyreTile({ name, data }) {
  const hot = data.surf > 100;
  const color = hot ? COLORS.red : data.surf > 85 ? COLORS.amber : COLORS.cyan;
  return (
    <div
      style={{
        background: COLORS.track,
        borderRadius: 6,
        padding: "10px 12px",
        border: `1px solid ${COLORS.panelBorder}`,
        minWidth: 78,
      }}
    >
      <Label>{name}</Label>
      <div style={{ marginTop: 4 }}>
        <Mono size={18} color={color}>
          {data.surf}°
        </Mono>
      </div>
      <div style={{ marginTop: 2 }}>
        <Mono size={12} color={COLORS.muted} weight={400}>
          {data.press.toFixed(1)} psi
        </Mono>
      </div>
    </div>
  );
}

export default function F1Dashboard() {
  const demo = useDemoTelemetry();
  const live = useWebSocketTelemetry();
  const d = CONNECT_WEBSOCKET ? live : demo;

  const gearLabel = !d.gear ? "N" : d.gear === -1 ? "R" : d.gear;
  const rpmPct = Math.min(1, (d.rpm || 0) / 13000);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 600px at 50% -10%, #14181f 0%, ${COLORS.bg} 60%)`,
        color: COLORS.text,
        padding: 24,
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
      `}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.04em" }}>
              F1 26 <span style={{ color: COLORS.amber }}>TELEMETRY</span>
            </div>
            <Label>Pit wall dashboard</Label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: d.connected ? COLORS.green : COLORS.red,
                boxShadow: d.connected ? `0 0 8px ${COLORS.green}` : `0 0 8px ${COLORS.red}`,
              }}
            />
            <Mono size={13} color={d.connected ? COLORS.green : COLORS.red} weight={600}>
              {d.connected ? "CONNECTÉ" : "EN ATTENTE"}
            </Mono>
          </div>
        </div>

        <Panel style={{ marginBottom: 16 }}>
          <RevLights pct={rpmPct} />
        </Panel>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr", gap: 16 }}>
          <Panel>
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 10 }}>
              <PedalBar value={d.throttle || 0} color={COLORS.green} label="Accél." />
              <PedalBar value={d.brake || 0} color={COLORS.red} label="Frein" />
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
              <SteeringGauge steer={d.steer || 0} />
            </div>
          </Panel>

          <Panel
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <Mono size={64} color={COLORS.text} weight={700}>
              {d.speed ?? 0}
            </Mono>
            <Label>km/h</Label>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 14 }}>
              <div style={{ textAlign: "center" }}>
                <Mono size={40} color={COLORS.amber} weight={700}>
                  {gearLabel}
                </Mono>
                <div>
                  <Label>Rapport</Label>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <Mono size={26} color={COLORS.cyan}>
                  {d.rpm ?? 0}
                </Mono>
                <div>
                  <Label>RPM</Label>
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: "4px 14px",
                borderRadius: 20,
                border: `1px solid ${d.drs ? COLORS.green : COLORS.panelBorder}`,
                background: d.drs ? `${COLORS.green}22` : "transparent",
              }}
            >
              <Mono size={13} color={d.drs ? COLORS.green : COLORS.muted} weight={700}>
                DRS
              </Mono>
            </div>
          </Panel>

          <Panel>
            <Label>Position</Label>
            <Mono size={28} color={COLORS.text}>
              P{d.position ?? "-"}
            </Mono>
            <div style={{ height: 10 }} />
            <Label>
              Tour {d.lap ?? "-"} · Secteur {d.sector ?? "-"}
            </Label>
            <Mono size={22} color={COLORS.text}>
              {formatMs(d.lapTimeMs)}
            </Mono>
            <div style={{ height: 10 }} />
            <Label>Dernier tour</Label>
            <Mono size={18} color={COLORS.muted}>
              {formatMs(d.lastLapMs)}
            </Mono>
          </Panel>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginTop: 16 }}>
          <Panel>
            <Label>Pneus</Label>
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              {d.tyres &&
                Object.entries(d.tyres).map(([name, data]) => (
                  <TyreTile key={name} name={name} data={data} />
                ))}
              <div
                style={{
                  background: COLORS.track,
                  borderRadius: 6,
                  padding: "10px 12px",
                  border: `1px solid ${COLORS.panelBorder}`,
                  minWidth: 78,
                }}
              >
                <Label>Moteur</Label>
                <Mono size={18} color={COLORS.blue}>
                  {d.engineTemp ?? "-"}°
                </Mono>
              </div>
            </div>
          </Panel>

          <Panel style={{ minWidth: 220 }}>
            <Label>Session</Label>
            <div style={{ marginTop: 8 }}>
              <Mono size={14} color={COLORS.text} weight={400}>
                {d.weather ?? "-"}
              </Mono>
            </div>
            <div style={{ marginTop: 4 }}>
              <Mono size={13} color={COLORS.muted} weight={400}>
                Piste {d.trackTemp ?? "-"}°C · Air {d.airTemp ?? "-"}°C
              </Mono>
            </div>
            <div style={{ marginTop: 10 }}>
              <Mono size={11} color={COLORS.muted} weight={400}>
                {d.packets ?? 0} paquets reçus
              </Mono>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
