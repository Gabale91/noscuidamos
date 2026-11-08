import { loadEnvFile } from 'node:process';
import { createMailer } from '../server/mail.mjs';
loadEnvFile('.env');
try{await createMailer().verify();console.log('Conexão segura e autenticação de e-mail verificadas. Nenhuma mensagem foi enviada.');}
catch(error){console.error('Não foi possível validar o e-mail. Confira senha, servidor e acesso SMTP na Locaweb. Código: '+String(error.code||'CONFIGURACAO'));process.exitCode=1;}
