const renderBeforeAdministration = render;
const administrationAvailable = fetch('/api/config')
  .then(response=>response.ok?response.json():null)
  .then(config=>config?.features?.includes('patientAdministration')===true)
  .catch(()=>false);
render = function () {
  renderBeforeAdministration();
  if (['family','sharedPatient','home','sharedPatients'].includes(page)) showPatientAdministration();
};
async function showPatientAdministration(){
  if(!await administrationAvailable)return;
  const main=document.querySelector('main');
  if(!main)return;
  const card=document.createElement('section');
  card.className='card';
  const title=document.createElement('h3');
  title.textContent='Administração do paciente';
  card.append(title);
  const addText=text=>{const p=document.createElement('p');p.textContent=text;card.append(p);};
  const addAction=(label,action,data,confirmation)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='secondary';
    button.textContent=label;
    button.addEventListener('click',async()=>{
      if(confirmation&&!window.confirm(confirmation))return;
      button.disabled=true;
      try{await noticeApi(action,{...data,confirmed:!!confirmation});toast('Alteração registrada.');render();}
      catch(error){toast(error.message);button.disabled=false;}
    });
    card.append(button);
  };
  try{
    if(['home','sharedPatients'].includes(page)){
      const {invitations}=await noticeApi('admin-invitations',{});
      if(!invitations.length)return;
      for(const invite of invitations)addAction('Aceitar administração de '+invite.name,'admin-accept',{patient:invite.id});
    }else{
      const state=page==='family'?await noticeApi('state'):null;
      const patient=state?state.patients.find(p=>p.id.endsWith(':'+String(db.activePatientId)))?.id:activeSharedPatient;
      if(!patient)return;
      const result=await noticeApi('admin-members',{patient});
      if(result.needsSecondAdmin)addText('Configuração pendente. Convide um familiar e solicite que aceite a administração do paciente.');
      for(const member of result.members){
        const data={patient,userId:member.id};
        addText(member.name+' · '+({admin:'Administrador',pending:'Convite administrativo pendente',family:'Familiar'}[member.role]));
        if(member.role==='family')addAction('Tornar administrador','admin-invite',data);
        if(member.role==='admin'&&member.id!==result.members[0].id)addAction('Remover permissão de administrador','admin-demote',data,'Deseja remover a permissão administrativa de '+member.name+'?');
        if(member.id!==result.members[0].id)addAction('Remover familiar','admin-remove',data,'Deseja remover '+member.name+'? O acesso será revogado e os históricos anteriores serão preservados.');
      }
    }
    if(main.isConnected)main.append(card);
  }catch(error){
    if(error.status!==403&&main.isConnected){addText(error.message);main.append(card);}
  }
}
showPatientAdministration();
