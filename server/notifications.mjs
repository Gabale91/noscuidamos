import { randomUUID, randomBytes, createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (text, status=400) => {throw Object.assign(new Error(text),{status});};
const titles = {
  appointment_created:'Novo agendamento', appointment_rescheduled:'Agendamento reagendado',
  appointment_cancelled:'Agendamento cancelado', appointment_completed:'Atendimento realizado',
  companion_removed:'Acompanhante substituído', companion_selected:'Você foi selecionado como acompanhante',
  medication_created:'Medicamento cadastrado', medication_updated:'Medicamento atualizado',
  medication_suspended:'Medicamento suspenso', medication_completed:'Tratamento concluído',
  post_updated:'Pós-atendimento atualizado', result_added:'Resultado de exame incluído',
  reminder:'Lembrete de agendamento'
};
const internalEvents = new Set(['appointment_cancelled','appointment_completed','medication_created','medication_updated','medication_suspended','medication_completed','post_updated','result_added']);
const genericBody = 'Há uma atualização no Cuidado em Família. Entre no aplicativo para conferir os detalhes.';
export function reminderTimes(date,time,timezone='America/Sao_Paulo',now=Date.now()) {
  // Convert the entered wall-clock time using IANA zone rules (never browser/host timezone).
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return [];
  const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);
  const wall=Date.UTC(y,m-1,d,h,min);let instant=wall;
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const read=value=>Object.fromEntries(format.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  for(let i=0;i<3;i++){const p=read(instant);instant+=wall-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);}
  const p=read(instant);
  if(+p.year!==y||+p.month!==m||+p.day!==d||+p.hour!==h||+p.minute!==min)return [];
  return [72,24,2].map(hours=>({hours,at:instant-hours*3600000,startsAt:instant})).filter(item=>item.at>now);
}

