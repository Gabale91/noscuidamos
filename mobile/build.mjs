import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const repo=resolve(root,'..');
const out=root+'/www';
const assets=repo+'/release/locaweb-php/private/assets';
execFileSync(process.execPath,['scripts/package-php.mjs'],{cwd:repo,stdio:'inherit'});
await mkdir(out,{recursive:true});

const connect="connect-src 'self' https://noscuidamos.gabale.com.br";
const authPolicy="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "+connect;
const clinicalPolicy="default-src 'none'; script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "+connect+" https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com";
const csp=policy=>'<meta http-equiv="Content-Security-Policy" content="'+policy+"; base-uri 'none'; object-src 'none'; form-action 'none'"+'">';
const bridge='<script src="/api-bridge.js"></script>';

const login=(await readFile(assets+'/login.html','utf8'))
  .replace('<head>','<head>'+csp(authPolicy)+bridge)
  .replace('<script src="/google-link.js"></script>','');
await writeFile(out+'/index.html',login);
await writeFile(out+'/profile.html',login);

const app=(await readFile(assets+'/app.html','utf8'))
  .replace('<head>','<head>'+csp(clinicalPolicy)+bridge)
  .replace(/<!-- NC_CONTEXT -->.*?<\/script>(?=<\/body>)/s,
    '<p id="mobile-loading" role="status">Carregando seus dados…</p><script src="/clinical-entry.js"></script>');
await writeFile(out+'/app.html',app);

for(const file of ['auth-ui.js','clinical-app.js','notifications-ui.js','php-bootstrap.js','clinical-events.js','php-files.js','patient-admin-ui.js']){
  let js=await readFile(assets+'/'+file,'utf8');
  js=js.replaceAll("'/app'","'/app.html'").replaceAll("'/profile'","'/profile.html'");
  if(file==='auth-ui.js')js=js
    .replace("config=await api('config');","config=await api('config');config.googleConfigured=false;")
    .replace("catch(error){root.textContent=error.message;}})();","catch(error){config={features:['emailRegistration'],googleConfigured:false};page('login');message(error.message);const retry=document.createElement('button');retry.textContent='Tentar novamente';retry.onclick=()=>location.reload();root.append(retry);}})();");
  if(file==='php-files.js')js=js.replaceAll("location.assign('/api/files/download?id='+encodeURIComponent(d.serverFileId))","window.downloadMobileFile('/api/files/download?id='+encodeURIComponent(d.serverFileId),d.fileName)").replaceAll("location.assign('/api/files/download?id='+encodeURIComponent(r.serverFileId))","window.downloadMobileFile('/api/files/download?id='+encodeURIComponent(r.serverFileId),r.fileName)");
  await writeFile(out+'/'+file,js);
}
for(const file of ['api-bridge.js','clinical-entry.js','mobile-tools.js'])await copyFile(root+'/src/'+file,out+'/'+file);
await copyFile(repo+'/php/public/icon.svg',out+'/icon.svg');
console.log('Login, perfil e área clínica empacotados localmente.');
