import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

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
