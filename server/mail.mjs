// Secrets stay on the server. SMTP never disables certificate validation.
export function mailSettings(env=process.env){
  const provider=env.MAIL_PROVIDER||'resend';
  const password=env.SMTP_PASSWORD||(env.SMTP_PASSWORD_B64?Buffer.from(env.SMTP_PASSWORD_B64,'base64').toString('utf8'):'');
  const smtp={host:env.SMTP_HOST||'',port:Number(env.SMTP_PORT||465),secure:String(env.SMTP_SECURE||'true')==='true',auth:{user:env.SMTP_USER||'',pass:password},requireTLS:true,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,logger:false,debug:false};
  return {provider,from:env.MAIL_FROM||'',smtp,configured:provider==='smtp'?Boolean(smtp.host&&smtp.auth.user&&password&&env.MAIL_FROM):provider==='resend'&&Boolean(env.RESEND_API_KEY&&env.MAIL_FROM)};
}
export function createMailer({env=process.env,transportFactory,fetchImpl=fetch}={}){
  const settings=mailSettings(env);let transport;
  const getTransport=async()=>{if(!transport){const create=transportFactory||(await import('nodemailer')).default.createTransport;transport=create(settings.smtp);}return transport;};
  async function send({to,link,purpose='Redefinir senha',subject,text}){
    if(!settings.configured)throw new Error('Envio de e-mail não configurado.');
    const message={from:settings.from,to,subject:subject||`${purpose} — Cuidado em Família`,text:text||`Para ${purpose.toLowerCase()}, acesse o link abaixo em até 30 minutos. Se não solicitou, ignore esta mensagem.\n${link}`};
    if(settings.provider==='smtp'){
      const result=await (await getTransport()).sendMail(message);
      if(!result.accepted?.length||result.rejected?.length)throw new Error('O servidor não aceitou o destinatário.');
      return {id:result.messageId};
    }
    const result=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({...message,to:[to]}),signal:AbortSignal.timeout(15000)});
    if(!result.ok)throw new Error('Falha no serviço de e-mail.');
    return result.json();
  }
  return {configured:settings.configured,provider:settings.provider,send,async verify(){if(!settings.configured)throw new Error('Informe a senha da conta de e-mail no arquivo local.');if(settings.provider!=='smtp')throw new Error('Verificação disponível apenas para SMTP.');return (await getTransport()).verify();}};
}
