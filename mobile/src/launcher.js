import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import {serverAddress} from './server-address.mjs';
const status=document.getElementById('status'),input=document.getElementById('server');
input.value=localStorage.getItem('nc-server')||'https://noscuidamos.gabale.com.br/';
document.getElementById('save').onclick=()=>{try{input.value=serverAddress(input.value);localStorage.setItem('nc-server',input.value);status.textContent='Endereço salvo.';}catch(e){status.textContent=e.message;}};
document.getElementById('online').onclick=async()=>{try{const url=serverAddress(input.value);if(Capacitor.isNativePlatform())await Browser.open({url,toolbarColor:'#087b67'});else location.assign(url);}catch(e){status.textContent=e.message||'Não foi possível abrir o aplicativo. Verifique a conexão.';}};
document.getElementById('build').textContent='APK de homologação • Capacitor • '+__BUILD_ID__;
