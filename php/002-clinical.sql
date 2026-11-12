CREATE TABLE IF NOT EXISTS cf_clinical_state (
    patient VARCHAR(170) PRIMARY KEY,
    metadata JSON NOT NULL,
    FOREIGN KEY(patient) REFERENCES cf_patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cf_clinical_records (
    patient VARCHAR(170) NOT NULL,
    category VARCHAR(20) NOT NULL,
    ordinal INT UNSIGNED NOT NULL,
    record_id VARCHAR(100) NULL,
    record_type VARCHAR(32) NULL,
    record_status VARCHAR(32) NULL,
    scheduled_date DATE NULL,
    pre_notes MEDIUMTEXT NULL,
    post_notes MEDIUMTEXT NULL,
    properties JSON NOT NULL,
    PRIMARY KEY(patient,category,ordinal),
    INDEX clinical_lookup(patient,category,record_id),
    INDEX clinical_schedule(category,scheduled_date),
    FOREIGN KEY(patient) REFERENCES cf_clinical_state(patient) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
