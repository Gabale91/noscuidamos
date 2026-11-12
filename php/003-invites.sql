CREATE TABLE IF NOT EXISTS cf_invite_limits (
    patient VARCHAR(170) PRIMARY KEY,
    code_hash CHAR(64) NOT NULL,
    expires BIGINT NOT NULL,
    used_at BIGINT NULL,
    FOREIGN KEY(patient) REFERENCES cf_patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
