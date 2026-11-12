import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import net from 'node:net';
import http from 'node:http';
// Fully consume each response, including rejected large multipart requests.
async function fetch(url,options={}){const req=new Request(url,options),body=req.body?Buffer.from(await req.arrayBuffer()):null;return new Promise((resolve,reject)=>{const headers=Object.fromEntries(req.headers);if(body)headers['content-length']=String(body.length);const r=http.request(url,{method:req.method,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response([204,304].includes(res.statusCode)?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));res.on('error',reject);});r.on('error',reject);r.end(body);});}

test('PHP/MySQL: HTTP, upload privado, autorização e revogação', {skip:!process.env.PHP_TEST_DSN,timeout:60000}, async()=>{
 const php=process.env.PHP_TEST_BIN||'php',args=process.env.PHP_TEST_EXT?['-d','extension_dir='+process.env.PHP_TEST_EXT,'-d','extension=pdo_mysql','-d','extension=fileinfo','-d','extension=openssl']:[];
 const tmp=resolve('data/php-http');await mkdir(tmp,{recursive:true});await mkdir(tmp+'/files',{recursive:true});
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const origin='http://127.0.0.1:'+port;
 const webOrigin='https://homologacao.example.test';
 const config={dsn:process.env.PHP_TEST_DSN,db_user:process.env.PHP_TEST_USER||'root',db_password:process.env.PHP_TEST_PASSWORD||'',origin:webOrigin,storage:tmp+'/files',terms_version:'test-1',privacy_version:'test-1',smtp:{password:'fixture'}};
 await writeFile(tmp+'/config.php',`<?php if(($_SERVER['HTTP_X_FIXTURE_TLS']??'')==='1') $_SERVER['HTTPS']='on'; $config=json_decode(base64_decode('${Buffer.from(JSON.stringify(config)).toString('base64')}'),true); $config['mail_transport']=static function($smtp,$to,$subject,$text){file_put_contents(__DIR__.'/message.txt',$text);}; return $config;`);
 const child=spawn(php,[...args,'-d','upload_max_filesize=10M','-d','post_max_size=12M','-S','127.0.0.1:'+port,'-t',resolve('release/locaweb-php/public'),resolve('release/locaweb-php/public/index.php')],{env:{...process.env,CUIDADO_PRIVATE:resolve('release/locaweb-php/private'),CUIDADO_CONFIG:tmp+'/config.php'},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',d=>logs+=d);
 const users=[];const api=async(path,body,cookie='',headers={})=>{const r=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{Origin:webOrigin,...(body instanceof FormData?{}:{'Content-Type':'application/json'})}),Cookie:cookie,...headers},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return {r,data:await r.json()};};
 try{
  for(let i=0;i<80;i++){try{const r=await fetch(origin+'/healthz');if(r.ok)break;if(i===79)throw Error(await r.text());}catch(e){if(i===79)throw Error(String(e)+' '+logs);}await new Promise(r=>setTimeout(r,100));}
  async function account(prefix,mobile=false){
    const headers=mobile?{Origin:'https://localhost','X-NC-Android':'1','X-Fixture-TLS':'1'}:{};
    const email=prefix+'-'+crypto.randomUUID()+'@example.test', password='Teste1!';
    const {r,data}=await api('register',{name:prefix,email,password,confirmPassword:password,accepted:true,termsVersion:'test-1',privacyVersion:'test-1'},'',headers);
    assert.equal(r.status,202,JSON.stringify(data));
    assert.equal(r.headers.get('set-cookie'),null);
    assert.equal((await api('login',{email,password},'',headers)).r.status,401);
    const code=(await readFile(tmp+'/message.txt','utf8')).match(/\b[A-Z0-9]{6}\b/)[0];
    const verified=await api('register/confirm',{registrationToken:data.registrationToken,code},'',headers);
    assert.equal(verified.r.status,201,JSON.stringify(verified.data));
    assert.equal(verified.r.headers.get('set-cookie'),null);
    const login=await api('login',{email,password},'',headers);
    assert.equal(login.r.status,200,JSON.stringify(login.data));
    if(mobile){
      assert.equal(login.r.headers.get('set-cookie'),null);
      assert.match(login.data.sessionToken,/^[a-f0-9]{64}$/);
      return {...headers,Authorization:'Bearer '+login.data.sessionToken};
    }
    assert.equal(login.data.sessionToken,undefined);
    const cookie=login.r.headers.get('set-cookie').split(';')[0];
    users.push(cookie);
    return cookie;
  }
  const mobile=await account('android',true);
  assert.equal((await api('mobile/context',undefined,'',mobile)).r.status,200);
  assert.equal((await api('mobile/context',undefined,'',{Authorization:mobile.Authorization})).r.status,401);
  assert.equal((await api('mobile/context',undefined,'',{...mobile,'X-Fixture-TLS':'0'})).r.status,403);
  const preflight=await fetch(origin+'/api/mobile/context',{method:'OPTIONS',headers:{Origin:'https://localhost','X-Fixture-TLS':'1'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'https://localhost');
  const mobilePatient={id:'android-p1',name:'Paciente Android',data:{appointments:[{id:'android-a1',type:'Consulta',name:'Consulta fictícia',date:'2026-12-20',time:'08:00',status:'Agendado'}],meds:[],family:[]}};
  assert.equal((await api('notifications/sync',{batch:crypto.randomUUID(),revision:0,patients:[mobilePatient]},'',mobile)).r.status,200);
  assert.equal((await api('mobile/context',undefined,'',mobile)).data.patients[0].data.appointments[0].id,'android-a1');
  assert.equal((await api('logout',{},'',mobile)).r.status,200);
  assert.equal((await api('mobile/context',undefined,'',mobile)).r.status,401);
  const owner=await account('owner'),relative=await account('relative'),outsider=await account('outsider');
  assert.equal((await api('logout',{},owner,{Origin:'https://evil.example'})).r.status,403);
  assert.equal((await fetch(origin+'/api/logout',{headers:{Cookie:owner}})).status,405);
  const patient={id:'p1',name:'Paciente </script><script>alert(1)</script>',data:{appointments:[{id:'a1',type:'Exame',name:'Sangue',date:'2026-12-20',time:'08:00',status:'Agendado'}],meds:[],family:[]}};
  assert.equal((await api('notifications/sync',{batch:crypto.randomUUID(),revision:0,patients:[patient]},owner)).r.status,200);
  const state=(await api('notifications/state',undefined,owner)).data,patientId=state.patients[0].id;
  const code=(await api('notifications/patient-code?patient='+encodeURIComponent(patientId),undefined,owner)).data.code;
  assert.equal((await api('notifications/join-patient',{code},relative)).r.status,200);
  assert.equal((await api('notifications/join-patient',{code},outsider)).r.status,404);
  assert.equal((await api('notifications/shared-patient?patient='+encodeURIComponent(patientId),undefined,outsider)).r.status,403);
  assert.equal((await api('notifications/patient-code?patient='+encodeURIComponent(patientId),undefined,relative)).r.status,403);
  assert.equal((await api('notifications/revoke',{patient:patientId,userId:(await api('me',undefined,relative)).data.user.id},outsider)).r.status,403);
  const pdf=Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(2_000_000,32),Buffer.from('\n%%EOF')]);
  const upload=async(blob,name,cookie=owner)=>{const f=new FormData();f.set('patient',patientId);f.set('record','a1');f.set('kind','result');f.set('file',new Blob([blob]),name);return api('files/upload',f,cookie);};
  const file=await upload(pdf,'resultado.pdf');assert.equal(file.r.status,201,JSON.stringify(file.data));assert.equal(file.data.size,pdf.length);
  assert.equal((await api('files/list?patient='+encodeURIComponent(patientId),undefined,outsider)).r.status,403);
  assert.equal((await api('files/list?patient='+encodeURIComponent(patientId),undefined,relative)).data.files.length,1);
  assert.equal((await upload(Buffer.from('<?php echo 1;'),'arquivo.pdf')).r.status,400);
  assert.equal((await upload(pdf,'resultado.pdf',relative)).r.status,403);
  assert.equal((await upload(Buffer.alloc(10_000_001),'grande.pdf')).r.status,400);
  assert.equal((await fetch(origin+file.data.url)).status,401);
  assert.equal((await fetch(origin+file.data.url,{headers:{Cookie:outsider}})).status,403);
  const allowed=await fetch(origin+file.data.url,{headers:{Cookie:relative}});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('content-type'),'application/pdf');assert.deepEqual(Buffer.from(await allowed.arrayBuffer()),pdf);
  assert.equal((await api('notifications/revoke',{patient:patientId,userId:(await api('me',undefined,relative)).data.user.id},owner)).r.status,200);
  assert.equal((await fetch(origin+file.data.url,{headers:{Cookie:relative}})).status,403);
  const page=await(await fetch(origin+'/app',{headers:{Cookie:owner}})).text();assert.ok(page.includes('phpSaved'));assert.ok(!page.includes('Paciente </script><script>alert(1)</script>'));assert.ok(page.includes('php-files.js'));
  for(const asset of ['auth-ui.js','notifications-ui.js','php-files.js'])assert.equal((await fetch(origin+'/'+asset)).status,200);
  assert.equal((await fetch(origin+'/../private/config.example.php')).status,404);
  assert.equal((await fetch(origin+'/schema.sql')).status,404);
  assert.equal((await fetch(origin+'/migrate.php')).status,404);
  const loginPage=await fetch(origin+'/');
  assert.match(loginPage.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(loginPage.headers.get('content-security-policy'),/script-src 'self';/);
  assert.match(await loginPage.text(),/rel="icon" href="\/icon\.svg"/);
  const icon=await fetch(origin+'/icon.svg');
  assert.equal(icon.status,200);
  assert.match(icon.headers.get('content-type'),/^image\/svg\+xml/);
  assert.equal((await api('config')).data.googleConfigured,false);
 } finally {
  for(const cookie of users)try{await api('delete-account',{confirmation:'EXCLUIR',currentPassword:'Teste1!'},cookie);}catch{}
  child.kill();
 }
});
