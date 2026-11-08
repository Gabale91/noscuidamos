import test from 'node:test';
import assert from 'node:assert/strict';
import { createMailer,mailSettings } from '../server/mail.mjs';
const env={MAIL_PROVIDER:'smtp',MAIL_FROM:'Cuidado em Família <contato@gabale.com.br>',SMTP_HOST:'email-ssl.com.br',SMTP_PORT:'465',SMTP_SECURE:'true',SMTP_USER:'contato@gabale.com.br',SMTP_PASSWORD:'somente-teste'};
test('Locaweb usa TLS e só informa envio após aceite SMTP',async()=>{
  const calls=[];const mail=createMailer({env,transportFactory:options=>{assert.equal(options.host,'email-ssl.com.br');assert.equal(options.port,465);assert.equal(options.secure,true);assert.equal(options.requireTLS,true);return {verify:async()=>true,sendMail:async message=>{calls.push(message);return {accepted:['teste@example.test'],rejected:[],messageId:'123'};}};}});
  assert.equal(mail.configured,true);await mail.verify();assert.equal(calls.length,0);
  await mail.send({to:'teste@example.test',link:'https://example.test/reset'});assert.equal(calls[0].from,env.MAIL_FROM);assert.match(calls[0].text,/https:\/\/example.test\/reset/);
});
test('sem senha permanece indisponível; senha local codificada é aceita',()=>{
  assert.equal(mailSettings({...env,SMTP_PASSWORD:''}).configured,false);
  assert.equal(mailSettings({...env,SMTP_PASSWORD:'',SMTP_PASSWORD_B64:Buffer.from('teste#"senha').toString('base64')}).smtp.auth.pass,'teste#"senha');
});
test('recusa SMTP rejeitada sem simular sucesso',async()=>{
  const mail=createMailer({env,transportFactory:()=>({sendMail:async()=>({accepted:[],rejected:['teste@example.test']})})});
  await assert.rejects(mail.send({to:'teste@example.test',text:'Teste'}));
});
