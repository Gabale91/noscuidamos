<?php
declare(strict_types=1);

final class HttpError extends RuntimeException {
    public function __construct(string $message, public int $status = 400) { parent::__construct($message); }
}
function fail(string $message, int $status = 400): never { throw new HttpError($message, $status); }
function uid(): string { return bin2hex(random_bytes(16)); }
function secret(): string { return bin2hex(random_bytes(32)); }
function nowms(): int { return (int) floor(microtime(true) * 1000); }
function digest(string $s): string { return hash('sha256', $s); }
function email_value(mixed $s): string { return strtolower(trim(is_string($s) ? $s : '')); }
function valid_password(mixed $s): bool {
    return is_string($s) && strlen($s)<=72 && !str_contains($s,"\0") &&
        preg_match('/^.{6,}$/usD',$s) && preg_match('/[A-Z]/',$s) && preg_match('/[a-z]/',$s) &&
        preg_match('/[0-9]/',$s) && preg_match('/[^\p{L}\p{N}\s]/u',$s);
}
function secure_password_hash(string $password): string {
    return password_hash($password, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
}
function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function json_out(array $data, int $status=200): never { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit; }
function redirect_to(string $path): never { header('Location: '.$path, true, 302); exit; }

final class App {
    public PDO $db;
    public string $sessionHash;
    public ?string $mobileSession = null;
    public function __construct(public array $config, private bool $mobile=false) {
        $this->db = new PDO($config['dsn'], $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
        $authorization=$_SERVER['HTTP_AUTHORIZATION']??'';
        $token=$mobile?(preg_match('/^Bearer ([a-f0-9]{64})$/D',$authorization,$match)?$match[1]:''):(string)($_COOKIE['cf_session']??'');
        $this->sessionHash=digest(($mobile?'android:':'').$token);
    }
    public function q(string $sql, array $args=[]): PDOStatement { $q=$this->db->prepare($sql); $q->execute($args); return $q; }
    public function one(string $sql, array $args=[]): array|false { return $this->q($sql,$args)->fetch(); }
    public function tx(callable $fn): mixed { $this->db->beginTransaction();try{$r=$fn();$this->db->commit();return $r;}catch(Throwable $x){if($this->db->inTransaction())$this->db->rollBack();throw $x;} }
    public function audit(string $action, ?string $user, ?string $target=null): void { $this->q('INSERT INTO cf_audit VALUES(?,?,?,?,?)',[uid(),$user,$action,$target,nowms()]); }
    public function user(bool $consent=true): array {
        $u=$this->one('SELECT u.* FROM cf_users u JOIN cf_sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',[$this->sessionHash,nowms()]);
        if(!$u)fail('Entre novamente.',401);
        if($consent&&!$this->hasConsent($u['id']))fail('Leia e aceite os documentos atuais.',401);
        return $u;
    }
    public function hasConsent(string $user): bool { return (bool)$this->one('SELECT id FROM cf_consents WHERE user_id=? AND terms=? AND privacy=?',[$user,$this->config['terms_version'],$this->config['privacy_version']]); }
    public function consent(string $user, array $b, ?int $acceptedAt=null): void {
        if(($b['accepted']??false)!==true||($b['termsVersion']??'')!==$this->config['terms_version']||($b['privacyVersion']??'')!==$this->config['privacy_version'])fail('Leia e aceite as versões atuais dos Termos de Uso e da Política de Privacidade.');
        if(!$this->hasConsent($user))$this->q('INSERT INTO cf_consents VALUES(?,?,?,?,?)',[uid(),$user,$b['termsVersion'],$b['privacyVersion'],$acceptedAt??nowms()]);
    }
    public function cookie(string $value, int $age=0): void { if(!$this->mobile)setcookie('cf_session',$value,['expires'=>$age>0?time()+$age:($age<0?1:0),'path'=>'/','secure'=>str_starts_with($this->config['origin'],'https://'),'httponly'=>true,'samesite'=>'Lax']); }
    public function start(string $user, bool $remember): void { $t=secret();$ttl=$remember&&!$this->mobile?2592000:28800;$this->q('INSERT INTO cf_sessions(token,user_id,expires) VALUES(?,?,?)',[digest(($this->mobile?'android:':'').$t),$user,nowms()+$ttl*1000]);if($this->mobile)$this->mobileSession=$t;else $this->cookie($t,$remember?$ttl:0); }
    public function rate(string $path): void {
        $bucket=digest(($_SERVER['REMOTE_ADDR']??'').':'.$path.':'.intdiv(time(),60));
        $this->q('INSERT INTO cf_rate(bucket,hits,expires) VALUES(?,1,?) ON DUPLICATE KEY UPDATE hits=hits+1',[$bucket,nowms()+120000]);
        if((int)$this->one('SELECT hits FROM cf_rate WHERE bucket=?',[$bucket])['hits']>(str_contains($path,'notifications/')?120:20))fail('Muitas tentativas. Aguarde um minuto.',429);
        $this->q('DELETE FROM cf_rate WHERE expires<?',[nowms()]);
    }
    public function challenge(string $user,string $kind,?string $payload=null): string { $t=secret();$this->q('DELETE FROM cf_challenges WHERE user_id=? AND kind=?',[$user,$kind]);$this->q('INSERT INTO cf_challenges VALUES(?,?,?,?,?)',[digest($t),$user,$kind,$payload,nowms()+1800000]);return $t; }
    public function mailConfigured(): bool { return !empty($this->config['smtp']['password']); }
    public function send(string $to,string $subject,string $text): void {
        if(!$this->mailConfigured())fail('Envio de e-mail ainda não configurado.',503);
        $transport = $this->config['mail_transport'] ?? 'smtp_send';
        $transport($this->config['smtp'],$to,$subject,$text);
    }
    public function auth(string $path,array $b,string $method): array {
        if($path==='config')return ['termsVersion'=>$this->config['terms_version'],'privacyVersion'=>$this->config['privacy_version'],'googleConfigured'=>$this->googleConfigured(),'mailConfigured'=>$this->mailConfigured(),'build'=>'php-8.3-mysql','features'=>['patientCodes','inviteEmail','smartLinks','privateFiles','emailRegistration','patientAdministration']];
        if($path==='me'){try{$u=$this->user(false);return ['user'=>array_intersect_key($u,array_flip(['id','name','email'])),'needsConsent'=>!$this->hasConsent($u['id'])];}catch(HttpError){return ['user'=>null];}}
        if(in_array($path,['register','register/confirm','register/resend'],true))return (new Registration($this))->handle($path,$b);
        if($path==='login'){
            $u=$this->one('SELECT * FROM cf_users WHERE email=?',[email_value($b['email']??'')]);
            $password=$b['password']??'';
            $valid=is_string($password)&&strlen($password)<=128&&password_verify($password,$u['password']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi');
            if(!$valid||!$u||!$u['password'])fail('E-mail ou senha incorretos. Verifique os dados informados e tente novamente.',401);
            $this->start($u['id'],($b['remember']??false)===true);$this->audit('login',$u['id']);return ['ok'=>true,'needsConsent'=>!$this->hasConsent($u['id'])]+($this->mobileSession?['sessionToken'=>$this->mobileSession]:[]);
        }
        if($path==='forgot'){
            $email=email_value($b['email']??'');if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Informe um e-mail válido.');if(!$this->mailConfigured())fail('Envio de e-mail ainda não configurado.',503);
            $u=$this->one('SELECT id FROM cf_users WHERE email=? AND password IS NOT NULL',[$email]);
            if($u){$t=$this->challenge($u['id'],'reset');try{$this->send($email,'Redefinir senha',$this->config['origin'].'/?reset='.$t);}catch(Throwable $e){$this->q('DELETE FROM cf_challenges WHERE token=?',[digest($t)]);}}
            return ['message'=>'Se houver uma conta com senha para este e-mail, você receberá as instruções de redefinição.'];
        }
        if($path==='reset'){
            if(!valid_password($b['password']??null)||($b['password']??null)!==($b['confirmPassword']??null))fail('Informe senhas válidas e iguais.');
            $this->tx(function()use($b){$c=$this->one("SELECT * FROM cf_challenges WHERE token=? AND kind='reset' AND expires>? FOR UPDATE",[digest((string)($b['token']??'')),nowms()]);if(!$c)fail('Link inválido ou expirado.');$this->q('UPDATE cf_users SET password=? WHERE id=?',[secure_password_hash($b['password']),$c['user_id']]);$this->q('DELETE FROM cf_sessions WHERE user_id=?',[$c['user_id']]);$this->q("DELETE FROM cf_challenges WHERE user_id=? AND kind='reset'",[$c['user_id']]);$this->audit('password_reset',$c['user_id']);});return ['ok'=>true];
        }
        if($path==='google/start')return $this->googleStart($b);
        $u=$this->user(!in_array($path,['consent','logout','email/confirm','reauth/request','reauth/confirm'],true));$id=$u['id'];
        if($path==='consent'){$this->consent($id,$b);return ['ok'=>true];}
        if($path==='logout'){$this->q('DELETE FROM cf_sessions WHERE token=?',[$this->sessionHash]);$this->cookie('',-1);return ['ok'=>true];}
        if($path==='profile'&&$method==='GET')return ['user'=>['id'=>$id,'name'=>$u['name'],'email'=>$u['email'],'photo'=>$u['photo']??'','hasPassword'=>(bool)$u['password']]];
        if($path==='profile'){
            $name=trim((string)($b['name']??''));$email=email_value($b['email']??'');$photo=(string)($b['photo']??'');
            if(!$name||strlen($name)>150||!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Informe nome completo e e-mail válido.');
            if($photo){if(!preg_match('#^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$#',$photo,$m))fail('Use foto JPG ou PNG.');$raw=base64_decode($m[2],true);if($raw===false||strlen($raw)>200000||!in_array((new finfo(FILEINFO_MIME_TYPE))->buffer($raw),['image/jpeg','image/png'],true))fail('Foto inválida ou maior que 200 KB.');}
            $changed=$email!==$u['email'];
            if($changed){if($this->one('SELECT id FROM cf_users WHERE email=?',[$email]))fail('Este e-mail já está cadastrado em outra conta.',409);$t=$this->challenge($id,'email',$email);try{$this->send($email,'Confirmar novo e-mail',$this->config['origin'].'/?verifyEmail='.$t);}catch(Throwable $x){$this->q('DELETE FROM cf_challenges WHERE token=?',[digest($t)]);throw $x;}}
            $this->q('UPDATE cf_users SET name=?,photo=? WHERE id=?',[$name,$photo,$id]);$this->audit('profile_updated',$id);return ['message'=>$changed?'Nome e foto atualizados. Confirme o link enviado ao novo e-mail.':'Perfil atualizado com sucesso.'];
        }
        if(in_array($path,['email/confirm','reauth/confirm'],true)){
            $this->tx(function()use($path,$b,$id){$kind=$path==='email/confirm'?'email':'reauth';$c=$this->one('SELECT * FROM cf_challenges WHERE token=? AND user_id=? AND kind=? AND expires>? FOR UPDATE',[digest((string)($b['token']??'')),$id,$kind,nowms()]);if(!$c)fail('Link inválido ou expirado.');if($kind==='email'){if($this->one('SELECT id FROM cf_users WHERE email=? AND id<>?',[$c['payload'],$id]))fail('Este e-mail já está cadastrado em outra conta.',409);$this->q('UPDATE cf_users SET email=? WHERE id=?',[$c['payload'],$id]);}else{$this->q('UPDATE cf_sessions SET reauth_until=? WHERE token=?',[nowms()+300000,$this->sessionHash]);}$this->q('DELETE FROM cf_challenges WHERE token=?',[$c['token']]);$this->audit($kind.'_confirmed',$id);});return ['ok'=>true];
        }
        if($path==='reauth/request'){$t=$this->challenge($id,'reauth');$this->send($u['email'],'Validar identidade',$this->config['origin'].'/?reauth='.$t);return ['ok'=>true];}
        if($path==='password'){
            if(!$u['password'])fail('Esta conta usa Google. Gerencie a senha na conta Google.');
            if(!is_string($b['currentPassword']??null)||!password_verify($b['currentPassword'],$u['password']))fail('Senha atual incorreta.',401);
            if(!valid_password($b['password']??null)||($b['password']??null)!==($b['confirmPassword']??null))fail('Informe senhas válidas e iguais.');
            $this->tx(function()use($b,$id){$this->q('UPDATE cf_users SET password=? WHERE id=?',[secure_password_hash($b['password']),$id]);$this->q('DELETE FROM cf_sessions WHERE user_id=?',[$id]);$this->q("DELETE FROM cf_challenges WHERE user_id=? AND kind='reset'",[$id]);$this->audit('password_changed',$id);});$this->cookie('',-1);return ['ok'=>true];
        }
        if($path==='delete-account'){
            if(($b['confirmation']??'')!=='EXCLUIR')fail('Digite EXCLUIR para confirmar.');
            if($u['password']){if(!is_string($b['currentPassword']??null)||!password_verify($b['currentPassword'],$u['password']))fail('Senha atual incorreta.',401);}
            else{$session=$this->one('SELECT reauth_until FROM cf_sessions WHERE token=?',[$this->sessionHash]);if((int)($session['reauth_until']??0)<nowms())fail('Valide novamente sua identidade pelo e-mail.',403);}
            $files=$this->tx(function()use($id){$this->q('SELECT id FROM cf_users WHERE id=? FOR UPDATE',[$id]);if($this->one('SELECT patient FROM cf_patient_admins WHERE user_id=? AND accepted_at IS NOT NULL LIMIT 1',[$id]))fail('Solicite sua saída da administração antes de excluir a conta.',409);if($this->one('SELECT m.patient FROM cf_members m JOIN cf_patients p ON p.id=m.patient WHERE p.owner=? AND m.active=1',[$id]))fail('Revogue os vínculos dos pacientes antes de excluir a conta.',409);$f=$this->q('SELECT f.id FROM cf_files f JOIN cf_patients p ON p.id=f.patient WHERE p.owner=?',[$id])->fetchAll();$this->q('DELETE FROM cf_users WHERE id=?',[$id]);$this->q('DELETE FROM cf_audit WHERE user_id=?',[$id]);return $f;});foreach($files as $f){$p=$this->filePath($f['id']);if(is_file($p)&&!unlink($p))error_log('Cuidado: arquivo pendente de limpeza');}$this->cookie('',-1);return ['ok'=>true,'message'=>'Conta excluída do banco ativo. Cópias de segurança seguem a política de retenção do operador.'];
        }
        fail('Operação inválida.',404);
    }
    // Patient, notification and file methods are provided by the trait below.
    use PatientApi, OAuthApi;
}
