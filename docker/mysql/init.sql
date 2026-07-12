-- Schéma de persistance de la télémétrie F1 26.
-- Chargé automatiquement par MySQL au premier démarrage du conteneur
-- (docker-entrypoint-initdb.d).

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_uid VARCHAR(32) NULL,
  name VARCHAR(255) NOT NULL,
  started_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sessions_session_uid (session_uid)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS telemetry_samples (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  lap SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  sector TINYINT UNSIGNED NOT NULL DEFAULT 0,
  lap_time_ms INT UNSIGNED NOT NULL DEFAULT 0,
  last_lap_ms INT UNSIGNED NOT NULL DEFAULT 0,
  speed SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  rpm SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  gear TINYINT NOT NULL DEFAULT 0,
  throttle FLOAT NOT NULL DEFAULT 0,
  brake FLOAT NOT NULL DEFAULT 0,
  steer FLOAT NOT NULL DEFAULT 0,
  drs TINYINT UNSIGNED NOT NULL DEFAULT 0,
  position TINYINT UNSIGNED NOT NULL DEFAULT 0,
  tyre_fl_surf SMALLINT NOT NULL DEFAULT 0,
  tyre_fl_press FLOAT NOT NULL DEFAULT 0,
  tyre_fr_surf SMALLINT NOT NULL DEFAULT 0,
  tyre_fr_press FLOAT NOT NULL DEFAULT 0,
  tyre_rl_surf SMALLINT NOT NULL DEFAULT 0,
  tyre_rl_press FLOAT NOT NULL DEFAULT 0,
  tyre_rr_surf SMALLINT NOT NULL DEFAULT 0,
  tyre_rr_press FLOAT NOT NULL DEFAULT 0,
  engine_temp SMALLINT NOT NULL DEFAULT 0,
  weather VARCHAR(32) NOT NULL DEFAULT '-',
  track_temp SMALLINT NOT NULL DEFAULT 0,
  air_temp SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_telemetry_samples_session
    FOREIGN KEY (session_id) REFERENCES sessions (id)
    ON DELETE CASCADE,
  KEY idx_telemetry_samples_session_lap (session_id, lap)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
