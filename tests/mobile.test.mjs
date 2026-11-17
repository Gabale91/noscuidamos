import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('paciente vinculado usa as telas comuns e grava no cadastro original',async()=>{
 const calls=[];
 const owned={activePatientId:'mine',patients:[]};
 const context={
  db:owned,save(){throw Error('Cadastro próprio não deve receber dados compartilhados');},
  go(target){calls.push(target);},switchPatient(){},openSharedPatient(){},render(){},familyInviteData(){},toast(){},
  snapshot(){return {appointments:context.db.appointments,meds:context.db.meds,family:[]};},
  async noticeApi(route,body){
   if(!body)return {name:'Paciente fictício',editVersion:'v1',data:{appointments:[],meds:[]}};
   calls.push([route,body]);
   return {editVersion:'v2'};
  }
 };
 runInNewContext(await readFile(new URL('../php/assets/shared-workspace.js',import.meta.url),'utf8'),context);
 await context.openSharedPatient('owner:p1','agenda');
 assert.equal(calls[0],'agenda');
 context.db.appointments.push({id:'consulta-1',name:'Consulta fictícia'});
 context.save();
 await runInNewContext('sharedWorkspace.pending',context);
 assert.equal(calls[1][0],'shared-update');
 assert.equal(calls[1][1].patient,'owner:p1');
 assert.equal(calls[1][1].editVersion,'v1');
 assert.equal(calls[1][1].data.appointments[0].id,'consulta-1');
 await context.exitSharedWorkspace();
 assert.equal(context.db,owned);
});

test('Android empacota as telas e restringe as chamadas da conta ao domínio HTTPS',async()=>{
 const build=await readFile(new URL('../mobile/build.mjs',import.meta.url),'utf8');
 assert.match(build,/writeFile\(out\+'\/index\.html',login\)/);
 assert.match(build,/writeFile\(out\+'\/app\.html',app\)/);
 assert.match(build,/writeFile\(out\+'\/profile\.html',login\)/);
 assert.doesNotMatch(build,/Browser\.open|copyFile.*(?:launcher|demo)/);
 assert.match(build,/\['demo\.html','demo-adapter\.js','launcher\.js'\][\s\S]*?await rm\(resolve\(out,file\)/);
 const bridge=await readFile(new URL('../mobile/src/api-bridge.js',import.meta.url),'utf8');
 assert.match(bridge,/apiOrigin = 'https:\/\/noscuidamos\.gabale\.com\.br'/);
 assert.match(bridge,/credentials: 'omit', redirect: 'error'/);
});

test('sessão lembrada é recuperada em nova execução e descartada após invalidação',async()=>{
 const source=await readFile(new URL('../mobile/src/api-bridge.js',import.meta.url),'utf8');
 const token='a'.repeat(64);
 let saved=null;
 let valid=true;
 const requests=[];
 function start(){
  const session=new Map();
  const window={
   Capacitor:{Plugins:{NativeTools:{async rememberedSession(options){
    if('token' in options)saved=options.token||null;
    return {token:saved};
   }}}},
   async fetch(url,options){
    requests.push(options.headers.get('Authorization'));
    return Response.json(url.searchParams.get('nc_route')==='/api/login'
     ? {sessionToken:token} : {user:valid?{id:'fixture'}:null});
   }
  };
  runInNewContext(source,{window,Headers,AbortController,URL,setTimeout,clearTimeout,sessionStorage:{
   getItem:key=>session.get(key),setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)
  }});
  return window.fetch;
 }
 await start()('/api/login',{body:JSON.stringify({remember:true})});
 assert.equal(saved,token);
 await start()('/api/me');
 assert.equal(requests.at(-1),'Bearer '+token);
 valid=false;
 await start()('/api/me');
 assert.equal(saved,null);
 await start()('/api/me');
 assert.equal(requests.at(-1),null);
});
