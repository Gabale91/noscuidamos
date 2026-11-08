import { readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,existsSync } from 'node:fs';
import { resolve,join,relative,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=resolve('.'),out=resolve('release','servidor-'+Date.now());
if(!out.startsWith(root+sep))throw Error('Destino inválido.');
mkdirSync(out,{recursive:true});
const entries=[];
function copy(source,target){const destination=join(out,target);mkdirSync(resolve(destination,'..'),{recursive:true});copyFileSync(source,destination);entries.push(target.replaceAll('\\','/'));}
function tree(directory,prefix){for(const entry of readdirSync(directory,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Links simbólicos não são permitidos no pacote.');const path=join(directory,entry.name),target=join(prefix,entry.name);if(entry.isDirectory())tree(path,target);else copy(path,target);}}
tree('server','server');
copy('prototypes/cuidado-em-familia-teste-fluxo-corrigido.html','prototypes/cuidado-em-familia-teste-fluxo-corrigido.html');
tree('node_modules/nodemailer','node_modules/nodemailer');
for(const file of ['Dockerfile','compose.yaml','Caddyfile','package.json','package-lock.json','runtime.env.example'])copy(join('deploy',file),join('deploy',file));
copy('deploy/package.json','package.json');copy('deploy/package-lock.json','package-lock.json');
copy('deploy/runtime.env.example','.env.example');copy('deploy/LEIA-ME-FTP.txt','LEIA-ME-FTP.txt');
if(entries.some(path=>/(^|\/)(\.env|auth\.sqlite(?:-.*)?|runtime\.env)$/.test(path)||path.startsWith('data/')))throw Error('Arquivo privado encontrado.');
const manifest={createdAt:new Date().toISOString(),domain:'noscuidamos.gabale.com.br',uploaded:false,files:entries.sort().map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(out,path))).digest('hex')}))};
writeFileSync(join(out,'manifesto.json'),JSON.stringify(manifest,null,2));
// Archive creation uses only a new allowlisted staging directory, never the workspace root.
const archive=resolve('release','cuidado-em-familia-servidor.zip');
execFileSync('tar',['-a','-cf',archive,'-C',out,'.']);
const names=execFileSync('tar',['-tf',archive],{encoding:'utf8'}).trim().split(/\r?\n/);
if(names.some(path=>/(^|\/)(\.env|auth\.sqlite(?:-.*)?|runtime\.env)$/.test(path)))throw Error('Verificação do arquivo falhou.');
console.log(JSON.stringify({archive,files:manifest.files.length,privateDataIncluded:false,uploaded:false}));
