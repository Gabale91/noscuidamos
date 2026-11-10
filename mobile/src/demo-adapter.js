import {Capacitor,registerPlugin} from '@capacitor/core';
const NativeTools=registerPlugin('NativeTools');
async function saveDocument(blob,name){
 const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
 return NativeTools.saveDocument({base64,name,mime:blob.type||'application/octet-stream'});
}
if(Capacitor.isNativePlatform()){
 window.print=()=>NativeTools.print().catch(e=>toast(e.message||'Não foi possível abrir a impressão.'));
 const oldResult=window.openResult;
 window.openResult=async(id,index)=>{try{const r=db.appointments.find(a=>String(a.id)===String(id))?.results?.[index];if(!r)return;if(r.fileKey){const file=await loadResultFile(r.fileKey);if(!file)throw Error('Arquivo não encontrado neste dispositivo.');await saveDocument(new Blob([file],{type:r.type||file.type}),r.fileName);}else if(r.data){const response=await fetch(r.data);await saveDocument(await response.blob(),r.fileName);}else return oldResult(id,index);}catch(e){toast(e.message);}};
 window.openPostDocument=async(id,index)=>{try{const d=db.appointments.find(a=>String(a.id)===String(id))?.postDocuments?.[index];if(!d?.data)return;const response=await fetch(d.data);await saveDocument(await response.blob(),d.fileName);}catch(e){toast(e.message);}};
}
const banner=document.createElement('aside');banner.style.cssText='padding:12px 18px;background:#fff2dd;color:#102332;font:15px/1.4 system-ui;position:relative';banner.textContent='Demonstração local: sem login ou sincronização com sua conta. ';
const back=document.createElement('a');back.href='index.html';back.textContent='Voltar ao acesso';back.style.cssText='color:#0d6255;font-weight:700';banner.append(back);document.querySelector('.app').prepend(banner);
