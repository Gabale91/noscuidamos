<?php
declare(strict_types=1);

trait PatientAdministration {
    private function canAdministerPatient(string $user, string $patient, string $owner): bool {
        return $user === $owner || (bool)$this->one(
            'SELECT a.user_id FROM cf_patient_admins a JOIN cf_members m ON m.patient=a.patient AND m.user_id=a.user_id WHERE a.patient=? AND a.user_id=? AND m.active=1 AND a.accepted_at IS NOT NULL',
            [$patient,$user]
        );
    }

    public function managePatient(string $actor, string $action, array $body): array {
        $id = is_string($body['patient'] ?? null) ? $body['patient'] : '';
        if ($action === 'admin-invitations') {
            return ['invitations'=>$this->q('SELECT p.id,p.name FROM cf_patient_admins a JOIN cf_patients p ON p.id=a.patient JOIN cf_members m ON m.patient=a.patient AND m.user_id=a.user_id WHERE a.user_id=? AND m.active=1 AND a.accepted_at IS NULL AND a.expires>?',[$actor,nowms()])->fetchAll()];
        }
        return $this->tx(function () use ($actor,$action,$body,$id) {
            $patient=$this->one('SELECT owner FROM cf_patients WHERE id=? FOR UPDATE',[$id]);
            if (!$patient) fail('Paciente indisponível ou acesso revogado.',403);
            $owner=$patient['owner'];
            $rows=$this->q('SELECT u.id,u.name,u.email,a.accepted_at,a.expires FROM cf_members m JOIN cf_users u ON u.id=m.user_id LEFT JOIN cf_patient_admins a ON a.patient=m.patient AND a.user_id=m.user_id WHERE m.patient=? AND m.active=1',[$id])->fetchAll();
            $members=array_column($rows,null,'id');
            $active=[$owner];
            foreach ($members as $member) {
                if ($member['accepted_at']!==null) $active[]=$member['id'];
            }
            if ($action==='admin-accept') {
                $invite=$members[$actor]??null;
                if (!$invite || $invite['accepted_at']!==null || (int)$invite['expires']<=nowms()) fail('Convite administrativo indisponível.',403);
                $this->q('UPDATE cf_patient_admins SET accepted_at=? WHERE patient=? AND user_id=?',[nowms(),$id,$actor]);
                $this->recordAdminChange($id,$actor,$actor,'admin_accepted',[...$active,$actor]);
                return ['ok'=>true];
            }
            if (!in_array($actor,$active,true)) fail('Somente administradores podem gerenciar este paciente.',403);
            if ($action==='admin-members') {
                $creator=$this->one('SELECT id,name,email FROM cf_users WHERE id=?',[$owner]);
                $creator['role']='admin';
                $result=[$creator];
                foreach ($members as $member) {
                    if ($member['id']===$owner) continue;
                    $member['role']=$member['accepted_at']!==null?'admin':((int)$member['expires']>nowms()?'pending':'family');
                    unset($member['accepted_at'],$member['expires']);
                    $result[]=$member;
                }
                return ['members'=>$result,'needsSecondAdmin'=>count(array_unique($active))<2];
            }
            $target=is_string($body['userId']??null)?$body['userId']:'';
            if ($target===$owner) fail('A saída do primeiro administrador exige transferência do cadastro.',409);
            if (!isset($members[$target])) fail('Familiar indisponível.',404);
            $isAdmin=in_array($target,$active,true);
            if ($action==='admin-invite') {
                if ($target===$actor || $isAdmin) fail('Escolha outro familiar ativo.',409);
                $this->q('INSERT INTO cf_patient_admins(patient,user_id,expires) VALUES(?,?,?) ON DUPLICATE KEY UPDATE expires=VALUES(expires)',[$id,$target,nowms()+604800000]);
                $this->recordAdminChange($id,$actor,$target,'admin_invited',[...$active,$target]);
                return ['ok'=>true];
            }
            if (!in_array($action,['admin-demote','admin-remove'],true)) fail('Operação inválida.',404);
            if (($body['confirmed']??false)!==true) fail('Confirme a alteração.');
            if ($isAdmin && count(array_unique($active))<=2) fail('O paciente deve manter pelo menos dois administradores ativos.',409);
            $this->q('DELETE FROM cf_patient_admins WHERE patient=? AND user_id=?',[$id,$target]);
            if ($action==='admin-remove') {
                $this->q('UPDATE cf_members SET active=0 WHERE patient=? AND user_id=?',[$id,$target]);
                $this->q('DELETE FROM cf_invite_limits WHERE patient=?',[$id]);
                $this->q('DELETE FROM cf_links WHERE patient=?',[$id]);
            }
            $this->recordAdminChange($id,$actor,$target,$action==='admin-remove'?'access_revoked':'admin_demoted',array_values(array_diff($active,[$target])));
            return ['ok'=>true];
        });
    }

    private function recordAdminChange(string $patient,string $actor,string $target,string $action,array $recipients): void {
        $this->audit($action,$actor,$patient);
        $this->audit($action.'_subject',$actor,$target);
        foreach (array_unique($recipients) as $recipient) {
            $this->q('INSERT INTO cf_notices(id,patient,user_id,record_id,record_type,type,title,created_at) VALUES(?,?,?,?,?,?,?,?)',
                [uid(),$patient,$recipient,'','administration',$action,'Responsabilidades do paciente atualizadas',nowms()]);
        }
    }
}
