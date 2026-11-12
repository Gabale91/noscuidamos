<?php
declare(strict_types=1);
ob_start();
require __DIR__.'/../php/src/patients.php';require __DIR__.'/../php/src/oauth.php';require __DIR__.'/../php/src/core.php';require __DIR__.'/../php/src/mail.php';
// Disposable local/CI database only. Never run using production credentials.
$dsn=getenv('PHP_TEST_DSN');if(!$dsn){fwrite(STDERR,"Defina PHP_TEST_DSN para um banco vazio de testes.\n");exit(2);}
$config=['dsn'=>$dsn,'db_user'=>getenv('PHP_TEST_USER')?:'root','db_password'=>getenv('PHP_TEST_PASSWORD')?:'','origin'=>'http://127.0.0.1:8083','terms_version'=>'test-1','privacy_version'=>'test-1','smtp'=>['password'=>''],'storage'=>__DIR__.'/../data/php-test-files'];
@mkdir($config['storage'],0700,true);$a=new App($config);$a->db->exec(file_get_contents(__DIR__.'/../php/schema.sql'));$a->db->exec(file_get_contents(__DIR__.'/../php/002-clinical.sql'));
$a->db->exec(file_get_contents(__DIR__.'/../php/003-invites.sql'));
require __DIR__.'/../php/src/registration.php';
$a->db->exec(file_get_contents(__DIR__.'/../php/004-registration.sql'));
$messages=[];
$a->config['smtp']['password']='fixture';
$a->config['mail_transport']=function($smtp,$to,$subject,$text)use(&$messages){$messages[$to]=$text;};
$a->db->exec(file_get_contents(__DIR__.'/../php/005-patient-admins.sql'));
$passed=0;
function check(bool $ok,string $label):void{global $passed;if(!$ok)throw new RuntimeException('FALHOU: '.$label);$passed++;echo "OK {$label}\n";}
function rejected(callable $fn,int $status,string $label):void{try{$fn();}catch(HttpError $e){check($e->status===$status,$label);return;}throw new RuntimeException('Aceitou indevidamente: '.$label);}
function register_test(App $a,string $name,string $email):array{$b=['name'=>$name,'email'=>$email,'password'=>'Teste1!','confirmPassword'=>'Teste1!','accepted'=>true,'termsVersion'=>'test-1','privacyVersion'=>'test-1'];global $messages;
$token=$a->auth('register',$b,'POST')['registrationToken'];
check(!$a->one('SELECT id FROM cf_users WHERE email=?',[$email]),'conta ausente antes da confirmação');
preg_match('/\b[A-Z0-9]{6}\b/',$messages[$email],$m);
check(isset($m[0]),'código alfanumérico enviado ao transporte');
rejected(fn()=>$a->auth('register/resend',['registrationToken'=>$token],'POST'),429,'reenviar antes de 60 segundos bloqueado');
rejected(fn()=>$a->auth('register/confirm',['registrationToken'=>$token,'code'=>'AAAAAA'],'POST'),400,'código incorreto rejeitado');
check($a->auth('register/confirm',['registrationToken'=>$token,'code'=>$m[0]],'POST')['message']==='Conta criada com sucesso!','conta confirmada');
rejected(fn()=>$a->auth('register/confirm',['registrationToken'=>$token,'code'=>$m[0]],'POST'),400,'código reutilizado rejeitado');
$u=$a->one('SELECT * FROM cf_users WHERE email=?',[$email]);$t=secret();$a->q('INSERT INTO cf_sessions(token,user_id,expires) VALUES(?,?,?)',[digest($t),$u['id'],nowms()+60000]);return [$u,digest($t),$b];}
$suffix=uid();[$owner,$ownerSession,$registration]=register_test($a,'Responsável','owner-'.$suffix.'@example.test');[$relative,$relativeSession]=register_test($a,'Familiar','relative-'.$suffix.'@example.test');[$outsider,$outsiderSession]=register_test($a,'Outro','other-'.$suffix.'@example.test');$a->sessionHash=$ownerSession;
try{
check($a->hasConsent($owner['id']),'aceite versionado persistido');check(password_verify('Teste1!',$owner['password'])&&$owner['password']!=='Teste1!','senha protegida');
$key = openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_RSA,'private_key_bits'=>2048]);
$b64 = static fn(string $bytes) => rtrim(strtr(base64_encode($bytes),'+/','-_'),'=');
$now = time();
$claims = ['iss'=>'https://accounts.google.com','aud'=>'client-test','iat'=>$now,'exp'=>$now+60,'nonce'=>'nonce-test','sub'=>'subject-test','email'=>'google@example.test','email_verified'=>true];
$jwtBody = $b64(json_encode(['alg'=>'RS256','kid'=>'test'])).'.'.$b64(json_encode($claims));
openssl_sign($jwtBody,$signature,$key,OPENSSL_ALGO_SHA256);
$jwt = $jwtBody.'.'.$b64($signature);
$keys = ['test'=>openssl_pkey_get_details($key)['key']];
check(google_token_claims($jwt,$keys,'client-test','nonce-test',$now)['sub']==='subject-test','ID token assinado aceito');
foreach ([['other','nonce-test',$now],['client-test','other',$now],['client-test','nonce-test',$now+61]] as [$audience,$nonce,$clock]) {
    $invalid = false;
    try { google_token_claims($jwt,$keys,$audience,$nonce,$clock); }
    catch (UnexpectedValueException) { $invalid = true; }
    check($invalid,'ID token recusado por público, nonce ou validade');
}
rejected(fn()=>$a->googleStart([]),503,'Google indisponível sem configuração');
$a->auth('register',$registration,'POST');
check(str_contains($messages[$registration['email']],'Já existe'),'duplicidade informada somente por e-mail');
$pending=$registration;
$pending['email']='pending-'.$suffix.'@example.test';
$token=$a->auth('register',$pending,'POST')['registrationToken'];
for ($i=0;$i<5;$i++) rejected(fn()=>$a->auth('register/confirm',['registrationToken'=>$token,'code'=>'AAAAAA'],'POST'),400,'tentativa incorreta');
preg_match('/\b[A-Z0-9]{6}\b/',$messages[$pending['email']],$oldCode);
rejected(fn()=>$a->auth('register/confirm',['registrationToken'=>$token,'code'=>$oldCode[0]],'POST'),400,'código bloqueado na quinta falha');
$a->q('UPDATE cf_pending_registrations SET resend_at=0,expires=? WHERE token=?',[nowms()-1,digest($token)]);
rejected(fn()=>$a->auth('register/confirm',['registrationToken'=>$token,'code'=>$oldCode[0]],'POST'),400,'código expirado');
$next=$a->auth('register/resend',['registrationToken'=>$token],'POST')['registrationToken'];
$corrected='corrected-'.$suffix.'@example.test';
$next=$a->auth('register/resend',['registrationToken'=>$next,'email'=>$corrected],'POST')['registrationToken'];
preg_match('/\b[A-Z0-9]{6}\b/',$messages[$corrected],$newCode);
check($a->auth('register/confirm',['registrationToken'=>$next,'code'=>$newCode[0]],'POST')['message']==='Conta criada com sucesso!','correção preservou os dados');
check(!$a->one('SELECT id FROM cf_users WHERE email=?',[$pending['email']]),'endereço anterior ficou sem conta');
$failed=$registration;
$failed['email']='failure-'.$suffix.'@example.test';
$transport=$a->config['mail_transport'];
$a->config['mail_transport']=static function(){fail('Falha fictícia',503);};
rejected(fn()=>$a->auth('register',$failed,'POST'),503,'falha de entrega tratada');
$a->config['mail_transport']=$transport;
check(!$a->one('SELECT token FROM cf_pending_registrations WHERE email=?',[$failed['email']]),'falha de entrega não deixa código ativo');

