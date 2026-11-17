let sharedWorkspace=null;
const ownedSave=save;
const ownedGo=go;
const ownedSwitch=switchPatient;

function sharedPatientWorkspace(patient){
  const info=patient.data.patientInfo||{};
  const id='shared-current';
  const records={appointments:[],meds:[],family:[],history:[],invites:[],...patient.data};
  return {...db,...records,records:{[id]:records},patients:[{...info,id,name:patient.name}],
    activePatientId:id,patient:patient.name,dob:info.dob||'',allergies:info.allergies||'',
    medicalInfo:info.medicalInfo||'',photo:info.photo||''};
}

openSharedPatient=async function(id,section='home'){
  try{
    if(sharedWorkspace)await sharedWorkspace.pending;
    const patient=await noticeApi('shared-patient?patient='+encodeURIComponent(id));
    if(!patient.editVersion)throw new Error('O servidor precisa da atualização de compartilhamento para abrir este paciente.');
    const owned=sharedWorkspace?.owned||db;
    db=sharedPatientWorkspace(patient);
    sharedWorkspace={id,owned,version:patient.editVersion,base:patient.data,pending:Promise.resolve()};
    activeSharedPatient=null;
    ownedGo(['agenda','meds','history'].includes(section)?section:'home');
  }catch(error){toast(error.message);throw error;}
};
async function exitSharedWorkspace(){
  const current=sharedWorkspace;
  if(!current)return;
  await current.pending;
  if(sharedWorkspace!==current)return;
  db=current.owned;
  sharedWorkspace=null;
}
go=function(target,...args){
  if(sharedWorkspace&&['patients','newPatient','connectPatient','familyAccess'].includes(target)){
    exitSharedWorkspace().then(()=>ownedGo(target,...args)).catch(error=>toast(error.message));
    return;
  }
  return ownedGo(target,...args);
};
switchPatient=function(id){
  if(!sharedWorkspace)return ownedSwitch(id);
  return go('patients');
};
save=function(strict=false){
  if(!sharedWorkspace)return ownedSave(strict);
  const workspace=sharedWorkspace;
  const patient=db.patients.find(p=>p.id===db.activePatientId);
  const payload=JSON.parse(JSON.stringify({...workspace.base,...snapshot(),
    patientInfo:{...workspace.base.patientInfo,dob:db.dob,allergies:db.allergies,medicalInfo:db.medicalInfo,photo:db.photo}}));
  const name=patient?.name||db.patient;
  workspace.pending=workspace.pending.then(async()=>{
    const result=await noticeApi('shared-update',{patient:workspace.id,name,data:payload,editVersion:workspace.version});
    workspace.version=result.editVersion;
  });
  workspace.pending.catch(error=>{
    if(sharedWorkspace!==workspace)return;
    if(error.status===403||error.status===409){
      db=workspace.owned;
      sharedWorkspace=null;
      ownedGo('patients');
    }
    toast('Alteração não sincronizada. '+error.message);
  });
};
const ownedFamilyInvite=familyInviteData;
familyInviteData=function(){
  return sharedWorkspace?noticeApi('share-invite?patient='+encodeURIComponent(sharedWorkspace.id)):ownedFamilyInvite();
};
const renderWorkspace=render;
render=function(){
  renderWorkspace();
  if(!sharedWorkspace||page!=='home')return;
  const main=document.querySelector('#root main');
  if(!main)return;
  const button=document.createElement('button');
  button.className='secondary';
  button.textContent='Editar paciente';
  button.addEventListener('click',editSharedPatient);
  main.prepend(button);
};
function editSharedPatient(){
  const dialog=document.createElement('dialog');
  dialog.id='companionDialog';
  dialog.setAttribute('aria-labelledby','sharedEditTitle');
  dialog.innerHTML='<h2 id="sharedEditTitle">Editar paciente</h2><form><label for="sharedName">Nome</label><input id="sharedName" required maxlength="150"><label for="sharedBirth">Nascimento</label><input id="sharedBirth" type="date"><label for="sharedAllergies">Alergias</label><textarea id="sharedAllergies"></textarea><label for="sharedInfo">Informações médicas</label><textarea id="sharedInfo"></textarea><p role="alert"></p><div class="post-actions"><button class="primary">Salvar alterações</button><button type="button" class="secondary">Cancelar</button></div></form>';
  const [name,birth,allergies,info]=dialog.querySelectorAll('input,textarea');
  [name.value,birth.value,allergies.value,info.value]=[db.patient,db.dob,db.allergies,db.medicalInfo];
  dialog.querySelector('[type=button]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    if(!name.value.trim()||!validateFormDates(event.target))return;
    const button=dialog.querySelector('button');
    button.disabled=true;
    const workspace=sharedWorkspace;
    if(!workspace){dialog.close();return;}
    const patient=db.patients[0];
    Object.assign(patient,{name:name.value.trim(),dob:birth.value,allergies:allergies.value,medicalInfo:info.value});
    Object.assign(db,{patient:patient.name,dob:patient.dob,allergies:patient.allergies,medicalInfo:patient.medicalInfo});
    save();
    try{await workspace.pending;dialog.close();render();}
    catch(error){dialog.querySelector('[role=alert]').textContent=error.message;}
    finally{button.disabled=false;}
  };
  document.body.append(dialog);
  dialog.showModal();
}
