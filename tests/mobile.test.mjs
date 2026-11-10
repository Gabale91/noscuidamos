import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serverAddress} from '../mobile/src/server-address.mjs';
test('APK aceita HTTPS e rede privada sem expor credenciais em URL',()=>{
 assert.equal(serverAddress('https://noscuidamos.gabale.com.br/app'),'https://noscuidamos.gabale.com.br/');
 assert.equal(serverAddress('http://192.168.1.10:3000'),'http://192.168.1.10:3000/');
 for(const url of ['javascript:alert(1)','file:///data/local','http://localhost:3000','http://127.0.0.1','http://public.example','https://user:senha@example.com','http://172.32.0.1'])assert.throws(()=>serverAddress(url));
});
test('APK mantém telas existentes e separa demonstração de conta real',async()=>{
 const index=await readFile(new URL('../mobile/src/index.html',import.meta.url),'utf8');
 assert.match(index,/sem login ou compartilhamento real/);assert.match(index,/notificações.*servidor/i);assert.match(index,/Nós Cuidamos/);
 const script=await readFile(new URL('../mobile/build.mjs',import.meta.url),'utf8');assert.match(script,/prototypes\/cuidado-em-familia-teste-fluxo-corrigido\.html/);assert.match(script,/prototype\.replace\('<\/body>'/);
});
