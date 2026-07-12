// Détecte les changements de session F1 26 (via le Session UID des paquets UDP),
// ouvre/ferme automatiquement une ligne `sessions` en base, et enregistre un
// échantillon de télémétrie de temps en temps (throttle) pendant que la session
// est active.

const SAMPLE_INTERVAL_MS = 100;

export class SessionTracker {
  constructor(pool) {
    this.pool = pool;
    this.currentSessionUid = null;
    this.currentSessionId = null;
    this.lastSampleAt = 0;
  }

  formatDefaultName(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `Session ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  async onSessionUid(sessionUid) {
    if (!sessionUid || sessionUid === 0n) return;
    if (this.currentSessionUid === sessionUid) return;

    if (this.currentSessionId) {
      await this.pool
        .query("UPDATE sessions SET ended_at = NOW(3) WHERE id = ?", [this.currentSessionId])
        .catch((e) => console.error("Erreur fermeture session:", e.message));
    }

    const uidStr = sessionUid.toString();
    const now = new Date();
    try {
      const [result] = await this.pool.query(
        "INSERT INTO sessions (session_uid, name, started_at) VALUES (?, ?, NOW(3))",
        [uidStr, this.formatDefaultName(now)],
      );
      this.currentSessionUid = sessionUid;
      this.currentSessionId = result.insertId;
      console.log(`Nouvelle session détectée (uid=${uidStr}, id=${this.currentSessionId}).`);
    } catch (e) {
      console.error("Erreur création session:", e.message);
    }
  }

  async recordSample(state) {
    if (!this.currentSessionId) return;
    const now = Date.now();
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) return;
    this.lastSampleAt = now;

    try {
      await this.pool.query(
        `INSERT INTO telemetry_samples (
          session_id, recorded_at, lap, sector, lap_time_ms, last_lap_ms,
          speed, rpm, gear, throttle, brake, steer, drs, position,
          tyre_fl_surf, tyre_fl_press, tyre_fr_surf, tyre_fr_press,
          tyre_rl_surf, tyre_rl_press, tyre_rr_surf, tyre_rr_press,
          engine_temp, weather, track_temp, air_temp
        ) VALUES (?, NOW(3), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.currentSessionId,
          state.lap,
          state.sector,
          state.lapTimeMs,
          state.lastLapMs,
          state.speed,
          state.rpm,
          state.gear,
          state.throttle,
          state.brake,
          state.steer,
          state.drs ? 1 : 0,
          state.position,
          state.tyres.FL.surf,
          state.tyres.FL.press,
          state.tyres.FR.surf,
          state.tyres.FR.press,
          state.tyres.RL.surf,
          state.tyres.RL.press,
          state.tyres.RR.surf,
          state.tyres.RR.press,
          state.engineTemp,
          state.weather,
          state.trackTemp,
          state.airTemp,
        ],
      );
    } catch (e) {
      console.error("Erreur insertion échantillon:", e.message);
    }
  }
}