export function createNotifications(db,{sendPush=null,now=()=>Date.now()}={}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS n_patients(id TEXT PRIMARY KEY,owner TEXT NOT NULL,local_id TEXT NOT NULL,name TEXT NOT NULL,snapshot TEXT NOT NULL,UNIQUE(owner,local_id));
    CREATE TABLE IF NOT EXISTS n_members(patient TEXT NOT NULL,user_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(patient,user_id));
    CREATE TABLE IF NOT EXISTS n_invites(token TEXT PRIMARY KEY,patient TEXT NOT NULL,email TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS n_patient_codes(patient TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS n_sync(user_id TEXT PRIMARY KEY,revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS n_batches(user_id TEXT NOT NULL,batch TEXT NOT NULL,PRIMARY KEY(user_id,batch));
    CREATE TABLE IF NOT EXISTS n_events(id TEXT PRIMARY KEY,patient TEXT NOT NULL,record_id TEXT NOT NULL,record_type TEXT NOT NULL,type TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS n_internal(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,user_id TEXT NOT NULL,read_at INTEGER,UNIQUE(event_id,user_id));
    CREATE TABLE IF NOT EXISTS n_devices(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_id TEXT NOT NULL,platform TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS n_push(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,patient TEXT NOT NULL,record_id TEXT NOT NULL,user_id TEXT NOT NULL,type TEXT NOT NULL,due INTEGER NOT NULL,expires INTEGER,status TEXT NOT NULL DEFAULT 'Programada',sent_at INTEGER,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,ticket TEXT,receipt_checked INTEGER NOT NULL DEFAULT 0,UNIQUE(event_id,user_id,type,due));
    CREATE TABLE IF NOT EXISTS n_deliveries(job TEXT NOT NULL,token TEXT NOT NULL,ticket TEXT,receipt_checked INTEGER NOT NULL DEFAULT 0,error TEXT,PRIMARY KEY(job,token));
    CREATE INDEX IF NOT EXISTS n_push_due ON n_push(status,due);
  `);
  const q=sql=>db.prepare(sql);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const permitted=(user,patient)=>Boolean(q('SELECT 1 FROM n_patients WHERE id=? AND owner=?').get(patient,user)||q('SELECT 1 FROM n_members WHERE patient=? AND user_id=? AND active=1').get(patient,user));
  const owner=(user,patient)=>{if(!q('SELECT 1 FROM n_patients WHERE id=? AND owner=?').get(patient,user))fail('Você não pode gerenciar os vínculos deste paciente.',403);};
  const newCode=()=>randomBytes(10).toString('hex').toUpperCase();
  function ensureCode(patient){let value=q('SELECT code FROM n_patient_codes WHERE patient=?').get(patient)?.code;if(!value){value=newCode();q('INSERT INTO n_patient_codes VALUES(?,?)').run(patient,value);}return value.match(/.{1,4}/g).join('-');}
  function patientCode(user,patient){owner(user,patient);return {patient,code:ensureCode(patient)};}
  function joinCode(user,raw){
    const value=String(raw||'').replace(/[\s-]/g,'').toUpperCase();
    if(!/^[A-F0-9]{20}$/.test(value))fail('Código do paciente inválido. Confira o código com o responsável.');
    const entry=q('SELECT c.patient,p.owner,p.name FROM n_patient_codes c JOIN n_patients p ON p.id=c.patient WHERE c.code=?').get(value);
    if(!entry)fail('Código do paciente inválido. Confira o código com o responsável.');
    if(entry.owner!==user)q('INSERT INTO n_members VALUES(?,?,1) ON CONFLICT(patient,user_id) DO UPDATE SET active=1').run(entry.patient,user);
    return {patient:entry.patient,name:entry.name};
  }
  function sharedPatients(user){return q('SELECT p.id,p.name FROM n_patients p JOIN n_members m ON p.id=m.patient WHERE m.user_id=? AND m.active=1 AND p.owner<>? ORDER BY p.name').all(user,user);}
  function sharedPatient(user,patient){if(!permitted(user,patient))fail('Paciente indisponível ou acesso revogado.',403);const p=q('SELECT * FROM n_patients WHERE id=?').get(patient);return {id:p.id,name:p.name,isOwner:p.owner===user,data:JSON.parse(p.snapshot)};}
  const recipients=patient=>{
    const p=q('SELECT owner FROM n_patients WHERE id=?').get(patient);
    return [...new Set([p?.owner,...q('SELECT user_id FROM n_members WHERE patient=? AND active=1').all(patient).map(x=>x.user_id)].filter(Boolean))];
  };
  // A contact name is resolved only through an accepted, authorized account with matching e-mail.
  const companion=(patient,snapshot,name)=>{
    if(!name)return null;
    const contact=(snapshot.family||[]).find(c=>c.name===name);
    if(!contact?.email)return null;
    const user=q('SELECT id FROM users WHERE email=?').get(contact.email.trim().toLowerCase());
    return user&&permitted(user.id,patient)?user.id:null;
  };
  const queue=(event,user,type=event.type,due=now(),expires=null)=>{
    if(!user)return;
    q('INSERT OR IGNORE INTO n_push(id,event_id,patient,record_id,user_id,type,due,expires) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),event.id,event.patient,event.record_id,user,type,due,expires);
  };
  const emit=(patient,record,type,recordType='appointment')=>{
    const event={id:randomUUID(),patient,record_id:String(record.id),record_type:recordType,type,created_at:now()};
    q('INSERT INTO n_events VALUES(?,?,?,?,?,?)').run(event.id,patient,event.record_id,recordType,type,event.created_at);
    if(internalEvents.has(type))for(const user of recipients(patient))q('INSERT INTO n_internal(id,event_id,user_id) VALUES(?,?,?)').run(randomUUID(),event.id,user);
    return event;
  };
  const cancelPending=(patient,record)=>q("UPDATE n_push SET status='Cancelada',error='Programação substituída ou atendimento encerrado' WHERE patient=? AND record_id=? AND status='Programada' AND type LIKE 'reminder_%'").run(patient,String(record.id));
  const reminders=(event,record,user)=>{
    if(record.status!=='Agendado'||!user)return;
    for(const item of reminderTimes(record.date,record.time,record.timezone||'America/Sao_Paulo',now()))queue(event,user,'reminder_'+item.hours,item.at,item.startsAt);
  };
  const recordKey=item=>String(item.id);
  const changed=(a,b,fields)=>fields.some(field=>JSON.stringify(a?.[field]??null)!==JSON.stringify(b?.[field]??null));
  function reconcile(patient,previous,current,baseline) {
    const oldAppointments=new Map((previous.appointments||[]).map(item=>[recordKey(item),item]));
    for(const a of current.appointments||[]){
      const old=oldAppointments.get(recordKey(a)),selected=companion(patient,current,a.companion);
      if(!old){if(baseline)continue;const e=emit(patient,a,'appointment_created');queue(e,selected);reminders(e,a,selected);}
      else {
        const rescheduled=changed(old,a,['date','time','timezone'])||old.status==='Cancelado'&&a.status==='Agendado';
        const companionChanged=old.companion!==a.companion;
        const statusChanged=old.status!==a.status;
        if(rescheduled||companionChanged||statusChanged)cancelPending(patient,a);
        if(statusChanged&&a.status==='Cancelado'){const e=emit(patient,a,'appointment_cancelled');queue(e,selected);}
        else if(statusChanged&&a.status==='Realizado')emit(patient,a,'appointment_completed');
        else if(a.status==='Agendado'&&(rescheduled||companionChanged)){
          let e;
          if(companionChanged){const removed=emit(patient,a,'companion_removed');queue(removed,companion(patient,previous,old.companion));e=emit(patient,a,'companion_selected');queue(e,selected);}
          else{e=emit(patient,a,'appointment_rescheduled');queue(e,selected);}
          reminders(e,a,selected);
        }
        if(changed(old,a,['postNotes','postDocuments']))emit(patient,a,'post_updated');
        if(changed(old,a,['results']))emit(patient,a,'result_added');
      }
    }
    for(const a of previous.appointments||[])if(!(current.appointments||[]).some(item=>recordKey(item)===recordKey(a)))cancelPending(patient,a);
    const oldMeds=new Map((previous.meds||[]).map(item=>[recordKey(item),item]));
    for(const m of current.meds||[]){const old=oldMeds.get(recordKey(m));if(!old){if(!baseline)emit(patient,m,'medication_created','medication');}else if(changed(old,m,['name','strength','amount','route','frequency','schedule','start','continuous','status']))emit(patient,m,m.status!==old.status&&m.status==='Suspenso'?'medication_suspended':m.status!==old.status&&m.status==='Concluído'?'medication_completed':'medication_updated','medication');}
  }
  function sync(user,body){
    if(typeof body.batch!=='string'||body.batch.length>100||!Number.isInteger(body.revision)||!Array.isArray(body.patients)||body.patients.length>500)fail('Sincronização inválida.');
    return transaction(()=>{
      const revision=q('SELECT revision FROM n_sync WHERE user_id=?').get(user)?.revision||0;
      if(q('SELECT 1 FROM n_batches WHERE user_id=? AND batch=?').get(user,body.batch))return {revision,duplicate:true};
      if(body.revision!==revision)fail('Os dados foram atualizados em outra sessão. Recarregue antes de sincronizar.',409);
      const ids=new Set();
      for(const patient of body.patients){
        if(!/^[A-Za-z0-9_-]{1,100}$/.test(String(patient.id||''))||!patient.name||typeof patient.data!=='object'||!patient.data)fail('Paciente inválido.');
        const id=user+':'+String(patient.id);if(ids.has(id))fail('Paciente duplicado.');ids.add(id);
        const previous=q('SELECT * FROM n_patients WHERE id=?').get(id);
        // Validate bounded collections before storing untrusted payloads.
        for(const key of ['appointments','meds','family'])if(!Array.isArray(patient.data[key])||patient.data[key].length>10000)fail('Registros inválidos.');
        for(const a of [...patient.data.appointments,...patient.data.meds])if(a.id===undefined||!/^[A-Za-z0-9_-]{1,100}$/.test(String(a.id)))fail('Identificador inválido.');
        const snapshot=JSON.stringify(patient.data);
        q('INSERT INTO n_patients VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,snapshot=excluded.snapshot').run(id,user,String(patient.id),String(patient.name).slice(0,150),snapshot);
        ensureCode(id);
        const baseline=body.baseline===true&&revision===0;
        reconcile(id,previous?JSON.parse(previous.snapshot):{appointments:[],meds:[],family:[]},patient.data,baseline);
      }
      q('INSERT INTO n_sync VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision').run(user,revision+1);
      q('INSERT INTO n_batches VALUES(?,?)').run(user,body.batch);
      return {revision:revision+1};
    });
  }
  function list(user){
    const items=q(`SELECT n.id,e.patient,e.record_id,e.record_type,e.type,e.created_at,n.read_at,p.name AS patient_name FROM n_internal n JOIN n_events e ON e.id=n.event_id JOIN n_patients p ON p.id=e.patient WHERE n.user_id=? ORDER BY e.created_at DESC,n.rowid DESC`).all(user).filter(item=>permitted(user,item.patient)).map(item=>({...item,title:titles[item.type],body:genericBody}));
    return {items,unread:items.filter(item=>!item.read_at).length,pushConfigured:Boolean(sendPush)};
  }
  function read(user,id){
    if(id==='all'){for(const item of list(user).items)q('UPDATE n_internal SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(now(),item.id,user);return;}
    const item=list(user).items.find(item=>item.id===id);if(!item)fail('Notificação indisponível.',404);
    q('UPDATE n_internal SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(now(),id,user);
  }
  function details(user,id){
    const notice=list(user).items.find(item=>item.id===id);if(!notice)fail('Notificação indisponível ou acesso revogado.',403);
    const patient=q('SELECT * FROM n_patients WHERE id=?').get(notice.patient),data=JSON.parse(patient.snapshot);
    const record=(notice.record_type==='medication'?data.meds:data.appointments).find(item=>String(item.id)===notice.record_id);
    if(!record)fail('O registro não está mais disponível.',404);
    return {patient:{name:patient.name,localId:patient.local_id,isOwner:patient.owner===user},record,type:notice.record_type};
  }
  function invite(user,body){
    owner(user,body.patient);const email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Informe o e-mail do acompanhante.');
    const value=randomBytes(32).toString('base64url');q('INSERT INTO n_invites VALUES(?,?,?,?)').run(digest(value),body.patient,email,now()+86400000);return {token:value};
  }
  function accept(user,body){return transaction(()=>{
    const invite=q('SELECT * FROM n_invites WHERE token=? AND expires>?').get(digest(String(body.token||'')),now()),account=q('SELECT email FROM users WHERE id=?').get(user);
    if(!invite||invite.email!==account?.email)fail('Convite inválido, expirado ou destinado a outra conta.',403);
    q('INSERT INTO n_members VALUES(?,?,1) ON CONFLICT(patient,user_id) DO UPDATE SET active=1').run(invite.patient,user);
    const patient=q('SELECT snapshot FROM n_patients WHERE id=?').get(invite.patient),snapshot=JSON.parse(patient.snapshot);
    // A newly accepted invite activates only future reminders, not old inbox messages.
    for(const a of snapshot.appointments||[])if(a.status==='Agendado'&&companion(invite.patient,snapshot,a.companion)===user){cancelPending(invite.patient,a);const event=emit(invite.patient,a,'companion_selected');queue(event,user);reminders(event,a,user);}
    q('DELETE FROM n_invites WHERE token=?').run(digest(body.token));return {ok:true};
  });}
  function revoke(user,body){owner(user,body.patient);transaction(()=>{q('UPDATE n_members SET active=0 WHERE patient=? AND user_id=?').run(body.patient,body.userId);q("UPDATE n_push SET status='Cancelada' WHERE patient=? AND user_id=? AND status='Programada'").run(body.patient,body.userId);q('UPDATE n_patient_codes SET code=? WHERE patient=?').run(newCode(),body.patient);});}
  function membership(user){return q('SELECT id,name FROM n_patients WHERE owner=? ORDER BY name').all(user).map(p=>({...p,members:q('SELECT m.user_id,u.name,u.email,m.active FROM n_members m JOIN users u ON u.id=m.user_id WHERE m.patient=?').all(p.id)}));}
  function registerDevice(user,session,body){
    if(!['ios','android'].includes(body.platform)||!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(body.token||'')||body.permission!=='granted')fail('Dispositivo ou permissão inválida.');
    q('INSERT INTO n_devices VALUES(?,?,?,?,1) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,platform=excluded.platform,active=1').run(body.token,user,session,body.platform);
  }
  const invalidateSession=session=>q('UPDATE n_devices SET active=0 WHERE session_id=?').run(session);
  const invalidateUser=user=>q('UPDATE n_devices SET active=0 WHERE user_id=?').run(user);
  function deleteUser(user){
    if(q('SELECT 1 FROM n_members m JOIN n_patients p ON p.id=m.patient WHERE p.owner=? AND m.active=1 AND m.user_id<>?').get(user,user))fail('Esta conta possui pacientes compartilhados. Revogue os vínculos ou transfira a responsabilidade antes de excluir.',409);
    for(const p of q('SELECT id FROM n_patients WHERE owner=?').all(user)){
      q('DELETE FROM n_patient_codes WHERE patient=?').run(p.id);
      for(const job of q('SELECT id FROM n_push WHERE patient=?').all(p.id))q('DELETE FROM n_deliveries WHERE job=?').run(job.id);
      for(const e of q('SELECT id FROM n_events WHERE patient=?').all(p.id))q('DELETE FROM n_internal WHERE event_id=?').run(e.id);
      for(const table of ['n_members','n_invites','n_events','n_push'])q(`DELETE FROM ${table} WHERE patient=?`).run(p.id);
    }
    q('DELETE FROM n_patients WHERE owner=?').run(user);
    for(const job of q('SELECT id FROM n_push WHERE user_id=?').all(user))q('DELETE FROM n_deliveries WHERE job=?').run(job.id);
    for(const table of ['n_members','n_internal','n_devices','n_sync','n_batches','n_push'])q(`DELETE FROM ${table} WHERE user_id=?`).run(user);
  }
  let running=false;
  async function work(){
    if(running||!sendPush)return;running=true;
    try{
      const jobs=q("SELECT * FROM n_push WHERE status='Programada' AND due<=? ORDER BY due LIMIT 50").all(now());
      for(const job of jobs){
        if(!permitted(job.user_id,job.patient)||job.expires&&job.expires<=now()){q("UPDATE n_push SET status='Cancelada',error='Acesso revogado ou lembrete expirado' WHERE id=?").run(job.id);continue;}
        const devices=q('SELECT * FROM n_devices WHERE user_id=? AND active=1').all(job.user_id);
        if(!devices.length){q("UPDATE n_push SET error='Nenhum dispositivo autorizado' WHERE id=?").run(job.id);continue;}
        try{
          for(const device of devices){
            if(q('SELECT ticket FROM n_deliveries WHERE job=? AND token=?').get(job.id,device.token)?.ticket)continue;
            if(!permitted(job.user_id,job.patient)||!q("SELECT 1 FROM n_push WHERE id=? AND status='Programada'").get(job.id))break;
            let result;
            try{result=await sendPush({token:device.token,title:titles[job.type]||titles.reminder,body:genericBody,data:{notification:job.id}});}
            catch(error){if(error.code==='DeviceNotRegistered')q('UPDATE n_devices SET active=0 WHERE token=?').run(device.token);throw error;}
            if(!result?.id)throw new Error('Provedor não confirmou o recebimento do pedido.');
            q('INSERT INTO n_deliveries(job,token,ticket) VALUES(?,?,?) ON CONFLICT(job,token) DO UPDATE SET ticket=excluded.ticket').run(job.id,device.token,result.id);
          }
          q("UPDATE n_push SET status='Enviada',sent_at=?,error=NULL WHERE id=? AND status='Programada'").run(now(),job.id);
        }catch(error){const count=job.attempts+1;q("UPDATE n_push SET attempts=?,status=?,due=?,error=? WHERE id=? AND status='Programada'").run(count,count>=3?'Falha':'Programada',now()+count*60000,'Falha no provedor de push',job.id);}
      }
      if(sendPush.receipts){
        const pending=q("SELECT d.* FROM n_deliveries d JOIN n_push p ON p.id=d.job WHERE d.ticket IS NOT NULL AND d.receipt_checked=0 AND p.sent_at<? LIMIT 100").all(now()-15000);
        if(pending.length){const receipts=await sendPush.receipts(pending.map(item=>item.ticket));for(const item of pending){const receipt=receipts[item.ticket];if(!receipt)continue;q('UPDATE n_deliveries SET receipt_checked=1,error=? WHERE job=? AND token=?').run(receipt.status==='error'?'Falha de entrega informada pelo provedor':null,item.job,item.token);if(receipt.status==='error'){q("UPDATE n_push SET status='Falha',error='Falha de entrega informada pelo provedor' WHERE id=?").run(item.job);if(receipt.details?.error==='DeviceNotRegistered')q('UPDATE n_devices SET active=0 WHERE token=?').run(item.token);}}}
      }
    }finally{running=false;}
  }
  function pushDetails(user,id){const job=q('SELECT * FROM n_push WHERE id=? AND user_id=?').get(id,user);if(!job||!permitted(user,job.patient))fail('Acesso não autorizado.',403);const p=q('SELECT * FROM n_patients WHERE id=?').get(job.patient),data=JSON.parse(p.snapshot),record=data.appointments.find(a=>String(a.id)===job.record_id);if(!record)fail('Registro indisponível.',404);return {patient:{name:p.name,localId:p.local_id,isOwner:p.owner===user},record,type:'appointment'};}
  return {sync,list,read,details,invite,accept,revoke,membership,patientCode,joinCode,sharedPatients,sharedPatient,registerDevice,invalidateSession,invalidateUser,deleteUser,work,pushDetails,revision:user=>q('SELECT revision FROM n_sync WHERE user_id=?').get(user)?.revision||0,queueStatus:user=>q('SELECT status,error,due,type FROM n_push WHERE user_id=? ORDER BY due DESC LIMIT 50').all(user)};
}

export function expoTransport(){
  if(process.env.PUSH_ENABLED!=='true'||!process.env.EXPO_ACCESS_TOKEN)return null;
  const send=async message=>{
    const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`},body:JSON.stringify({to:message.token,title:message.title,body:message.body,data:message.data,sound:'default'}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Provedor indisponível');const result=await response.json();
    if(result.data?.status!=='ok')throw Object.assign(new Error('Push recusado'),{code:result.data?.details?.error});
    return {id:result.data.id};
  };
  send.receipts=async ids=>{const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`},body:JSON.stringify({ids}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Recibos indisponíveis');return (await response.json()).data||{};};
  return send;
}
