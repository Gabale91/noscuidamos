import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createNotifications, reminderTimes } from '../server/notifications.mjs';
const start=Date.parse('2026-11-05T12:00:00Z');
function fixture(push){const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE);INSERT INTO users VALUES('owner','Responsável','owner@example.test'),('one','Acompanhante','one@example.test'),('two','Outro','two@example.test')");let now=start;const service=createNotifications(db,{now:()=>now,sendPush:push});let revision=0,batch=0;const snapshot={appointments:[],meds:[],family:[{name:'Ana',email:'one@example.test'},{name:'Bia',email:'two@example.test'}]};const sync=(baseline=false)=>{const body={batch:String(++batch),revision,baseline,patients:[{id:'p1',name:'Paciente',data:snapshot}]};const result=service.sync('owner',body);revision=result.revision;return body;};const invite=user=>{const email=user==='one'?'one@example.test':'two@example.test';const code=service.invite('owner',{patient:'owner:p1',email});service.accept(user,{token:code.token});};return {db,service,snapshot,sync,invite,time:value=>{now=value;}};}
const appointment=()=>({id:10,type:'Exame',name:'Exame teste',date:'2026-11-10',time:'10:00',timezone:'America/Sao_Paulo',status:'Agendado',companion:'Ana',results:[]});
test('programa 72h/24h/2h em São Paulo, sem retroativos e sem datas impossíveis',()=>{
  const times=reminderTimes('2026-11-10','10:00','America/Sao_Paulo',start);
  assert.equal(times.length,3);assert.equal(new Date(times[0].at).toISOString(),'2026-11-07T13:00:00.000Z');
  assert.equal(reminderTimes('2026-11-05','10:00','America/Sao_Paulo',start).length,0);
  assert.equal(reminderTimes('2026-02-30','10:00','America/Sao_Paulo',start).length,0);
});
test('criação/reagendamento não geram sino; push só ao selecionado e lote é idempotente',()=>{
  const f=fixture();try{f.sync(true);f.invite('one');f.invite('two');f.snapshot.appointments.push(appointment());const body=f.sync();assert.equal(f.service.list('owner').items.length,0);assert.equal(f.service.list('one').items.length,0);assert.equal(f.service.queueStatus('one').length,4);assert.equal(f.service.queueStatus('two').length,0);f.service.sync('owner',body);assert.equal(f.service.queueStatus('one').length,4);f.snapshot.appointments[0].date='2026-11-11';f.sync();assert.equal(f.service.list('one').items.length,0);assert.equal(f.db.prepare("SELECT count(*) n FROM n_push WHERE status='Programada' AND type LIKE 'reminder_%'").get().n,3);}finally{f.db.close();}
});
test('cancelamento notifica autorizados, revoga lembretes e leitura é individual',()=>{
  const f=fixture();try{f.sync(true);f.invite('one');f.snapshot.appointments.push(appointment());f.sync();f.snapshot.appointments[0].status='Cancelado';f.sync();const owner=f.service.list('owner'),member=f.service.list('one');assert.equal(owner.unread,1);assert.equal(member.unread,1);assert.equal(f.service.list('two').unread,0);f.service.read('one',member.items[0].id);assert.equal(f.service.list('one').unread,0);assert.equal(f.service.list('owner').unread,1);assert.equal(f.db.prepare("SELECT count(*) n FROM n_push WHERE type LIKE 'reminder%' AND status='Programada'").get().n,0);f.service.revoke('owner',{patient:'owner:p1',userId:'one'});assert.equal(f.service.list('one').items.length,0);assert.throws(()=>f.service.details('one',member.items[0].id));assert.throws(()=>f.service.read('two',owner.items[0].id));assert.throws(()=>f.service.invite('two',{patient:'owner:p1',email:'x@example.test'}));}finally{f.db.close();}
});
test('medicamentos, pós-atendimento e resultados geram eventos após persistência',()=>{
  const f=fixture();try{f.sync(true);f.snapshot.meds.push({id:1,name:'Teste',status:'Em uso',amount:'1'});f.sync();f.snapshot.meds[0].amount='2';f.sync();f.snapshot.meds[0].status='Suspenso';f.sync();f.snapshot.meds[0].status='Concluído';f.sync();f.snapshot.appointments.push(appointment());f.sync();f.snapshot.appointments[0].status='Realizado';f.sync();f.snapshot.appointments[0].postNotes='Informação';f.sync();f.snapshot.appointments[0].results.push({name:'Arquivo',fileName:'exame.pdf'});f.sync();assert.equal(f.service.list('owner').items.length,7);assert.equal(f.service.details('owner',f.service.list('owner').items[0].id).record.results.length,1);}finally{f.db.close();}
});
test('troca de acompanhante cancela anteriores e não gera notificações internas',()=>{
  const f=fixture();try{f.sync(true);f.invite('one');f.invite('two');f.snapshot.appointments.push(appointment());f.sync();f.snapshot.appointments[0].companion='Bia';f.sync();assert.equal(f.service.list('owner').items.length,0);assert.equal(f.db.prepare("SELECT count(*) n FROM n_push WHERE user_id='one' AND status='Programada' AND type LIKE 'reminder%'").get().n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM n_push WHERE user_id='two' AND status='Programada' AND type LIKE 'reminder%'").get().n,3);}finally{f.db.close();}
});
test('sem provedor não simula envio; worker exige dispositivo e vínculo',async()=>{
  const f=fixture();try{f.sync(true);f.invite('one');f.snapshot.appointments.push(appointment());f.sync();await f.service.work();assert.equal(f.db.prepare("SELECT count(*) n FROM n_push WHERE status='Enviada'").get().n,0);}finally{f.db.close();}
  const sent=[];const g=fixture(async data=>{sent.push(data);return {id:'ticket'};});try{g.sync(true);g.invite('one');g.service.registerDevice('one','session',{platform:'android',token:'ExpoPushToken[test]',permission:'granted'});g.snapshot.appointments.push(appointment());g.sync();await g.service.work();assert.equal(sent.length,1);assert.doesNotMatch(sent[0].body,/Paciente|Exame teste/);assert.equal(g.db.prepare("SELECT count(*) n FROM n_push WHERE status='Enviada'").get().n,1);g.service.invalidateSession('session');assert.equal(g.db.prepare('SELECT active FROM n_devices').get().active,0);}finally{g.db.close();}
});
test('exclusão protege pacientes compartilhados e lote inválido não emite aviso',()=>{
  const f=fixture();try{f.sync(true);f.invite('one');assert.throws(()=>f.service.deleteUser('owner'));const count=f.db.prepare('SELECT count(*) n FROM n_events').get().n;assert.throws(()=>f.service.sync('owner',{batch:'bad',revision:1,patients:[{id:'p2',name:'Teste',data:{appointments:[appointment()],meds:[],family:[]}},{id:'p3',name:'Inválido',data:{}}]}));assert.equal(f.db.prepare('SELECT count(*) n FROM n_events').get().n,count);assert.equal(f.db.prepare('SELECT count(*) n FROM n_patients').get().n,1);}finally{f.db.close();}
});
test('dois dispositivos, recibo inválido e revogação de token são rastreados',async()=>{
  const sent=[];
  const push=async data=>{sent.push(data.token);return {id:data.token};};
  push.receipts=async ids=>Object.fromEntries(ids.map(id=>[id,{status:'error',details:{error:'DeviceNotRegistered'}}]));
  const f=fixture(push);try{
    f.sync(true);f.invite('one');
    for(const suffix of ['first','second'])f.service.registerDevice('one','session',{platform:'android',token:'ExpoPushToken['+suffix+']',permission:'granted'});
    f.snapshot.appointments.push(appointment());f.sync();await f.service.work();
    assert.equal(sent.length,2);
    await f.service.work();assert.equal(sent.length,2);
    f.time(start+20000);await f.service.work();
    assert.equal(f.db.prepare('SELECT count(*) n FROM n_devices WHERE active=1').get().n,0);
    assert.equal(f.db.prepare("SELECT count(*) n FROM n_push WHERE status='Falha'").get().n,1);
  }finally{f.db.close();}
});
test('cada paciente tem código próprio estável, conecta contas e revogação invalida código antigo',()=>{
  const f=fixture();try{
    f.snapshot.appointments.push(appointment());f.sync(true);
    const first=f.service.patientCode('owner','owner:p1').code;
    assert.equal(f.service.patientCode('owner','owner:p1').code,first);
    assert.throws(()=>f.service.patientCode('one','owner:p1'));
    assert.throws(()=>f.service.sharedPatient('one','owner:p1'));
    const joined=f.service.joinCode('one',first.toLowerCase());
    assert.equal(joined.patient,'owner:p1');
    assert.equal(f.service.sharedPatients('one').length,1);
    assert.equal(f.service.sharedPatient('one','owner:p1').data.appointments[0].id,10);
    f.service.joinCode('one',first);assert.equal(f.service.sharedPatients('one').length,1);
    f.service.revoke('owner',{patient:'owner:p1',userId:'one'});
    assert.equal(f.service.sharedPatients('one').length,0);
    assert.throws(()=>f.service.sharedPatient('one','owner:p1'));
    assert.throws(()=>f.service.joinCode('one',first));
    assert.notEqual(f.service.patientCode('owner','owner:p1').code,first);
    f.service.sync('owner',{batch:'second-patient',revision:1,patients:[{id:'p2',name:'Segundo',data:{appointments:[],meds:[],family:[]}}]});
    assert.notEqual(f.service.patientCode('owner','owner:p2').code,f.service.patientCode('owner','owner:p1').code);
  }finally{f.db.close();}
});
