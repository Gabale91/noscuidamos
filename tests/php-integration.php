<?php
declare(strict_types=1);
ob_start();
require __DIR__.'/../php/src/patients.php';require __DIR__.'/../php/src/oauth.php';require __DIR__.'/../php/src/core.php';require __DIR__.'/../php/src/mail.php';
// Disposable local/CI database only. Never run using production credentials.
$dsn=getenv('PHP_TEST_DSN');if(!$dsn){fwrite(STDERR,"Defina PHP_TEST_DSN para um banco vazio de testes.\n");exit(2);}
$config=['dsn'=>$dsn,'db_user'=>getenv('PHP_TEST_USER')?:'root','db_password'=>getenv('PHP_TEST_PASSWORD')?:'','origin'=>'http://127.0.0.1:8083','terms_version'=>'test-1','privacy_version'=>'test-1','smtp'=>['password'=>''],'storage'=>__DIR__.'/../data/php-test-files'];
@mkdir($config['storage'],0700,true);$a=new App($config);$a->db->exec(file_get_contents(__DIR__.'/../php/schema.sql'));
$passed=0;
function check(bool $ok,string $label):void{global $passed;if(!$ok)throw new RuntimeException('FALHOU: '.$label);$passed++;echo "OK {$label}\n";}
function rejected(callable $fn,int $status,string $label):void{try{$fn();}catch(HttpError $e){check($e->status===$status,$label);return;}throw new RuntimeException('Aceitou indevidamente: '.$label);}
function register_test(App $a,string $name,string $email):array{$b=['name'=>$name,'email'=>$email,'password'=>'Ab1','confirmPassword'=>'Ab1','accepted'=>true,'termsVersion'=>'test-1','privacyVersion'=>'test-1'];$a->auth('register',$b,'POST');$u=$a->one('SELECT * FROM cf_users WHERE email=?',[$email]);$t=secret();$a->q('INSERT INTO cf_sessions(token,user_id,expires) VALUES(?,?,?)',[digest($t),$u['id'],nowms()+60000]);return [$u,digest($t),$b];}
$suffix=uid();[$owner,$ownerSession,$registration]=register_test($a,'Responsável','owner-'.$suffix.'@example.test');[$relative,$relativeSession]=register_test($a,'Familiar','relative-'.$suffix.'@example.test');[$outsider,$outsiderSession]=register_test($a,'Outro','other-'.$suffix.'@example.test');$a->sessionHash=$ownerSession;
try{
check($a->hasConsent($owner['id']),'aceite versionado persistido');check(password_verify('Ab1',$owner['password'])&&$owner['password']!=='Ab1','senha protegida');
rejected(fn()=>$a->googleStart([]),503,'Google indisponível sem configuração');
rejected(fn()=>$a->auth('register',$registration,'POST'),409,'e-mail duplicado rejeitado');
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
$info=$a->info($owner['id'],$patientId);check(str_contains($info['message'],'💚')&&str_contains($info['link'],'/convite/'),'convite UTF-8 com link');
$a->notifications($owner['id'],'revoke',['patient'=>$patientId,'userId'=>$relative['id']]);rejected(fn()=>$a->shared($relative['id'],$patientId),403,'revogação imediata');rejected(fn()=>$a->join($outsider['id'],$code),404,'código antigo invalidado');check(!$a->one('SELECT id FROM cf_links WHERE patient=?',[$patientId]),'link antigo removido');
$badConfig=$config;$badConfig['storage']=__DIR__;$_SERVER['DOCUMENT_ROOT']=__DIR__;$badApp=new App($badConfig);rejected(fn()=>$badApp->storageRoot(),503,'pasta pública recusada para anexos');unset($_SERVER['DOCUMENT_ROOT']);
$a->sessionHash=$ownerSession;rejected(fn()=>$a->auth('profile',['name'=>'Responsável','email'=>$relative['email'],'photo'=>''],'POST'),409,'troca para e-mail ocupado rejeitada');
$a->auth('logout',[],'POST');rejected(fn()=>$a->user(),401,'logout invalida sessão');$a->sessionHash=$relativeSession;$a->auth('password',['currentPassword'=>'Ab1','password'=>'Cd2','confirmPassword'=>'Cd2'],'POST');rejected(fn()=>$a->user(),401,'troca de senha invalida sessões');
$a->sessionHash=$outsiderSession;rejected(fn()=>$a->auth('delete-account',['confirmation'=>'EXCLUIR','currentPassword'=>'wrong'],'POST'),401,'exclusão exige autenticação');$a->auth('delete-account',['confirmation'=>'EXCLUIR','currentPassword'=>'Ab1'],'POST');check(!$a->one('SELECT id FROM cf_users WHERE id=?',[$outsider['id']]),'exclusão remove conta');
echo "PASSOU: {$passed} verificações PHP/MySQL\n";
}finally{foreach([$owner,$relative,$outsider] as $u){$a->q('DELETE FROM cf_users WHERE id=?',[$u['id']]);$a->q('DELETE FROM cf_audit WHERE user_id=?',[$u['id']]);}}
