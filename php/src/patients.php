<?php
declare(strict_types=1);
require_once __DIR__.'/clinical.php';
require_once __DIR__.'/patient-administration.php';
trait PatientApi {
    use PatientAdministration;
    private function clinicalData(string $id): array {
        $data = (new ClinicalStore($this->db))->read($id);
        return json_decode(json_encode($data, JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION), true, 512, JSON_THROW_ON_ERROR);
    }
    public function patient(string $user,string $id,bool $owner=false): array {
        $p=$this->one('SELECT id,owner,local_id,name,code FROM cf_patients WHERE id=?',[$id]);
        if(!$p||($p['owner']!==$user&&($owner||!$this->one('SELECT patient FROM cf_members WHERE patient=? AND user_id=? AND active=1',[$id,$user]))))fail('Paciente indisponível ou acesso revogado.',403);
        return $p;
    }
    public function shared(string $user,string $id): array { $p=$this->patient($user,$id);return ['id'=>$p['id'],'name'=>$p['name'],'localId'=>$p['local_id'],'isOwner'=>$p['owner']===$user,'data'=>$this->clinicalData($p['id'])]; }
    public function join(string $user,string $code): array {
        $code=strtoupper(preg_replace('/[\s-]/','',$code));if(!preg_match('/^[A-F0-9]{20}$/',$code))fail('Código inválido.');
        $consume=function () use ($user,$code) {
            $p=$this->one('SELECT id,owner,name FROM cf_patients WHERE code=? FOR UPDATE',[$code]);
            if(!$p)fail('Código inválido, expirado ou utilizado.',404);
            $limit=$this->one('SELECT code_hash,expires,used_at FROM cf_invite_limits WHERE patient=? FOR UPDATE',[$p['id']]);
            if(!$limit || !hash_equals($limit['code_hash'],digest($code)) || (int)$limit['expires']<=nowms()) {
                fail('Código inválido, expirado ou utilizado.',404);
            }
            if($p['owner']!==$user && !$this->one('SELECT user_id FROM cf_members WHERE patient=? AND user_id=? AND active=1',[$p['id'],$user])){
                if($limit['used_at']!==null)fail('Código inválido, expirado ou utilizado.',404);
                $this->q('INSERT INTO cf_members(patient,user_id,active) VALUES(?,?,1) ON DUPLICATE KEY UPDATE active=1',[$p['id'],$user]);
                $this->q('UPDATE cf_invite_limits SET used_at=? WHERE patient=?',[nowms(),$p['id']]);
                $this->audit('patient_joined',$user,$p['id']);
            }
            return ['ok'=>true,'patient'=>$p['id'],'name'=>$p['name']];
        };
        return $this->db->inTransaction()?$consume():$this->tx($consume);
    }
    public function patientCode(string $user,string $id): array {
        return $this->tx(function () use ($user,$id) {
            $p=$this->one('SELECT code,owner FROM cf_patients WHERE id=? FOR UPDATE',[$id]);
            if(!$p||!$this->canAdministerPatient($user,$id,$p['owner']))fail('Paciente indisponível ou acesso revogado.',403);
            $code=$p['code'];
            $limit=$this->one('SELECT code_hash,expires,used_at FROM cf_invite_limits WHERE patient=? FOR UPDATE',[$id]);
            if($limit && $limit['used_at']===null && (int)$limit['expires']>nowms() && hash_equals($limit['code_hash'],digest($code))){
                return ['patient'=>$id,'code'=>implode('-',str_split($code,4)),'expiresAt'=>(int)$limit['expires']];
            }
            $code=strtoupper(bin2hex(random_bytes(10)));
            $expires=nowms()+7*86400000;
            $this->q('UPDATE cf_patients SET code=? WHERE id=?',[$code,$id]);
            $this->q('DELETE FROM cf_links WHERE patient=?',[$id]);
            $this->q('INSERT INTO cf_invite_limits(patient,code_hash,expires,used_at) VALUES(?,?,?,NULL) ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires=VALUES(expires),used_at=NULL',[$id,digest($code),$expires]);
            return ['patient'=>$id,'code'=>implode('-',str_split($code,4)),'expiresAt'=>$expires];
        });
    }
    public function info(string $user,string $id): array {
        $p=$this->patient($user,$id);$code=$this->patientCode($user,$id)['code'];$h=digest($code);
        $l=$this->one('SELECT id FROM cf_links WHERE patient=? AND code_hash=?',[$id,$h]);
        if(!$l){$l=['id'=>secret()];$this->q('INSERT INTO cf_links VALUES(?,?,?)',[$l['id'],$id,$h]);}
        $link=$this->config['origin'].'/convite/'.$l['id'];$name=preg_replace('/[\r\n*]/',' ',$p['name']);
        $message="💚 *Você recebeu um convite!*\n\nOlá! 👋\n\nVocê foi convidado para acompanhar os cuidados de saúde de *{$name}* pelo nosso aplicativo.\n\n📲 *Baixe o app:*\n{$link}\n\n🔐 *Código de vinculação:*\n{$code}\n\nCadastre-se no aplicativo e utilize o código para vincular o paciente.\n\n💚 *Cuidar de quem amamos é melhor juntos!*";
        return ['patientId'=>$id,'patientName'=>$p['name'],'code'=>$code,'link'=>$link,'message'=>$message,'publicConfigured'=>str_starts_with($link,'https://'),'storeConfigured'=>!empty($this->config['play_store_url'])];
    }
    public function emit(string $patient,array $record,string $type,string $title,string $recordType='appointment'): void {
        $p=$this->one('SELECT owner FROM cf_patients WHERE id=?',[$patient]);$recipients=[$p['owner']];
        foreach($this->q('SELECT user_id FROM cf_members WHERE patient=? AND active=1',[$patient]) as $m)$recipients[]=$m['user_id'];
        foreach(array_unique($recipients) as $u)$this->q('INSERT INTO cf_notices(id,patient,user_id,record_id,record_type,type,title,created_at) VALUES(?,?,?,?,?,?,?,?)',[uid(),$patient,$u,(string)$record['id'],$recordType,$type,$title,nowms()]);
    }
    public function reconcile(string $patient,array $old,array $new,bool $baseline): void {
        foreach(['appointments','meds'] as $collection){$previous=[];foreach($old[$collection]??[] as $r)$previous[(string)$r['id']]=$r;
            foreach($new[$collection] as $r){$o=$previous[(string)$r['id']]??null;$type='';$title='';
                if(!$o){if($baseline)continue;$type=$collection==='meds'?'medication_created':'appointment_created';$title=$collection==='meds'?'Medicamento cadastrado':'Novo agendamento';}
                elseif(!ClinicalStore::sameRecord($r,$o)){
                    if($collection==='meds'){$type=($r['status']??'')==='Suspenso'?'medication_suspended':'medication_updated';$title=$type==='medication_suspended'?'Medicamento suspenso':'Medicamento atualizado';}
                    elseif(($r['status']??'')!==($o['status']??'')){$type=($r['status']??'')==='Realizado'?'appointment_completed':'appointment_cancelled';$title=$type==='appointment_completed'?'Atendimento realizado':'Agendamento cancelado';}
                    elseif(($r['results']??[])!==($o['results']??[])){$type='result_added';$title='Resultado de exame incluído';}
                    elseif(($r['postNotes']??'')!==($o['postNotes']??'')||($r['postDocuments']??[])!==($o['postDocuments']??[])){$type='post_updated';$title='Pós-atendimento atualizado';}
                    else{$type='appointment_rescheduled';$title='Agendamento atualizado';}
                }
                if($type)$this->emit($patient,$r,$type,$title,$collection==='meds'?'medication':'appointment');
            }
        }
    }
    public function validateRecords(array $data,array $old): void {
        foreach(['appointments','meds','family'] as $key)if(!isset($data[$key])||!is_array($data[$key])||count($data[$key])>10000)fail('Registros inválidos.');
        foreach(['appointments','meds'] as $key){$previous=[];foreach($old[$key]??[] as $o)$previous[(string)$o['id']]=$o;$seen=[];
            foreach($data[$key] as $r){if(!is_array($r)||!preg_match('/^[A-Za-z0-9_-]{1,100}$/',(string)($r['id']??'')))fail('Identificador inválido.');$id=(string)$r['id'];if(isset($seen[$id]))fail('Registro duplicado.');$seen[$id]=true;$o=$previous[$id]??null;
                foreach($key==='appointments'?['date']:['start'] as $d){if(!empty($r[$d])){$date=DateTimeImmutable::createFromFormat('!Y-m-d',(string)$r[$d]);if(!$date||$date->format('Y-m-d')!==$r[$d])fail('Data inválida. Use ano com quatro dígitos.');}}
                if($key==='meds'&&$o&&($o['status']??'')==='Suspenso'&&!ClinicalStore::sameRecord($r,$o))fail('Medicamentos suspensos não podem ser alterados.',409);
                if($key==='appointments'&&$o&&($o['status']??'')==='Realizado')foreach(['status','date','time','companion','companionAtCompletion'] as $f)if(($r[$f]??null)!==($o[$f]??null))fail('Atendimento realizado preserva data, horário e acompanhante.',409);
                if($key==='appointments'&&($r['type']??'')==='Consulta'&&!empty($r['results']))fail('Resultados são anexados somente a exames.');
            }
            foreach($previous as $id=>$o)if(!isset($seen[$id])&&(($key==='meds'&&($o['status']??'')==='Suspenso')||($key==='appointments'&&($o['status']??'')==='Realizado')))fail('Registros encerrados devem ser preservados.',409);
        }
    }
    public function sync(string $user,array $b): array {
        if(!is_string($b['batch']??null)||strlen($b['batch'])>100||!is_int($b['revision']??null)||!is_array($b['patients']??null)||count($b['patients'])>500)fail('Sincronização inválida.');
        return $this->tx(function()use($user,$b){
            $s=$this->one('SELECT revision FROM cf_sync WHERE user_id=? FOR UPDATE',[$user]);if(!$s){$this->q('INSERT INTO cf_sync VALUES(?,0)',[$user]);$s=['revision'=>0];}$rev=(int)$s['revision'];
            if($this->one('SELECT batch FROM cf_batches WHERE user_id=? AND batch=?',[$user,$b['batch']]))return ['revision'=>$rev,'duplicate'=>true];
            if($rev!==$b['revision'])fail('Os dados foram atualizados em outra sessão. Recarregue antes de sincronizar.',409);
            // Serialize the owner's patient snapshots to also enforce companion conflicts across patients.
            $this->q('SELECT id FROM cf_users WHERE id=? FOR UPDATE',[$user]);$ids=[];$all=[];
            foreach($this->q('SELECT id,local_id FROM cf_patients WHERE owner=?',[$user]) as $p)$all[$p['local_id']]=$this->clinicalData($p['id']);
            foreach($b['patients'] as $p){if(!is_array($p)||!preg_match('/^[A-Za-z0-9_-]{1,100}$/',(string)($p['id']??''))||!is_string($p['name']??null)||!trim($p['name'])||!is_array($p['data']??null))fail('Paciente inválido.');$local=(string)$p['id'];if(isset($ids[$local]))fail('Paciente duplicado.');$ids[$local]=true;$this->validateRecords($p['data'],$all[$local]??[]);$all[$local]=$p['data'];}
            $patients=[];$companions=[];
            foreach($all as $pid=>$data)foreach($data['appointments']??[] as $a){if(($a['status']??'')!=='Agendado')continue;$when=($a['date']??'').' '.($a['time']??'');if(isset($patients[$pid.':'.$when]))fail('O paciente já possui agendamento nesse dia e horário.',409);$patients[$pid.':'.$when]=true;$c=trim((string)($a['companion']??''));if($c!==''){if(isset($companions[$c.':'.$when]))fail('O acompanhante já possui agendamento nesse dia e horário.',409);$companions[$c.':'.$when]=true;}}
            foreach($b['patients'] as $p){$id=$user.':'.$p['id'];$old=$this->one('SELECT id FROM cf_patients WHERE id=?',[$id])?$this->clinicalData($id):[];$data=json_encode($p['data'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
                $this->q('INSERT INTO cf_patients(id,owner,local_id,name,snapshot,code) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),snapshot=VALUES(snapshot)',[$id,$user,(string)$p['id'],$p['name'],$data,strtoupper(bin2hex(random_bytes(10)))]);
                (new ClinicalStore($this->db))->write($id,json_decode($data,false,512,JSON_THROW_ON_ERROR));
                $this->reconcile($id,$old,$p['data'],($b['baseline']??false)===true&&$rev===0);
            }
            $this->q('UPDATE cf_sync SET revision=? WHERE user_id=?',[$rev+1,$user]);$this->q('INSERT INTO cf_batches VALUES(?,?)',[$user,$b['batch']]);$this->audit('clinical_sync',$user);return ['revision'=>$rev+1];
        });
    }
    public function notices(string $user): array {
        $items=$this->q('SELECT n.*,p.name AS patient_name FROM cf_notices n JOIN cf_patients p ON p.id=n.patient WHERE n.user_id=? AND (p.owner=? OR EXISTS(SELECT 1 FROM cf_members m WHERE m.patient=p.id AND m.user_id=? AND m.active=1)) ORDER BY n.created_at DESC,n.id DESC LIMIT 500',[$user,$user,$user])->fetchAll();
        foreach($items as &$i){$i['created_at']=(int)$i['created_at'];$i['read_at']=$i['read_at']?(int)$i['read_at']:null;$i['body']='Há uma atualização. Entre no aplicativo para conferir.';}unset($i);
        return ['items'=>$items,'unread'=>count(array_filter($items,fn($i)=>!$i['read_at'])),'pushConfigured'=>false];
    }
    public function notifications(string $user,string $action,array $b): array {
        $patient=(string)($b['patient']??$_GET['patient']??'');
        if(str_starts_with($action,'admin-'))return $this->managePatient($user,$action,$b);
        if($action==='sync')return $this->sync($user,$b);
        if($action==='list')return $this->notices($user);
        if($action==='state'){$p=$this->q('SELECT id,name FROM cf_patients WHERE owner=? ORDER BY name',[$user])->fetchAll();foreach($p as &$row){$row['members']=$this->q('SELECT m.user_id,m.active,u.name,u.email FROM cf_members m JOIN cf_users u ON u.id=m.user_id WHERE patient=?',[$row['id']])->fetchAll();foreach($row['members'] as &$m)$m['active']=(int)$m['active'];unset($m);}unset($row);return ['revision'=>(int)($this->one('SELECT revision FROM cf_sync WHERE user_id=?',[$user])['revision']??0),'patients'=>$p,'push'=>[]];}
        if($action==='owned-patients')return ['patients'=>array_map(fn($p)=>$this->shared($user,$p['id']),$this->q('SELECT id FROM cf_patients WHERE owner=?',[$user])->fetchAll())];
        if($action==='patient-code')return $this->patientCode($user,$patient);
        if($action==='share-invite')return $this->info($user,$patient);
        if($action==='join-patient')return $this->join($user,(string)($b['code']??''));
        if($action==='shared-patients')return ['patients'=>$this->q('SELECT p.id,p.name FROM cf_patients p JOIN cf_members m ON m.patient=p.id WHERE m.user_id=? AND m.active=1 AND p.owner<>?',[$user,$user])->fetchAll()];
        if($action==='shared-patient')return $this->shared($user,$patient);
        if($action==='revoke')return $this->managePatient($user,'admin-remove',['patient'=>$patient,'userId'=>$b['userId']??null,'confirmed'=>true]);
        if($action==='send-invite'){$email=email_value($b['email']??'');if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Informe um e-mail válido.');$i=$this->info($user,$patient);$this->send($email,'Você recebeu um convite — Nós Cuidamos',$i['message']);$this->audit('invite_email_submitted',$user,$patient);return ['message'=>'Convite aceito pelo serviço de e-mail para envio.'];}
        if($action==='read'){if(($b['id']??'')==='all')$this->q('UPDATE cf_notices SET read_at=COALESCE(read_at,?) WHERE user_id=?',[nowms(),$user]);else $this->q('UPDATE cf_notices SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',[nowms(),(string)($b['id']??''),$user]);return ['ok'=>true];}
        if($action==='details'){$n=$this->one('SELECT * FROM cf_notices WHERE id=? AND user_id=?',[(string)($_GET['id']??''),$user]);if(!$n)fail('Notificação indisponível.',404);$p=$this->shared($user,$n['patient']);foreach($p['data'][$n['record_type']==='medication'?'meds':'appointments']??[] as $r)if((string)$r['id']===$n['record_id'])return ['patient'=>['name'=>$p['name'],'localId'=>$p['localId'],'isOwner'=>$p['isOwner']],'record'=>$r,'type'=>$n['record_type']];fail('Registro indisponível.',404);}
        if(in_array($action,['device','push-details'],true))fail('Push móvel não habilitado na hospedagem PHP. Use a central de notificações.',503);
        fail('Operação de notificações inválida.',404);
    }
    public function storageRoot(): string {
        $configured=$this->config['storage']??null;
        $root=is_string($configured)&&trim($configured)!==''?realpath($configured):false;
        $web=realpath($_SERVER['DOCUMENT_ROOT']??dirname(__DIR__).'/public');
        if(!$root||!$web||!is_dir($root)||!is_writable($root)||strtolower($root)===strtolower($web)||str_starts_with(strtolower($root).DIRECTORY_SEPARATOR,strtolower($web).DIRECTORY_SEPARATOR))fail('Configure uma pasta privada gravável fora da raiz pública para os anexos.',503);
        return $root;
    }
    public function filePath(string $id): string { if(!preg_match('/^[a-f0-9]{64}$/',$id))fail('Arquivo inválido.');return $this->storageRoot().DIRECTORY_SEPARATOR.$id.'.bin'; }
    public function upload(string $user,array $b): array {
        $patient=(string)($b['patient']??'');$p=$this->patient($user,$patient,true);$record=(string)($b['record']??'');$kind=(string)($b['kind']??'');
        if(!in_array($kind,['result','prescription','exam_order'],true))fail('Tipo de documento inválido.');
        $data=$this->clinicalData($p['id']);$a=null;foreach($data['appointments']??[] as $r)if((string)$r['id']===$record)$a=$r;
        if(!$a||($kind==='result'&&($a['type']??'')!=='Exame')||($kind!=='result'&&(($a['type']??'')!=='Consulta'||($a['status']??'')!=='Realizado')))fail('Documento incompatível com o atendimento.');
        $f=$_FILES['file']??null;if(!$f||$f['error']!==UPLOAD_ERR_OK||!is_uploaded_file($f['tmp_name'])||$f['size']<1||$f['size']>10000000)fail('Selecione um arquivo de até 10 MB.');
        $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);if(!in_array($mime,['application/pdf','image/jpeg','image/png'],true))fail('Use PDF, JPG ou PNG.');
        $id=secret();$path=$this->filePath($id);$name=substr(basename(str_replace('\\','/',$f['name'])),0,240);$name=preg_replace('/[\x00-\x1f\x7f]/','',$name);
        if(!move_uploaded_file($f['tmp_name'],$path))fail('Não foi possível armazenar o arquivo.',503);@chmod($path,0600);
        try{$this->tx(function()use($id,$patient,$user,$record,$kind,$name,$mime,$f){$this->patient($user,$patient,true);$this->q('INSERT INTO cf_files VALUES(?,?,?,?,?,?,?,?,?)',[$id,$patient,$user,$record,$kind,$name,$mime,$f['size'],nowms()]);$this->audit('file_uploaded',$user,$id);});}catch(Throwable $x){@unlink($path);throw $x;}
        return ['id'=>$id,'fileName'=>$name,'type'=>$mime,'size'=>(int)$f['size'],'url'=>'/api/files/download?id='.$id];
    }
    public function download(string $user,string $id): never {
        $f=$this->one('SELECT * FROM cf_files WHERE id=?',[$id]);if(!$f)fail('Arquivo indisponível.',404);$this->patient($user,$f['patient']);$path=$this->filePath($id);if(!is_file($path))fail('Arquivo indisponível.',404);
        $this->audit('file_downloaded',$user,$id);header('Content-Type: '.$f['mime']);header('Content-Length: '.filesize($path));header("Content-Disposition: attachment; filename=\"documento\"; filename*=UTF-8''".rawurlencode($f['name']));readfile($path);exit;
    }
}
