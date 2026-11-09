import { randomBytes,createHash } from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const escape=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export function familyInviteMessage(name,code,link){return `\u{1F49A} *Você recebeu um convite!*\n\nOlá! \u{1F44B}\n\nVocê foi convidado para acompanhar os cuidados de saúde de *${String(name).normalize('NFC').replace(/[\r\n*]/g,' ')}* pelo nosso aplicativo.\n\n\u{1F4F2} *Baixe o app:*\n${link}\n\n\u{1F510} *Código de vinculação:*\n${code}\n\nCadastre-se no aplicativo e utilize o código para vincular o paciente.\n\n\u{1F49A} *Cuidar de quem amamos é melhor juntos!*`;}
export function createInviteLinks(db,notifications,{origin,publicOrigin='',playStoreUrl=''}={}){
  db.exec('CREATE TABLE IF NOT EXISTS n_share_links(id TEXT PRIMARY KEY,patient TEXT NOT NULL,code_hash TEXT NOT NULL,UNIQUE(patient,code_hash)); CREATE TABLE IF NOT EXISTS n_email_invites(id TEXT PRIMARY KEY,patient TEXT NOT NULL,recipient TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,sent_at TEXT);');
  const q=sql=>db.prepare(sql);
  let publicURL='';
  if(publicOrigin){const url=new URL(publicOrigin);if(url.protocol!=='https:'||['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw new Error('APP_PUBLIC_URL deve ser um endereço público HTTPS.');publicURL=url.origin;}
  let store='';
  if(playStoreUrl){const url=new URL(playStoreUrl);if(url.origin!=='https://play.google.com'||url.pathname!=='/store/apps/details'||!/^[A-Za-z0-9_.]+$/.test(url.searchParams.get('id')||''))throw new Error('PLAY_STORE_URL deve ser o endereço oficial do aplicativo na Google Play.');store=url.href;}
  function info(user,patient){
    const {code}=notifications.patientCode(user,patient),record=notifications.sharedPatient(user,patient),codeHash=hash(code);
    let entry=q('SELECT id FROM n_share_links WHERE patient=? AND code_hash=?').get(patient,codeHash);
    if(!entry){entry={id:randomBytes(24).toString('base64url')};q('INSERT INTO n_share_links VALUES(?,?,?)').run(entry.id,patient,codeHash);}
    const link=(publicURL||origin)+'/convite/'+entry.id;
    return {patientName:record.name,patientId:patient,code,link,message:familyInviteMessage(record.name,code,link),publicConfigured:Boolean(publicURL),storeConfigured:Boolean(store)};
  }
  function resolve(id){
    const row=q('SELECT l.*,p.owner,c.code FROM n_share_links l JOIN n_patients p ON p.id=l.patient JOIN n_patient_codes c ON c.patient=p.id WHERE l.id=?').get(id);
    const code=row?.code?.match(/.{1,4}/g)?.join('-');
    return row&&hash(code)===row.code_hash?{code}:null;
  }
  function landing(id,android){
    const invite=resolve(id);if(!invite)return {status:404,html:'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><h1>Convite indisponível</h1><p>Solicite um novo convite ao responsável pelo paciente.</p></html>'};
    if(android&&store)return {status:302,redirect:store};
    const login='/?patientCode='+encodeURIComponent(invite.code);
    return {status:200,html:`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convite — Nós Cuidamos</title><style>body{font:16px/1.6 system-ui;background:#e8f2ef;color:#102332;margin:0}main{max-width:440px;margin:32px auto;padding:24px;background:white;border-radius:20px}h1{color:#087b67}a{display:block;background:#087b67;color:white;padding:14px;text-align:center;border-radius:12px;text-decoration:none;margin:14px 0}code{font-size:18px;overflow-wrap:anywhere}p{overflow-wrap:anywhere}</style></head><body><main><h1>💚 Nós Cuidamos</h1><p>Você recebeu um convite para acompanhar um paciente.</p><p><b>Código de vinculação:</b><br><code>${escape(invite.code)}</code></p>${store?`<a href="${escape(store)}">Baixar na Google Play</a>`:'<p>O aplicativo ainda não possui um link da Google Play configurado. O download estará disponível após a publicação.</p>'}<a href="${escape(login)}">Já tenho conta ou quero acessar pela web</a><p>Ao se cadastrar, informe o código acima. Compartilhe o código apenas com pessoas autorizadas.</p></main></body></html>`};
  }
  return {info,landing,publicConfigured:Boolean(publicURL),storeConfigured:Boolean(store),deleteUser(user){for(const p of q('SELECT id FROM n_patients WHERE owner=?').all(user)){q('DELETE FROM n_share_links WHERE patient=?').run(p.id);q('DELETE FROM n_email_invites WHERE patient=?').run(p.id);}const account=q('SELECT email FROM users WHERE id=?').get(user);if(account)q('DELETE FROM n_email_invites WHERE recipient=?').run(account.email);},recordEmail(patient,email){const id=randomBytes(16).toString('hex');q('INSERT INTO n_email_invites VALUES(?,?,?,?,?,NULL)').run(id,patient,email,'Pendente',new Date().toISOString());return id;},emailStatus(id,status){q('UPDATE n_email_invites SET status=?,sent_at=? WHERE id=?').run(status,status==='Enviado'?new Date().toISOString():null,id);}};
}
