export function serverAddress(value){
 const u=new URL(value),host=u.hostname;
 const privateIp=/^10\.(\d{1,3}\.){2}\d{1,3}$/.test(host)||/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)||/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
 if(u.username||u.password||host==='localhost'||host==='127.0.0.1'||(u.protocol!=='https:'&&!(u.protocol==='http:'&&privateIp)))throw Error('Use HTTPS ou o IP privado do computador na mesma rede. Não use localhost nem credenciais no endereço.');
 return u.origin+'/';
}
