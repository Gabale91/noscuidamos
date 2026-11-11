import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));const main=root+'/android/app/src/main';
await mkdir(main+'/java/br/com/gabale/noscuidamos/teste',{recursive:true});
for(const f of ['MainActivity.java','NativeToolsPlugin.java'])await copyFile(root+'/native/'+f,main+'/java/br/com/gabale/noscuidamos/teste/'+f);
const vector='<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#087b67" android:pathData="M0,0h108v108h-108z"/><path android:fillColor="#ffffff" android:pathData="M54,81C42,71 24,58 24,43C24,27 44,23 54,37C64,23 84,27 84,43C84,58 66,71 54,81Z"/></vector>';
const pulse='<path android:strokeColor="#087b67" android:strokeWidth="3.5" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M34,51H44L49,43L54,61L60,46L64,51H74"/>';
const icon=vector.replace('</vector>',pulse+'</vector>');
for(const dir of ['mipmap-anydpi','mipmap-anydpi-v26','drawable'])await mkdir(main+'/res/'+dir,{recursive:true});
for(const name of ['ic_launcher','ic_launcher_round']){await writeFile(main+'/res/mipmap-anydpi/'+name+'.xml',icon);await writeFile(main+'/res/mipmap-anydpi-v26/'+name+'.xml','<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/nc_green"/><foreground android:drawable="@drawable/nc_icon"/></adaptive-icon>');}
await writeFile(main+'/res/drawable/nc_icon.xml',icon);
await writeFile(main+'/res/values/nc_colors.xml','<resources><color name="nc_green">#087b67</color></resources>');
let manifest=await readFile(main+'/AndroidManifest.xml','utf8');if(!manifest.includes('android:usesCleartextTraffic='))manifest=manifest.replace('<application','<application android:usesCleartextTraffic="false"');await writeFile(main+'/AndroidManifest.xml',manifest);
console.log('Nome, ícone, impressão PDF e salvamento de anexos preparados.');
