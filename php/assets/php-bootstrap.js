// Authenticated server snapshot is embedded with JSON_HEX escaping.
const phpPending=JSON.parse(localStorage.getItem(KEY+':notification-outbox')||'[]');
const phpRevision=Number(localStorage.getItem(KEY+':notification-revision')||0);
if(!phpPending.length && (!db.patients.length || phpSaved.revision>phpRevision)){
  const previous=db.activePatientId;db.patients=[];db.records={};
  for(const p of phpSaved.patients){const info=p.data.patientInfo||{};db.patients.push({id:p.localId,name:p.name,...info});db.records[p.localId]={...p.data,history:p.data.history||[],invites:[]};}
  const active=db.patients.find(p=>String(p.id)===String(previous))||db.patients[0];
  db.activePatientId=active?.id||null;
  for(const key of ['appointments','meds','family','history','invites'])db[key]=active?(db.records[active.id][key]||[]):[];
  db.patient=active?.name||'';for(const key of ['dob','allergies','medicalInfo','photo'])db[key]=active?.[key]||'';
  localStorage.setItem(KEY,JSON.stringify(db));localStorage.setItem(KEY+':notification-revision',String(phpSaved.revision));render();
}
