CREATE TABLE IF NOT EXISTS cf_pending_registrations (
  token CHAR(64) PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  payload JSON NULL,
  code_hash CHAR(64) NULL,
  expires BIGINT NOT NULL,
  resend_at BIGINT NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  INDEX pending_expiry (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