$bad=$registration;$bad['email']='no-consent-'.$suffix.'@example.test';$bad['accepted']=false;rejected(fn()=>$a->auth('register',$bad,'POST'),400,'cadastro sem aceite rejeitado');check(!$a->one('SELECT id FROM cf_users WHERE email=?',[$bad['email']]),'cadastro inválido revertido');
rejected(fn()=>$a->auth('login',['email'=>$owner['email'],'password'=>'wrong'],'POST'),401,'login incorreto rejeitado');
$patient=['id'=>'p1','name'=>'Paciente <script>','data'=>['appointments'=>[['id'=>'a1','type'=>'Consulta','name'=>'Clínico','date'=>'2026-12-10','time'=>'10:00','status'=>'Agendado','companion'=>'Familiar']],'meds'=>[['id'=>'m1','name'=>'Teste','status'=>'Em uso','start'=>'2026-11-08']],'family'=>[]]];
$batch=['batch'=>uid(),'revision'=>0,'patients'=>[$patient]];$r=$a->sync($owner['id'],$batch);check($r['revision']===1,'snapshot persistido');check($a->sync($owner['id'],$batch)['duplicate']===true,'lote repetido idempotente');
$patientId=$owner['id'].':p1';rejected(fn()=>$a->shared($outsider['id'],$patientId),403,'conta não autorizada bloqueada');$code=$a->patientCode($owner['id'],$patientId)['code'];$a->join($relative['id'],$code);check($a->shared($relative['id'],$patientId)['data']['appointments'][0]['id']==='a1','familiar lê mesmo paciente');
rejected(fn()=>$a->patientCode($relative['id'],$patientId),403,'familiar não administra código');
$stale=['batch'=>uid(),'revision'=>0,'patients'=>[$patient]];rejected(fn()=>$a->sync($owner['id'],$stale),409,'revisão desatualizada rejeitada');
$dup=$patient;$dup['data']['appointments'][]=$dup['data']['appointments'][0];$dup['data']['appointments'][1]['id']='a2';rejected(fn()=>$a->sync($owner['id'],['batch'=>uid(),'revision'=>1,'patients'=>[$dup]]),409,'horário duplicado do paciente rejeitado');
$p2=$patient;$p2['id']='p2';rejected(fn()=>$a->sync($owner['id'],['batch'=>uid(),'revision'=>1,'patients'=>[$patient,$p2]]),409,'acompanhante em dois pacientes rejeitado');
$invalid=$patient;$invalid['data']['appointments'][0]['date']='662026-11-06';rejected(fn()=>$a->sync($owner['id'],['batch'=>uid(),'revision'=>1,'patients'=>[$invalid]]),400,'ano de seis dígitos rejeitado');
$patient['data']['appointments'][0]['status']='Realizado';$patient['data']['appointments'][0]['companionAtCompletion']='Familiar';$patient['data']['meds'][0]['status']='Suspenso';$a->sync($owner['id'],['batch'=>uid(),'revision'=>1,'patients'=>[$patient]]);
$changed=$patient;$changed['data']['appointments'][0]['companion']='Outro';rejected(fn()=>$a->sync($owner['id'],['batch'=>uid(),'revision'=>2,'patients'=>[$changed]]),409,'acompanhante realizado preservado');
$changed=$patient;$changed['data']['meds'][0]['name']='Alterado';rejected(fn()=>$a->sync($owner['id'],['batch'=>uid(),'revision'=>2,'patients'=>[$changed]]),409,'medicamento suspenso imutável');
$patient['data']['appointments'][0]['postNotes']='x';$a->sync($owner['id'],['batch'=>uid(),'revision'=>2,'patients'=>[$patient]]);check($a->shared($owner['id'],$patientId)['data']['appointments'][0]['postNotes']==='x','pós-atendimento sem tamanho mínimo');
check($a->notices($relative['id'])['unread']>0,'notificações persistidas para familiar');
check($a->one("SELECT post_notes FROM cf_clinical_records WHERE patient=? AND category='appointments' AND record_id='a1'",[$patientId])['post_notes']==='x','observação em coluna relacional');
rejected(fn()=>$a->join($outsider['id'],$code),404,'convite utilizado não vincula outra conta');
$info=$a->info($owner['id'],$patientId);check(str_contains($info['message'],'💚')&&str_contains($info['link'],'/convite/'),'convite UTF-8 com link');
$a->notifications($owner['id'],'revoke',['patient'=>$patientId,'userId'=>$relative['id']]);rejected(fn()=>$a->shared($relative['id'],$patientId),403,'revogação imediata');rejected(fn()=>$a->join($outsider['id'],$code),404,'código antigo invalidado');check(!$a->one('SELECT id FROM cf_links WHERE patient=?',[$patientId]),'link antigo removido');
$subject=['patient'=>$patientId,'userId'=>$relative['id']];
check($a->managePatient($owner['id'],'admin-members',$subject)['needsSecondAdmin'],'criador é administrador e configuração inicia pendente');
$a->join($relative['id'],$a->patientCode($owner['id'],$patientId)['code']);
rejected(fn()=>$a->managePatient($relative['id'],'admin-invite',$subject),403,'familiar não promove administradores');
$a->managePatient($owner['id'],'admin-invite',$subject);
check($a->managePatient($owner['id'],'admin-members',$subject)['needsSecondAdmin'],'convite pendente não conta como administrador');
rejected(fn()=>$a->managePatient($outsider['id'],'admin-accept',$subject),403,'terceiro não aceita convite direcionado');
$a->managePatient($relative['id'],'admin-accept',$subject);
check(!$a->managePatient($relative['id'],'admin-members',$subject)['needsSecondAdmin'],'segundo administrador ativo após aceite');
rejected(fn()=>$a->managePatient($owner['id'],'admin-remove',$subject+['confirmed'=>true]),409,'bloqueia remoção abaixo de dois administradores');
$a->join($outsider['id'],$a->patientCode($owner['id'],$patientId)['code']);
$third=['patient'=>$patientId,'userId'=>$outsider['id']];
$a->managePatient($relative['id'],'admin-invite',$third);
$a->managePatient($outsider['id'],'admin-accept',$third);
rejected(fn()=>$a->managePatient($relative['id'],'admin-demote',$third),400,'rebaixamento exige confirmação');
$a->managePatient($relative['id'],'admin-demote',$third+['confirmed'=>true]);
check($a->shared($outsider['id'],$patientId)['id']===$patientId,'rebaixamento preserva vínculo de familiar');
$a->managePatient($relative['id'],'admin-remove',$third+['confirmed'=>true]);
rejected(fn()=>$a->shared($outsider['id'],$patientId),403,'administrador adicional revoga acesso');
check((bool)$a->one('SELECT id FROM cf_users WHERE id=?',[$outsider['id']]),'revogação preserva a conta');
check((bool)$a->one("SELECT id FROM cf_audit WHERE action='admin_demoted' AND user_id=? AND target=?",[$relative['id'],$patientId]),'mudança de papel registrada em auditoria');
$badConfig=$config;$badConfig['storage']=__DIR__;$_SERVER['DOCUMENT_ROOT']=__DIR__;$badApp=new App($badConfig);rejected(fn()=>$badApp->storageRoot(),503,'pasta pública recusada para anexos');unset($_SERVER['DOCUMENT_ROOT']);
$a->sessionHash=$ownerSession;rejected(fn()=>$a->auth('profile',['name'=>'Responsável','email'=>$relative['email'],'photo'=>''],'POST'),409,'troca para e-mail ocupado rejeitada');
$a->auth('logout',[],'POST');rejected(fn()=>$a->user(),401,'logout invalida sessão');$a->sessionHash=$relativeSession;$a->auth('password',['currentPassword'=>'Teste1!','password'=>'Nova2!','confirmPassword'=>'Nova2!'],'POST');rejected(fn()=>$a->user(),401,'troca de senha invalida sessões');
$a->sessionHash=$outsiderSession;rejected(fn()=>$a->auth('delete-account',['confirmation'=>'EXCLUIR','currentPassword'=>'wrong'],'POST'),401,'exclusão exige autenticação');$a->auth('delete-account',['confirmation'=>'EXCLUIR','currentPassword'=>'Teste1!'],'POST');check(!$a->one('SELECT id FROM cf_users WHERE id=?',[$outsider['id']]),'exclusão remove conta');
echo "PASSOU: {$passed} verificações PHP/MySQL\n";
}finally{foreach([$owner,$relative,$outsider] as $u){$a->q('DELETE FROM cf_users WHERE id=?',[$u['id']]);$a->q('DELETE FROM cf_audit WHERE user_id=?',[$u['id']]);}}
