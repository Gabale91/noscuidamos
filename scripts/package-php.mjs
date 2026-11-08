import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve('release/locaweb-php');
// A fixed, workspace-owned staging directory, never an FTP destination.
await mkdir(out,{recursive:true});
await cp('php/public',out+'/public',{recursive:true});
await cp('php/src',out+'/private/src',{recursive:true});
await cp('php/assets',out+'/private/assets',{recursive:true});
await copyFile('php/config.example.php',out+'/private/config.example.php');
await copyFile('php/schema.sql',out+'/private/schema.sql');
for(const [source,target] of [['server/login.html','login.html'],['server/auth-ui.js','auth-ui.js'],['server/notifications-ui.js','notifications-ui.js'],['prototypes/cuidado-em-familia-teste-fluxo-corrigido.html','app.html']])await copyFile(source,out+'/private/assets/'+target);
// index lives in /web/noscuidamos; the private directory is a sibling OUTSIDE /web.
const {readFile}=await import('node:fs/promises');let index=await readFile(out+'/public/index.php','utf8');
index=index.replace("getenv('CUIDADO_PRIVATE')?:dirname(__DIR__)","getenv('CUIDADO_PRIVATE')?:dirname(__DIR__, 2).'/cuidado-private'");
await writeFile(out+'/public/index.php',index);
let notices=await readFile(out+'/private/assets/notifications-ui.js','utf8');
notices=notices.replace("family:record.family||[],patientInfo:","family:record.family||[],history:record.history||[],patientInfo:").replace("['data','photo','history']","['data','photo']");
await writeFile(out+'/private/assets/notifications-ui.js',notices);
let auth=await readFile(out+'/private/assets/auth-ui.js','utf8');
auth=auth.replace('Os arquivos anexados ficam no navegador de origem.','Novos anexos ficam em armazenamento privado no servidor e são acessíveis apenas às contas autorizadas. Anexos anteriores podem permanecer no navegador de origem.').replace('banco local do servidor','banco MySQL do servidor');
await writeFile(out+'/private/assets/auth-ui.js',auth);
let html=await readFile(out+'/private/assets/app.html','utf8');
html=html.replaceAll('até 1,5 MB por arquivo','até 10 MB por arquivo').replace('Demonstração: permissões reais entre usuários ainda não implementadas.','Acesso aos documentos e dados compartilhados validado pelo servidor.').replace('Receitas anexadas ainda não são suportadas nesta demonstração.','Receitas podem ser anexadas ao pós-atendimento da consulta.').replace('Os dados ficam armazenados apenas neste navegador, neste dispositivo. Não há login, servidor, compartilhamento real, notificações nem envio de e-mails. Não insira dados médicos verdadeiros.','Ambiente de homologação com autenticação, sincronização MySQL e documentos privados. Use dados fictícios até concluir a validação da hospedagem.');
await writeFile(out+'/private/assets/app.html',html);
await copyFile('docs/locaweb-php.md',out+'/LEIA-ME.md');
console.log('Pacote criado em release/locaweb-php. Sem credenciais ou banco de pacientes.');
