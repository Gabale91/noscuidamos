import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const packageName='br.com.gabale.noscuidamos.teste';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let target;
for(let attempt=0;attempt<20&&!target;attempt++){
  try{
    const pid=execFileSync('adb',['shell','pidof',packageName],{encoding:'utf8'}).trim().split(/\s+/)[0];
    execFileSync('adb',['forward','tcp:9222','localabstract:webview_devtools_remote_'+pid]);
    const response=await fetch('http://127.0.0.1:9222/json/list',{signal:AbortSignal.timeout(2500)});
    target=(await response.json()).find(item=>item.url?.startsWith('https://localhost/'));
  }catch{}
  if(!target)await delay(1000);
}
assert.ok(target?.webSocketDebuggerUrl,'WebView local não encontrado');
const ws=new WebSocket(target.webSocketDebuggerUrl);
try{
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
  const result=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Tempo limite do Android')),30000);
    ws.addEventListener('message',event=>{
      const payload=JSON.parse(event.data);
      if(payload.id!==1)return;
      clearTimeout(timeout);
      if(payload.error||payload.result?.exceptionDetails)reject(Error('Falha ao executar verificação no Android'));
      else resolve(payload.result.result.value);
    });
    ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{
      awaitPromise:true,returnByValue:true,
      expression:`(async()=>{
        const config=await fetch('/api/config');
        const data=await config.json();
        const me=await fetch('/api/me');
        return {origin:location.origin,status:config.status,registration:data.features?.includes('emailRegistration'),anonymous:(await me.json()).user===null};
      })()`
    }}));
  });
  assert.deepEqual(result,{origin:'https://localhost',status:200,registration:true,anonymous:true});
  console.log('Android: interface local, configuração HTTPS real e sessão anônima validadas');
}finally{ws.close();execFileSync('adb',['forward','--remove','tcp:9222']);}
