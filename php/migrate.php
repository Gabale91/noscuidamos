<?php
declare(strict_types=1);
// Execute only via CLI, from outside the public document root.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
try {
    $configPath = getenv('CUIDADO_CONFIG');
    if (!$configPath || !is_file($configPath)) throw new RuntimeException('Configuração privada indisponível.');
    $c = require $configPath;
    $db = new PDO($c['dsn'], $c['db_user'], $c['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql') throw new RuntimeException('MySQL obrigatório.');
    $lock = 'nc-schema-' . substr(hash('sha256', $db->query('SELECT DATABASE()')->fetchColumn()), 0, 40);
    $q = $db->prepare('SELECT GET_LOCK(?, 10)');
    $q->execute([$lock]);
    if ((int) $q->fetchColumn() !== 1) throw new RuntimeException('Migração já em andamento.');
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS cf_schema_migrations (version VARCHAR(32) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
        $sql = file_get_contents(__DIR__.'/schema.sql');
        if ($sql === false) throw new RuntimeException('Arquivo SQL ausente.');
        $sql = str_replace("\r\n", "\n", $sql);
        $checksum = hash('sha256', $sql);
        $read = $db->prepare('SELECT checksum FROM cf_schema_migrations WHERE version=?');
        $read->execute(['001']);
        $applied = $read->fetchColumn();
        if ($applied !== false && !hash_equals($applied, $checksum)) throw new RuntimeException('O arquivo da versão 001 foi alterado.');
        if ($applied === false) {
            // DDL commits independently in MySQL; all 001 statements are retry-safe.
            $sql = preg_replace('/^--[^\n]*$/m', '', $sql);
            foreach (explode(';', $sql) as $statement) {
                $statement = trim($statement);
                if ($statement !== '') $db->exec($statement);
            }
            $write = $db->prepare('INSERT INTO cf_schema_migrations(version,checksum) VALUES(?,?)');
            $write->execute(['001', $checksum]);
        }
        require_once __DIR__.'/src/clinical.php';
        $clinicalSql = file_get_contents(__DIR__.'/002-clinical.sql');
        if ($clinicalSql === false) throw new RuntimeException('SQL clínico ausente.');
        $clinicalSql = str_replace("\r\n", "\n", $clinicalSql);
        $clinicalChecksum = hash('sha256', $clinicalSql);
        $read->execute(['002']);
        $appliedClinical = $read->fetchColumn();
        if ($appliedClinical !== false && !hash_equals($appliedClinical, $clinicalChecksum)) {
            throw new RuntimeException('O arquivo da versão 002 foi alterado.');
        }
        if ($appliedClinical === false) {
            foreach (explode(';', $clinicalSql) as $statement) {
                if (trim($statement) !== '') $db->exec($statement);
            }
            $db->beginTransaction();
            try {
                $count = (new ClinicalStore($db))->importLegacy();
                $db->prepare('INSERT INTO cf_schema_migrations(version,checksum) VALUES(?,?)')->execute(['002',$clinicalChecksum]);
                $db->commit();
                echo "Pacientes migrados e conferidos: $count.\n";
            } catch (Throwable $failure) {
                $db->rollBack();
                throw $failure;
            }
        }
        foreach (['003'=>'003-invites.sql','004'=>'004-registration.sql','005'=>'005-patient-admins.sql'] as $version=>$file) {
            $sql = file_get_contents(__DIR__.'/'.$file);
            if ($sql === false) throw new RuntimeException('SQL ausente.');
            $sql = str_replace("\r\n", "\n", $sql);
            $checksum = hash('sha256', $sql);
            $read->execute([$version]);
            $applied = $read->fetchColumn();
            if ($applied !== false && !hash_equals($applied,$checksum)) throw new RuntimeException('Migração aplicada foi alterada.');
            if ($applied === false) {
                $db->exec($sql);
                $db->prepare('INSERT INTO cf_schema_migrations(version,checksum) VALUES(?,?)')->execute([$version,$checksum]);
            }
        }
        echo "Esquemas 001 a 005 confirmados.\n";
    } finally {
        $q = $db->prepare('SELECT RELEASE_LOCK(?)');
        $q->execute([$lock]);
    }
} catch (Throwable $error) {
    fwrite(STDERR, 'Não foi possível confirmar a migração. Código: '.($error instanceof PDOException ? $error->getCode() : 'CONFIG_SCHEMA').PHP_EOL);
    exit(1);
}
