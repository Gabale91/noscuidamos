<?php
declare(strict_types=1);

final class ClinicalStore
{
    private const COLLECTIONS = ['appointments', 'meds', 'history', 'family'];
    private const FIELDS = [
        'type' => 'record_type', 'status' => 'record_status',
        'notes' => 'pre_notes', 'postNotes' => 'post_notes',
    ];

    public function __construct(private PDO $db) {}

    public function read(string $patient): stdClass
    {
        $rows = $this->db->prepare('SELECT metadata AS payload,NULL AS category,0 AS ordinal,NULL AS record_type,NULL AS record_status,NULL AS pre_notes,NULL AS post_notes
            FROM cf_clinical_state WHERE patient=?
            UNION ALL
            SELECT properties,category,ordinal,record_type,record_status,pre_notes,post_notes
            FROM cf_clinical_records WHERE patient=?
            ORDER BY category,ordinal');
        $rows->execute([$patient,$patient]);
        $data = null;
        foreach ($rows as $row) {
            $record = json_decode($row['payload'], false, 512, JSON_THROW_ON_ERROR);
            if ($row['category'] === null) {
                $data = $record;
                continue;
            }
            if (is_object($record)) {
                foreach (self::FIELDS as $field => $column) {
                    if ($row[$column] !== null) $record->$field = $row[$column];
                }
            }
            $category = $row['category'];
            $data->{$category}[] = $record;
        }
        if ($data === null) throw new RuntimeException('Esquema clínico pendente.');
        return $data;
    }

    public function write(string $patient, stdClass $data): void
    {
        if (!$this->db->inTransaction()) throw new LogicException('Gravação clínica exige transação.');
        $metadata = clone $data;
        foreach (self::COLLECTIONS as $category) {
            if (isset($metadata->$category) && is_array($metadata->$category)) $metadata->$category = [];
        }
        $state = $this->db->prepare('INSERT INTO cf_clinical_state(patient,metadata) VALUES(?,?) ON DUPLICATE KEY UPDATE metadata=VALUES(metadata)');
        $state->execute([$patient, json_encode($metadata, JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION)]);
        $clear = $this->db->prepare('DELETE FROM cf_clinical_records WHERE patient=?');
        $clear->execute([$patient]);
        $insert = $this->db->prepare('INSERT INTO cf_clinical_records(patient,category,ordinal,record_id,record_type,record_status,scheduled_date,pre_notes,post_notes,properties) VALUES(?,?,?,?,?,?,?,?,?,?)');
        foreach (self::COLLECTIONS as $category) {
            if (!isset($data->$category) || !is_array($data->$category)) continue;
            foreach ($data->$category as $ordinal => $original) {
                $record = is_object($original) ? clone $original : $original;
                $id = $record->id ?? null;
                $id = is_int($id) || (is_string($id) && strlen($id)<=100) ? (string)$id : null;
                $date = $record->date ?? null;
                $date = is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date) ? DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
                $date = $date && $date->format('Y-m-d') === $record->date && (int)$date->format('Y') >= 1000 ? $record->date : null;
                $columns = [];
                foreach (self::FIELDS as $field => $column) {
                    $value = $record->$field ?? null;
                    $limit = in_array($field, ['type','status'], true) ? 32 : 16777215;
                    $columns[$column] = is_string($value) && strlen($value) <= $limit ? $value : null;
                    if ($columns[$column] !== null) unset($record->$field);
                }
                $insert->execute([$patient,$category,$ordinal,$id,$columns['record_type'],$columns['record_status'],$date,$columns['pre_notes'],$columns['post_notes'],json_encode($record,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION)]);
            }
        }
    }

    public function importLegacy(): int
    {
        $count = 0;
        $patients = $this->db->query('SELECT p.id,p.snapshot FROM cf_patients p LEFT JOIN cf_clinical_state s ON s.patient=p.id WHERE s.patient IS NULL FOR UPDATE')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($patients as $patient) {
            $original = json_decode($patient['snapshot'], false, 512, JSON_THROW_ON_ERROR);
            $this->write($patient['id'], $original);
            if (self::canonical($original) !== self::canonical($this->read($patient['id']))) {
                throw new RuntimeException('Divergência na migração clínica.');
            }
            ++$count;
        }
        return $count;
    }

    public static function sameRecord(array $left, array $right): bool
    {
        $normalize = static fn(array $value) => json_decode(json_encode((object)$value, JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION), false, 512, JSON_THROW_ON_ERROR);
        return self::canonical($normalize($left)) === self::canonical($normalize($right));
    }

    private static function canonical(mixed $value): array
    {
        if (is_array($value)) return ['array', array_map(self::canonical(...), $value)];
        if (!is_object($value)) return [gettype($value), $value];
        $properties = get_object_vars($value);
        ksort($properties, SORT_STRING);
        return ['object', array_map(self::canonical(...), $properties)];
    }
}
