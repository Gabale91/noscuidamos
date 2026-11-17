// Central file storage for PHP hosting. Local IndexedDB remains a cache for old attachments.
async function uploadPrivateDocument(file,record,kind){
  if(typeof sharedWorkspace!=='undefined'&&sharedWorkspace)await sharedWorkspace.pending;
  await flushNotifications();if(notificationQueue.length)throw new Error('Sincronize o atendimento antes de anexar o documento.');
  const state=await noticeApi('state'),patient=typeof sharedWorkspace!=='undefined'&&sharedWorkspace?{id:sharedWorkspace.id}:state.patients.find(p=>p.id.endsWith(':'+String(db.activePatientId)));
  if(!patient)throw new Error('Paciente ainda não sincronizado.');
  const form=new FormData();form.append('file',file);form.append('patient',patient.id);form.append('record',record);form.append('kind',kind);
  const response=await fetch('/api/files/upload',{method:'POST',body:form});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
const localResultOpen=openResult;
const localPostOpen=openPostDocument;
openPostDocument=function(id,index){const d=db.appointments.find(a=>String(a.id)===String(id))?.postDocuments?.[index];if(!d?.serverFileId)return localPostOpen(id,index);location.assign('/api/files/download?id='+encodeURIComponent(d.serverFileId));};
openResult=async function(id,index){const r=db.appointments.find(a=>String(a.id)===String(id))?.results?.[index];if(!r?.serverFileId)return localResultOpen(id,index);location.assign('/api/files/download?id='+encodeURIComponent(r.serverFileId));};
saveResult=async function(event){event.preventDefault();if(!validateFormDates(event.target))return;const form=event.target,a=db.appointments.find(a=>a.id===selected),data=new FormData(form),button=form.querySelector('[type=submit]');if(!a||a.type!=='Exame')return;button.disabled=true;try{const file=data.get('file'),uploaded=await uploadPrivateDocument(file,String(a.id),'result');a.results=[...(a.results||[]),{name:String(data.get('name')||'').trim()||uploaded.fileName,date:data.get('date'),fileName:uploaded.fileName,serverFileId:uploaded.id,type:uploaded.type,size:uploaded.size}];log('Resultado anexado');save(true);go('appointment',a.id);toast('Resultado anexado!');}catch(error){toast(error.message);}finally{button.disabled=false;}};
savePost=async function(event){event.preventDefault();const form=event.target,a=db.appointments.find(a=>a.id===selected);if(!a||a.status!=='Realizado')return;const button=form.querySelector('[type=submit]');button.disabled=true;try{const data=new FormData(form),documents=[];for(const [field,kind] of [['prescriptionFiles','prescription'],['examOrderFiles','exam_order']])for(const file of data.getAll(field)){if(!file?.size)continue;const uploaded=await uploadPrivateDocument(file,String(a.id),kind);documents.push({kind,fileName:uploaded.fileName,serverFileId:uploaded.id,createdAt:new Date().toISOString()});}a.postNotes=String(data.get('postNotes')??'');a.postDocuments=[...(a.postDocuments||[]),...documents];log('Pós-atendimento registrado');save(true);go('appointment',a.id);toast('Informações salvas');}catch(error){toast(error.message);}finally{button.disabled=false;}};
// Display centrally stored documents to owners and authorized relatives; download rechecks access.
async function appendPrivateFiles(){const main=document.querySelector('main');if(!main||!['appointment','sharedPatient'].includes(page))return;const generation=page+':'+selected+':'+activeSharedPatient;try{let patient=(typeof sharedWorkspace!=='undefined'&&sharedWorkspace?.id)||activeSharedPatient;if(!patient){const state=await noticeApi('state');patient=state.patients.find(p=>p.id.endsWith(':'+String(db.activePatientId)))?.id;}if(!patient)return;const response=await fetch('/api/files/list?patient='+encodeURIComponent(patient));if(!response.ok)return;const data=await response.json();if(generation!==page+':'+selected+':'+activeSharedPatient||!main.isConnected)return;const files=data.files.filter(f=>page==='sharedPatient'||String(f.record_id)===String(selected));if(!files.length)return;const section=document.createElement('section');section.className='card';const heading=document.createElement('h3');heading.textContent='Documentos anexados';section.append(heading);for(const f of files){const a=document.createElement('a');a.className='secondary';a.style.display='block';a.style.marginBottom='8px';a.textContent=f.name;a.href='/api/files/download?id='+encodeURIComponent(f.id);section.append(a);const remove=document.createElement("button");remove.type="button";remove.className="secondary";remove.textContent="Remover documento";remove.addEventListener("click",()=>removePrivateDocument(f,remove));section.append(remove);}main.append(section);}catch{}}
const phpRender=render;render=function(){phpRender();appendPrivateFiles();};

async function removePrivateDocument(file,button){
  if(!confirm('Deseja remover este documento?'))return;
  button.disabled=true;
  try{
    const workspace=typeof sharedWorkspace!=='undefined'?sharedWorkspace:null;
    if(workspace)await workspace.pending;
    else{
      await flushNotifications();
      if(notificationQueue.length)throw new Error('Aguarde a sincronização antes de remover o documento.');
    }
    const response=await fetch('/api/files/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:file.id})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error);
    if(workspace&&sharedWorkspace===workspace){
      for(const visit of db.appointments)for(const key of ['results','postDocuments']){
        if(visit[key])visit[key]=visit[key].filter(entry=>entry.serverFileId!==file.id);
      }
      workspace.version=result.editVersion;
      render();
      toast('Documento removido.');
    }else location.reload();
  }catch(error){toast(error.message);}
  finally{button.disabled=false;}
}
