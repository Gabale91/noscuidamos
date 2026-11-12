CREATE TABLE IF NOT EXISTS cf_patient_admins (
  patient VARCHAR(170) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  accepted_at BIGINT NULL,
  expires BIGINT NOT NULL,
  PRIMARY KEY (patient,user_id),
  INDEX admin_by_user (user_id),
  FOREIGN KEY (patient,user_id) REFERENCES cf_members(patient,user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
