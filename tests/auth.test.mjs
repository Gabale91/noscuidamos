import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthServer, LEGAL_VERSION } from '../server/auth.mjs';
const registration = { name:'Usuária Teste',email:'teste@example.test',password:'Senha ficticia 123!',confirmPassword:'Senha ficticia 123!',accepted:true,termsVersion:LEGAL_VERSION,privacyVersion:LEGAL_VERSION };
async function fixture(options={}) {
  const messages=[];
  const server=await createAuthServer({dbPath:':memory:',origin:'http://localhost:3000',sendMail:async message=>messages.push(message),...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,body,cookie){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost:3000',...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});return {response,data:response.headers.get('content-type')?.includes('json')?await response.json():await response.text(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  return {server,request,messages,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('cadastro valida aceite, duplicidade, senhas, sessão e proteção do aplicativo',async()=>{
  const f=await fixture();
  try{
    assert.equal((await f.request('/app')).response.status,302);
    assert.equal((await f.request('/api/register',{...registration,accepted:false})).response.status,400);
    assert.equal((await f.request('/api/register',{...registration,confirmPassword:'divergente'})).response.status,400);
    assert.equal((await f.request('/api/register',{...registration,email:'incorreto'})).response.status,400);
    const registered=await f.request('/api/register',registration);
    assert.equal(registered.response.status,201);
    assert.match(registered.response.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
    assert.doesNotMatch(registered.response.headers.get('set-cookie'),/Max-Age/);
    assert.equal((await f.request('/api/register',{...registration,email:' TESTE@EXAMPLE.TEST '})).response.status,409);
    const me=await f.request('/api/me',undefined,registered.cookie);
    assert.equal(me.data.needsConsent,false);assert.equal(me.data.user.email,registration.email);
    assert.equal((await f.request('/app',undefined,registered.cookie)).response.status,200);
    const wrong=await f.request('/api/login',{email:registration.email,password:'senha errada'});
    assert.equal(wrong.data.error,'E-mail ou senha incorretos. Verifique os dados informados e tente novamente.');
    const remembered=await f.request('/api/login',{email:registration.email,password:registration.password,remember:true});
    assert.match(remembered.response.headers.get('set-cookie'),/Max-Age=2592000/);
    await f.request('/api/logout',{},remembered.cookie);
    assert.equal((await f.request('/api/me',undefined,remembered.cookie)).data.user,null);
    assert.equal((await f.request('/api/login',{email:registration.email,password:registration.password})).response.status,200);
  }finally{await f.close();}
});
test('senha exige ao menos 3 caracteres, uma maiúscula e um número',async()=>{
  const f=await fixture();try{
    for(const password of ['A1','abc','123','ab1','ABC']){
      assert.equal((await f.request('/api/register',{...registration,password,confirmPassword:password})).response.status,400);
    }
    assert.equal((await f.request('/api/register',{...registration,password:'Ab1',confirmPassword:'Ab1'})).response.status,201);
  }finally{await f.close();}
});
test('recuperação por e-mail usa token de uso único e revoga sessões',async()=>{
  const f=await fixture();try{
    const registered=await f.request('/api/register',registration);
    assert.equal((await f.request('/api/forgot',{email:registration.email})).response.status,200);
    const token=new URL(f.messages[0].link).searchParams.get('reset');
    const reset={token,password:'Nova senha ficticia1!',confirmPassword:'Nova senha ficticia1!'};
    assert.equal((await f.request('/api/reset',reset)).response.status,200);
    assert.equal((await f.request('/api/reset',reset)).response.status,400);
    assert.equal((await f.request('/api/me',undefined,registered.cookie)).data.user,null);
    assert.equal((await f.request('/api/login',{email:registration.email,password:registration.password})).response.status,401);
    assert.equal((await f.request('/api/login',{email:registration.email,password:reset.password})).response.status,200);
  }finally{await f.close();}
});
test('perfil confirma novo e-mail; exclusão exige palavra e senha atual',async()=>{
  const f=await fixture();try{
    const {cookie}=await f.request('/api/register',registration);
    const profile=await f.request('/api/profile',{name:'Nome alterado',email:'novo@example.test',photo:''},cookie);
    assert.equal(profile.response.status,200);
    assert.equal((await f.request('/api/me',undefined,cookie)).data.user.email,registration.email);
    const token=new URL(f.messages[0].link).searchParams.get('verifyEmail');
    assert.equal((await f.request('/api/email/confirm',{token},cookie)).response.status,200);
    assert.equal((await f.request('/api/me',undefined,cookie)).data.user.email,'novo@example.test');
    assert.equal((await f.request('/api/delete-account',{confirmation:'excluir',currentPassword:registration.password},cookie)).response.status,400);
    assert.equal((await f.request('/api/delete-account',{confirmation:'EXCLUIR',currentPassword:'incorreta'},cookie)).response.status,401);
    assert.equal((await f.request('/api/delete-account',{confirmation:'EXCLUIR',currentPassword:registration.password},cookie)).response.status,200);
    assert.equal((await f.request('/api/me',undefined,cookie)).data.user,null);
  }finally{await f.close();}
});
test('e-mail ocupado bloqueia envio e alteração; confirmação revalida disponibilidade',async()=>{
  const f=await fixture();try{
    const {cookie}=await f.request('/api/register',registration);
    await f.request('/api/register',{...registration,email:'ocupado@example.test'});
    const blocked=await f.request('/api/profile',{name:'Não salvar',email:' OCUPADO@EXAMPLE.TEST ',photo:''},cookie);
    assert.equal(blocked.response.status,409);
    assert.match(blocked.data.error,/cadastrado em outra conta/);
    assert.equal(f.messages.length,0);
    assert.equal((await f.request('/api/me',undefined,cookie)).data.user.email,registration.email);
    assert.equal((await f.request('/api/me',undefined,cookie)).data.user.name,registration.name);
    await f.request('/api/profile',{name:registration.name,email:'disponivel@example.test',photo:''},cookie);
    const token=new URL(f.messages[0].link).searchParams.get('verifyEmail');
    await f.request('/api/register',{...registration,email:'disponivel@example.test'});
    assert.equal((await f.request('/api/email/confirm',{token},cookie)).response.status,409);
    assert.equal((await f.request('/api/me',undefined,cookie)).data.user.email,registration.email);
  }finally{await f.close();}
});
test('API de notificações persiste e isola a leitura por conta autenticada',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/api/notifications/list')).response.status,401);
    const {cookie}=await f.request('/api/register',registration);
    const other=await f.request('/api/register',{...registration,email:'outra@example.test'});
    const body={batch:'first',revision:0,patients:[{id:'p1',name:'Paciente teste',data:{appointments:[],family:[],meds:[{id:1,name:'Medicamento teste',status:'Em uso'}]}}]};
    assert.equal((await f.request('/api/notifications/sync',body,cookie)).response.status,200);
    const list=await f.request('/api/notifications/list',undefined,cookie);
    assert.equal(list.data.unread,1);
    assert.equal((await f.request('/api/notifications/list',undefined,other.cookie)).data.unread,0);
    const id=list.data.items[0].id;
    assert.equal((await f.request('/api/notifications/details?id='+id,undefined,other.cookie)).response.status,403);
    await f.request('/api/notifications/read',{id},cookie);
    assert.equal((await f.request('/api/notifications/list',undefined,cookie)).data.unread,0);
    assert.equal((await f.request('/api/notifications/sync',body,cookie)).data.duplicate,true);
  }finally{await f.close();}
});
test('primeiro cadastro com código acessa paciente original e código inválido não cria conta',async()=>{
  const f=await fixture();try{
    const owner=await f.request('/api/register',registration);
    await f.request('/api/notifications/sync',{batch:'patient',revision:0,patients:[{id:'p1',name:'Paciente original',data:{appointments:[{id:10,name:'Consulta original',status:'Agendado'}],meds:[],family:[]}}]},owner.cookie);
    const state=await f.request('/api/notifications/state',undefined,owner.cookie),patient=state.data.patients[0].id;
    const code=await f.request('/api/notifications/patient-code?patient='+patient,undefined,owner.cookie);
    const bad=await f.request('/api/register',{...registration,email:'familiar@example.test',patientCode:'errado'});
    assert.equal(bad.response.status,400);
    const member=await f.request('/api/register',{...registration,email:'familiar@example.test',patientCode:code.data.code});
    assert.equal(member.response.status,201);
    const shared=await f.request('/api/notifications/shared-patients',undefined,member.cookie);
    assert.equal(shared.data.patients.length,1);
    const original=await f.request('/api/notifications/shared-patient?patient='+patient,undefined,member.cookie);
    assert.equal(original.data.data.appointments[0].name,'Consulta original');
    assert.equal((await f.request('/api/notifications/state',undefined,member.cookie)).data.patients.length,0);
  }finally{await f.close();}
});
test('convite tem modelo solicitado, link inteligente, envio por e-mail e bloqueio de outro usuário',async()=>{
  const f=await fixture({publicOrigin:'https://app.example.test',playStoreUrl:'https://play.google.com/store/apps/details?id=br.exemplo.cuidado'});try{
    const owner=await f.request('/api/register',registration);
    const other=await f.request('/api/register',{...registration,email:'familiar@example.test'});
    await f.request('/api/notifications/sync',{batch:'sharing',revision:0,patients:[{id:'p1',name:'Paciente Exemplo',data:{appointments:[],meds:[],family:[]}}]},owner.cookie);
    const state=await f.request('/api/notifications/state',undefined,owner.cookie),patient=state.data.patients[0].id;
    const share=await f.request('/api/notifications/share-invite?patient='+patient,undefined,owner.cookie);
    assert.match(share.data.message,/💚 \*Você recebeu um convite!\*/);
    assert.match(share.data.message,/\*Paciente Exemplo\*/);
    assert.match(share.data.message,/Cadastre-se no aplicativo e utilize o código/);
    assert.match(share.data.link,/^https:\/\/app.example.test\/convite\//);
    assert.match(share.data.message,/Código de vinculação/);
    assert.equal((await f.request('/api/notifications/send-invite',{patient,email:'familia@example.test'},owner.cookie)).response.status,200);
    assert.equal(f.messages.length,1);assert.equal(f.messages[0].to,'familia@example.test');assert.equal(f.messages[0].text,share.data.message);
    assert.equal((await f.request('/api/notifications/send-invite',{patient,email:'alguem@example.test'},other.cookie)).response.status,403);
    const landing=await f.request(new URL(share.data.link).pathname);
    assert.equal(landing.response.status,200);assert.match(landing.data,/Baixar na Google Play/);
    const play=await fetch(`http://127.0.0.1:${f.server.address().port}`+new URL(share.data.link).pathname,{headers:{'User-Agent':'Android'},redirect:'manual'});
    assert.equal(play.status,302);assert.equal(play.headers.get('location'),'https://play.google.com/store/apps/details?id=br.exemplo.cuidado');
  }finally{await f.close();}
});
test('novo aceite é exigido para versão atual e configuração indisponível não simula envio',async()=>{
  const f=await fixture({termsVersion:'v2',privacyVersion:'v2'});try{
    assert.equal((await f.request('/api/register',registration)).response.status,400);
    const {cookie}=await f.request('/api/register',{...registration,termsVersion:'v2',privacyVersion:'v2'});
    assert.equal((await f.request('/api/consent',{accepted:false,termsVersion:'v2',privacyVersion:'v2'},cookie)).response.status,400);
  }finally{await f.close();}
  const noMail=await createAuthServer({dbPath:':memory:',origin:'http://localhost:3000'});
  await new Promise(resolve=>noMail.listen(0,'127.0.0.1',resolve));
  try{const response=await fetch(`http://127.0.0.1:${noMail.address().port}/api/forgot`,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'teste@example.test'})});assert.equal(response.status,503);}finally{await new Promise(resolve=>noMail.close(resolve));}
});
