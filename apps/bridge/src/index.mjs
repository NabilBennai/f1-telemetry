// udp-to-websocket-bridge.mjs
//
// Pont entre le flux UDP télémétrie de F1 26 et le dashboard React.
// Écoute le port UDP 20777 (le jeu), parse les paquets utiles,
// et rediffuse un état JSON à jour à tous les clients WebSocket connectés
// (le composant React F1Dashboard.jsx s'y connecte en mode CONNECT_WEBSOCKET = true).
//
// Installation :
//   pnpm add ws
//
// Lancement :
//   node src/index.mjs
//
// Configuration F1 26 (Settings > Telemetry Settings) :
//   UDP Telemetry: On   |  UDP Port: 20777  |  UDP Format: 2026
//   UDP IP Address: 127.0.0.1 (si le jeu tourne sur cette même machine)

import dgram from "node:dgram";
import { WebSocketServer } from "ws";
import "dotenv/config";
import { createApiApp } from "./api.mjs";
import { createPool } from "./db.mjs";
import { SessionTracker } from "./sessionTracker.mjs";

const UDP_PORT = 20777;
const WS_PORT = 8787;
const API_PORT = Number(process.env.API_PORT) || 8788;

const pool = createPool();
const sessionTracker = new SessionTracker(pool);

const HEADER_SIZE = 29;
const CAR_TELEMETRY_SIZE = 60;
const LAP_DATA_SIZE = 57;
const MAX_CARS = 22;

const state = {
  connected: false,
  speed: 0,
  rpm: 0,
  gear: 0,
  throttle: 0,
  brake: 0,
  steer: 0,
  drs: false,
  position: 0,
  lap: 0,
  sector: 0,
  lapTimeMs: 0,
  lastLapMs: 0,
  tyres: {
    FL: { surf: 0, press: 0 },
    FR: { surf: 0, press: 0 },
    RL: { surf: 0, press: 0 },
    RR: { surf: 0, press: 0 },
  },
  engineTemp: 0,
  weather: "-",
  trackTemp: 0,
  airTemp: 0,
  packets: 0,
};

let playerIndex = 0;

function parseHeader(buf) {
  return {
    packetFormat: buf.readUInt16LE(0),
    packetId: buf.readUInt8(6),
    sessionUid: buf.readBigUInt64LE(7),
    playerCarIndex: buf.readUInt8(27),
  };
}

function parseCarTelemetry(buf) {
  let offset = HEADER_SIZE;
  for (let i = 0; i < MAX_CARS; i++) {
    if (offset + CAR_TELEMETRY_SIZE > buf.length) break;
    if (i === playerIndex) {
      const speed = buf.readUInt16LE(offset);
      const throttle = buf.readFloatLE(offset + 2);
      const steer = buf.readFloatLE(offset + 6);
      const brake = buf.readFloatLE(offset + 10);
      const gear = buf.readInt8(offset + 15);
      const rpm = buf.readUInt16LE(offset + 16);
      const drs = buf.readUInt8(offset + 18);
      const tsBase = offset + 30;
      const surf = [
        buf.readUInt8(tsBase),
        buf.readUInt8(tsBase + 1),
        buf.readUInt8(tsBase + 2),
        buf.readUInt8(tsBase + 3),
      ];
      const engineTemp = buf.readUInt16LE(offset + 38);
      const pressBase = offset + 40;
      const press = [
        buf.readFloatLE(pressBase),
        buf.readFloatLE(pressBase + 4),
        buf.readFloatLE(pressBase + 8),
        buf.readFloatLE(pressBase + 12),
      ];

      state.speed = speed;
      state.throttle = throttle;
      state.steer = steer;
      state.brake = brake;
      state.gear = gear;
      state.rpm = rpm;
      state.drs = drs === 1;
      state.tyres.FL = { surf: surf[0], press: press[0] };
      state.tyres.FR = { surf: surf[1], press: press[1] };
      state.tyres.RL = { surf: surf[2], press: press[2] };
      state.tyres.RR = { surf: surf[3], press: press[3] };
      state.engineTemp = engineTemp;
      break;
    }
    offset += CAR_TELEMETRY_SIZE;
  }
}

function parseLapData(buf) {
  let offset = HEADER_SIZE;
  for (let i = 0; i < MAX_CARS; i++) {
    if (offset + LAP_DATA_SIZE > buf.length) break;
    if (i === playerIndex) {
      state.lastLapMs = buf.readUInt32LE(offset);
      state.lapTimeMs = buf.readUInt32LE(offset + 4);
      state.position = buf.readUInt8(offset + 32);
      state.lap = buf.readUInt8(offset + 33);
      state.sector = buf.readUInt8(offset + 36) + 1;
      break;
    }
    offset += LAP_DATA_SIZE;
  }
}

function parseSession(buf) {
  const weatherId = buf.readUInt8(HEADER_SIZE);
  const trackTemp = buf.readInt8(HEADER_SIZE + 1);
  const airTemp = buf.readInt8(HEADER_SIZE + 2);
  const labels = ["Clear", "Light Cloud", "Overcast", "Light Rain", "Heavy Rain", "Storm"];
  state.weather = labels[weatherId] ?? "?";
  state.trackTemp = trackTemp;
  state.airTemp = airTemp;
}

const udpSocket = dgram.createSocket("udp4");

udpSocket.on("message", (msg) => {
  if (msg.length < HEADER_SIZE) return;
  const header = parseHeader(msg);
  playerIndex = header.playerCarIndex;
  sessionTracker.onSessionUid(header.sessionUid).catch((e) => console.error(e.message));

  try {
    if (header.packetId === 6) parseCarTelemetry(msg);
    else if (header.packetId === 2) parseLapData(msg);
    else if (header.packetId === 1) parseSession(msg);
  } catch (e) {
    console.error("Erreur de parsing:", e.message);
  }

  state.connected = true;
  state.packets += 1;

  if (header.packetId === 6) {
    sessionTracker.recordSample(state).catch((e) => console.error(e.message));
  }
});

udpSocket.on("error", (err) => {
  console.error("Erreur UDP socket:", err);
});

udpSocket.bind(UDP_PORT, "0.0.0.0", () => {
  console.log(`Écoute UDP F1 26 sur le port ${UDP_PORT}...`);
});

const wss = new WebSocketServer({ port: WS_PORT, host: "0.0.0.0" });
console.log(`Serveur WebSocket sur ws://0.0.0.0:${WS_PORT} (accessible en LAN)`);

wss.on("connection", (ws) => {
  console.log("Client React connecté.");
  ws.send(JSON.stringify(state));
});

setInterval(() => {
  const payload = JSON.stringify(state);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(payload);
  });
}, 66);

const apiApp = createApiApp(pool);
apiApp.listen(API_PORT, "0.0.0.0", () => {
  console.log(`API REST (sessions/télémétrie) sur http://0.0.0.0:${API_PORT} (accessible en LAN)`);
});
