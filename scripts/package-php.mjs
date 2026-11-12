import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {compileClinicalHandlers,clinicalEventCode} from './clinical-page.mjs';
const out=resolve('release/locaweb-php');
// A fixed, workspace-owned staging directory, never an FTP destination.
await mkdir(out,{recursive:true});
await cp('php/public',out+'/public',{recursive:true});
await cp('php/src',out+'/private/src',{recursive:true});
await cp('php/assets',out+'/private/assets',{recursive:true});
await copyFile('php/config.example.php',out+'/private/config.example.php');
await copyFile('php/schema.sql',out+'/private/schema.sql');
await copyFile('php/002-clinical.sql',out+'/private/002-clinical.sql');
await copyFile('php/003-invites.sql',out+'/private/003-invites.sql');
await copyFile('php/004-registration.sql',out+'/private/004-registration.sql');
await copyFile('php/migrate.php',out+'/private/migrate.php');
for(const [source,target] of [['server/login.html','login.html'],['server/auth-ui.js','auth-ui.js'],['server/notifications-ui.js','notifications-ui.js'],['prototypes/cuidado-em-familia-teste-fluxo-corrigido.html','app.html']])await copyFile(source,out+'/private/assets/'+target);
// index lives in /web/noscuidamos; the private directory is a sibling OUTSIDE /web.
const {readFile}=await import('node:fs/promises');let index=await readFile(out+'/public/index.php','utf8');
for(const name of ['login.html','app.html']){
  const path=out+'/private/assets/'+name;
  const html=await readFile(path,'utf8');
  let result=html.replace(/<head>/i,'<head><link rel="icon" href="/icon.svg" type="image/svg+xml">');
  if(name==='login.html')result=result.replace('</body>','<script src="/google-link.js"></script></body>');
  await writeFile(path,result);
}
index=index.replace("getenv('CUIDADO_PRIVATE')?:dirname(__DIR__)","getenv('CUIDADO_PRIVATE')?:dirname(__DIR__, 2).'/cuidado-private'");
await writeFile(out+'/public/index.php',index);
let notices=await readFile(out+'/private/assets/notifications-ui.js','utf8');
notices=notices.replace("family:record.family||[],patientInfo:","family:record.family||[],history:record.history||[],patientInfo:").replace("['data','photo','history']","['data','photo']");
const noticeBindings=compileClinicalHandlers(notices);
await writeFile(out+'/private/assets/notifications-ui.js',noticeBindings.compiled);
let auth=await readFile(out+'/private/assets/auth-ui.js','utf8');
auth=auth.replace('Os arquivos anexados ficam no navegador de origem.','Novos anexos ficam em armazenamento privado no servidor e são acessíveis apenas às contas autorizadas. Anexos anteriores podem permanecer no navegador de origem.').replace('banco local do servidor','banco MySQL do servidor');
await writeFile(out+'/private/assets/auth-ui.js',auth);
let html=await readFile(out+'/private/assets/app.html','utf8');
html=html.replaceAll('até 1,5 MB por arquivo','até 10 MB por arquivo').replace('Demonstração: permissões reais entre usuários ainda não implementadas.','Acesso aos documentos e dados compartilhados validado pelo servidor.').replace('Receitas anexadas ainda não são suportadas nesta demonstração.','Receitas podem ser anexadas ao pós-atendimento da consulta.').replace('Os dados ficam armazenados apenas neste navegador, neste dispositivo. Não há login, servidor, compartilhamento real, notificações nem envio de e-mails. Não insira dados médicos verdadeiros.','Ambiente de homologação com autenticação, sincronização MySQL e documentos privados. Use dados fictícios até concluir a validação da hospedagem.');
const inline=/<script>([\s\S]*?)<\/script>/.exec(html);
if(!inline)throw new Error('Script principal da área clínica ausente.');
let app=inline[1]
  .replace("const KEY='cuidado-familia-demo-v3-clean';",
    "const phpSaved=JSON.parse(document.getElementById('phpSaved').textContent);\nconst KEY='cuidado-familia-account-'+phpSaved.userId;")
  .replace("indexedDB.open('cuidado-familia-files',1)","indexedDB.open('cuidado-familia-files-'+phpSaved.userId,1)")
  .replace(/render\(\);\s*$/,
    "userProfile=()=>{location.assign('/profile');return '<main>Abrindo perfil…</main>'};window.addEventListener('pageshow',()=>fetch('/api/me').then(r=>r.json()).then(s=>{if(!s.user||s.needsConsent)location.replace('/')}));render();\n");
const appBindings=compileClinicalHandlers(app);
await writeFile(out+'/private/assets/clinical-app.js',appBindings.compiled);
await writeFile(out+'/private/assets/clinical-events.js',clinicalEventCode(new Set([...appBindings.actions,...noticeBindings.actions])));
html=html.replace(inline[0],'<!-- NC_CONTEXT --><script src="/clinical-app.js"></script><script src="/php-bootstrap.js"></script><script src="/notifications-ui.js"></script><script src="/php-files.js"></script><script src="/clinical-events.js"></script>');
await writeFile(out+'/private/assets/app.html',html);
await copyFile('docs/locaweb-php.md',out+'/LEIA-ME.md');
await copyFile('docs/publicacao-producao.md',out+'/PUBLICACAO.md');
await copyFile('scripts/backup-locaweb.ps1',out+'/private/backup-locaweb.ps1');
console.log('Pacote criado em release/locaweb-php. Sem credenciais ou banco de pacientes.');
