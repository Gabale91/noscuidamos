import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createNotifications, expoTransport } from './notifications.mjs';
import { createInviteLinks } from './invites.mjs';
import { createMailer } from './mail.mjs';
const scrypt = promisify(scryptCallback);
export const LEGAL_VERSION = '2026-11-05.1';
const invalidLogin = 'E-mail ou senha incorretos. Verifique os dados informados e tente novamente.';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const emailValid = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const passwordValid = value => typeof value === 'string' && value.length >= 3 && value.length <= 128 && /[A-Z]/.test(value) && /[0-9]/.test(value);

export async function createAuthServer(options = {}) {
  const origin = options.origin || process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  const secure = new URL(origin).protocol === 'https:';
  const dbPath = options.dbPath || resolve('data/auth.sqlite');
  if (dbPath !== ':memory:') mkdirSync(resolve(dbPath, '..'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT,google_sub TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS consents(user_id TEXT NOT NULL REFERENCES users(id),terms TEXT NOT NULL,privacy TEXT NOT NULL,accepted_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS profile_photos(user_id TEXT PRIMARY KEY REFERENCES users(id),photo TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,payload TEXT,expires INTEGER NOT NULL);
  `);
  const termsVersion = options.termsVersion || LEGAL_VERSION;
  const privacyVersion = options.privacyVersion || LEGAL_VERSION;
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const mailer=createMailer();
  const mailConfigured = Boolean(options.sendMail || mailer.configured);
  const attempts = new Map(), oauth = new Map(), reauthenticated = new Map();
  const stmt = sql => db.prepare(sql);
  const notifications = createNotifications(db,{sendPush:options.sendPush||expoTransport()});
  const inviteLinks=createInviteLinks(db,notifications,{origin,publicOrigin:options.publicOrigin||process.env.APP_PUBLIC_URL||(origin.startsWith('https:')?origin:''),playStoreUrl:options.playStoreUrl||process.env.PLAY_STORE_URL||''});
  const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${age === undefined ? '' : `; Max-Age=${age}`}`;
  const getCookie = (req, name) => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
  const session = req => {
    const value = getCookie(req, 'cf_session');
    return value && stmt('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(value), Date.now());
  };
  const hasConsent = user => Boolean(stmt('SELECT 1 FROM consents WHERE user_id=? AND terms=? AND privacy=?').get(user.id, termsVersion, privacyVersion));
  const accept = id => stmt('INSERT INTO consents VALUES(?,?,?,?)').run(id, termsVersion, privacyVersion, new Date().toISOString());
  const startSession = (res, user, remember) => {
    const value = token(), ttl = remember ? 30 * 86400000 : 8 * 3600000;
    stmt('INSERT INTO sessions VALUES(?,?,?)').run(hash(value), user.id, Date.now() + ttl);
    res.setHeader('Set-Cookie', cookie('cf_session', value, remember ? ttl / 1000 : undefined));
  };
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const redirect = (res, path) => { res.writeHead(302, { Location: path }); res.end(); };
  const reject = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const versions = body => { if (body.accepted !== true || body.termsVersion !== termsVersion || body.privacyVersion !== privacyVersion) reject('Leia e aceite as versões atuais dos Termos de Uso e da Política de Privacidade.'); };
  const passwordHash = async password => { const salt = token(); return salt + ':' + Buffer.from(await scrypt(password, salt, 64)).toString('hex'); };
  const dummyHash = await passwordHash(token());
  const verify = async (password, stored) => { const [salt, value] = (stored || dummyHash).split(':'); const derived = await scrypt(password, salt, 64); return timingSafeEqual(Buffer.from(value, 'hex'), derived) && Boolean(stored); };
  const sendMail = options.sendMail || mailer.send;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(req.url, origin), path = url.pathname;
      if(req.method==='GET'&&path==='/healthz'){db.prepare('SELECT 1').get();return json(res,200,{status:'ok'});}
      if(req.method==='GET'&&path.startsWith('/convite/')){const landing=inviteLinks.landing(path.slice('/convite/'.length),/Android/i.test(req.headers['user-agent']||''));if(landing.redirect)return redirect(res,landing.redirect);res.writeHead(landing.status,{'Content-Type':'text/html; charset=utf-8'});return res.end(landing.html);}
      let body = {};
      if (req.method === 'POST') {
        if (req.headers.origin !== origin) reject('Origem da solicitação inválida.', 403);
        if (!String(req.headers['content-type']).startsWith('application/json')) reject('Formato inválido.', 415);
        // Bounded, local-development rate limiting. Shared deployments need a shared store.
        const bucket = `${req.socket.remoteAddress}:${path}`, now = Date.now();
        for (const [key, item] of attempts) if (now > item.until) attempts.delete(key);
        const entry = attempts.get(bucket) || { count: 0, until: now + 60000 };
        if (++entry.count > (path.startsWith('/api/notifications/')?120:20)) reject('Muitas tentativas. Aguarde um minuto.', 429);
        attempts.set(bucket, entry);
        let text = '';
        for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > (path === '/api/notifications/sync'?2000000:path === '/api/profile' ? 300000 : 16000)) reject('Solicitação muito grande.', 413); }
        try { body = JSON.parse(text); } catch { reject('Dados inválidos.'); }
      }
      if (path === '/api/config') return json(res, 200, { termsVersion, privacyVersion, googleConfigured, mailConfigured, build:'2026-11-06-invites',features:['patientCodes','inviteEmail','smartLinks'] });
      if (path === '/api/me') {
        const user = session(req);
        return json(res, 200, user ? { user: { id: user.id, name: user.name, email: user.email }, needsConsent: !hasConsent(user) } : { user: null });
      }
      if(path.startsWith('/api/notifications/')){
        const user=session(req);if(!user||!hasConsent(user))reject('Entre e aceite os documentos para acessar as notificações.',401);
        const action=path.slice('/api/notifications/'.length);
        if(req.method==='GET'&&action==='list')return json(res,200,notifications.list(user.id));
        if(req.method==='GET'&&action==='state')return json(res,200,{revision:notifications.revision(user.id),patients:notifications.membership(user.id),push:notifications.queueStatus(user.id)});
        if(req.method==='GET'&&action==='patient-code')return json(res,200,notifications.patientCode(user.id,url.searchParams.get('patient')));
        if(req.method==='GET'&&action==='share-invite')return json(res,200,inviteLinks.info(user.id,url.searchParams.get('patient')));
        if(req.method==='POST'&&action==='send-invite'){
          const email=normalizeEmail(body.email);if(!emailValid(email))reject('Informe um e-mail válido.');
          const invite=inviteLinks.info(user.id,body.patient);
          if(!mailConfigured)reject('Envio de e-mail ainda não configurado neste ambiente.',503);
          if(!invite.publicConfigured)reject('Configure um endereço público do aplicativo antes de enviar convites por e-mail.',503);
          const id=inviteLinks.recordEmail(body.patient,email);
          try{await sendMail({to:email,link:invite.link,purpose:'Convite para acompanhar paciente',subject:'💚 Você recebeu um convite — Cuidado em Família',text:invite.message});inviteLinks.emailStatus(id,'Enviado');}
          catch{inviteLinks.emailStatus(id,'Falha');reject('Não foi possível enviar o convite por e-mail. Tente novamente.',503);}
          return json(res,200,{message:'Convite aceito pelo serviço de e-mail para envio. A entrega depende do provedor.'});
        }
        if(req.method==='POST'&&action==='join-patient')return json(res,200,notifications.joinCode(user.id,body.code));
        if(req.method==='GET'&&action==='shared-patients')return json(res,200,{patients:notifications.sharedPatients(user.id)});
        if(req.method==='GET'&&action==='shared-patient')return json(res,200,notifications.sharedPatient(user.id,url.searchParams.get('patient')));
        if(req.method==='GET'&&action==='details')return json(res,200,notifications.details(user.id,url.searchParams.get('id')));
        if(req.method==='GET'&&action==='push-details')return json(res,200,notifications.pushDetails(user.id,url.searchParams.get('id')));
        if(req.method==='POST'&&action==='sync')return json(res,200,notifications.sync(user.id,body));
        if(req.method==='POST'&&action==='read'){notifications.read(user.id,body.id);return json(res,200,{ok:true});}
        if(req.method==='POST'&&action==='invite')return json(res,201,notifications.invite(user.id,body));
        if(req.method==='POST'&&action==='accept')return json(res,200,notifications.accept(user.id,body));
        if(req.method==='POST'&&action==='revoke'){notifications.revoke(user.id,body);return json(res,200,{ok:true});}
        if(req.method==='POST'&&action==='device'){notifications.registerDevice(user.id,hash(getCookie(req,'cf_session')||''),body);return json(res,201,{ok:true});}
        reject('Operação de notificações inválida.',404);
      }
      if (path === '/api/profile') {
        const user = session(req); if (!user || !hasConsent(user)) reject('Entre e aceite os documentos atuais.', 401);
        if (req.method === 'GET') return json(res, 200, { user: { id: user.id, name: user.name, email: user.email, hasPassword: Boolean(user.password), photo: stmt('SELECT photo FROM profile_photos WHERE user_id=?').get(user.id)?.photo || '' } });
        if (req.method !== 'POST') reject('Método inválido.', 405);
        const name = String(body.name || '').trim(), email = normalizeEmail(body.email), photo = String(body.photo || '');
        if (!name || name.length > 150 || !emailValid(email)) reject('Informe nome completo e e-mail válido.');
        if (photo) {
          const match = photo.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
          if (!match) reject('Use foto JPG ou PNG.');
          const bytes = Buffer.from(match[2], 'base64');
          if (bytes.length > 200000 || (match[1] === 'png' ? bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' : bytes.subarray(0,3).toString('hex') !== 'ffd8ff')) reject('Foto inválida ou maior que 200 KB.');
        }
        const changed = email !== user.email;
        if (changed) {
          if (stmt('SELECT 1 FROM users WHERE email=?').get(email)) reject('Este e-mail já está cadastrado em outra conta. Informe um e-mail diferente.', 409);
          if (!mailConfigured) reject('A validação de novo e-mail depende da configuração de envio de mensagens.', 503);
          const value = token();
          stmt("DELETE FROM challenges WHERE user_id=? AND kind='email'").run(user.id);
          stmt('INSERT INTO challenges VALUES(?,?,?,?,?)').run(hash(value), user.id, 'email', email, Date.now() + 1800000);
          try { await sendMail({ to: email, link: `${origin}/?verifyEmail=${value}`, purpose: 'Confirmar novo e-mail' }); }
          catch { stmt('DELETE FROM challenges WHERE token=?').run(hash(value)); reject('Não foi possível enviar a validação do novo e-mail.',503); }
        }
        db.exec('BEGIN IMMEDIATE');
        try { stmt('UPDATE users SET name=? WHERE id=?').run(name,user.id); stmt('INSERT INTO profile_photos VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET photo=excluded.photo').run(user.id,photo); db.exec('COMMIT'); }
        catch(error){db.exec('ROLLBACK');throw error;}
        return json(res,200,{message: changed?'Nome e foto atualizados. Confirme o link enviado ao novo e-mail para concluir a alteração do endereço.':'Perfil atualizado com sucesso.'});
      }
      if (req.method === 'POST' && path === '/api/email/confirm') {
        const user = session(req); if (!user) reject('Entre na sua conta para confirmar o novo endereço.',401);
        db.exec('BEGIN IMMEDIATE');
        try {
          const challenge=stmt("SELECT * FROM challenges WHERE token=? AND user_id=? AND kind='email' AND expires>?").get(hash(String(body.token||'')),user.id,Date.now());
          if(!challenge)reject('Link inválido ou expirado.');
          if(stmt('SELECT 1 FROM users WHERE email=? AND id<>?').get(challenge.payload,user.id))reject('Este e-mail já está cadastrado em outra conta. Informe um e-mail diferente.',409);
          stmt('UPDATE users SET email=? WHERE id=?').run(challenge.payload,user.id);
          stmt("DELETE FROM challenges WHERE user_id=? AND kind='email'").run(user.id);db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        return json(res,200,{ok:true});
      }
      if (req.method === 'POST' && path === '/api/password') {
        const user=session(req);if(!user||!hasConsent(user))reject('Entre novamente.',401);
        if(!user.password)reject('Esta conta usa Google. Gerencie a senha na sua conta Google.');
        if(typeof body.currentPassword!=='string'||body.currentPassword.length>128||!await verify(body.currentPassword,user.password))reject('Senha atual incorreta.',401);
        if(!passwordValid(body.password)||body.password!==body.confirmPassword)reject('Informe senhas iguais, com 3 a 128 caracteres, pelo menos uma letra maiúscula e um número.');
        const password=await passwordHash(body.password);
        db.exec('BEGIN IMMEDIATE');
        try{stmt('UPDATE users SET password=? WHERE id=?').run(password,user.id);stmt('DELETE FROM sessions WHERE user_id=?').run(user.id);stmt('DELETE FROM resets WHERE user_id=?').run(user.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        notifications.invalidateUser(user.id);
        res.setHeader('Set-Cookie',cookie('cf_session','',0));return json(res,200,{ok:true});
      }
      if(req.method==='POST'&&path==='/api/reauth/request'){
        const user=session(req);if(!user)reject('Entre novamente.',401);
        if(!mailConfigured)reject('Validação por e-mail ainda não configurada.',503);
        const value=token();stmt('INSERT INTO challenges VALUES(?,?,?,?,?)').run(hash(value),user.id,'reauth',null,Date.now()+1800000);
        try{await sendMail({to:user.email,link:`${origin}/?reauth=${value}`,purpose:'Validar identidade para exclusão'});}catch{stmt('DELETE FROM challenges WHERE token=?').run(hash(value));reject('Não foi possível enviar a validação.',503);}
        return json(res,200,{ok:true});
      }
      if(req.method==='POST'&&path==='/api/reauth/confirm'){
        const user=session(req);if(!user)reject('Entre novamente.',401);
        const value=hash(String(body.token||'')),challenge=stmt("SELECT * FROM challenges WHERE token=? AND user_id=? AND kind='reauth' AND expires>?").get(value,user.id,Date.now());
        if(!challenge)reject('Link inválido ou expirado.');stmt('DELETE FROM challenges WHERE token=?').run(value);
        reauthenticated.set(hash(getCookie(req,'cf_session')),Date.now()+300000);return json(res,200,{ok:true});
      }
      if(req.method==='POST'&&path==='/api/delete-account'){
        const user=session(req);if(!user||!hasConsent(user))reject('Entre e aceite os documentos atuais.',401);
        if(body.confirmation!=='EXCLUIR')reject('Digite EXCLUIR para confirmar.');
        if(user.password){if(typeof body.currentPassword!=='string'||body.currentPassword.length>128||!await verify(body.currentPassword,user.password))reject('Senha atual incorreta.',401);}
        else if((reauthenticated.get(hash(getCookie(req,'cf_session')))||0)<Date.now())reject('Valide novamente sua identidade pelo link enviado por e-mail.',403);
        db.exec('BEGIN IMMEDIATE');
        try{inviteLinks.deleteUser(user.id);notifications.deleteUser(user.id);for(const table of ['sessions','consents','resets','challenges','profile_photos'])stmt(`DELETE FROM ${table} WHERE user_id=?`).run(user.id);stmt('DELETE FROM users WHERE id=?').run(user.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        res.setHeader('Set-Cookie',cookie('cf_session','',0));return json(res,200,{ok:true,message:'Conta removida do banco ativo. Cópias externas não são removidas automaticamente.'});
      }
      if (req.method === 'POST' && path === '/api/register') {
        const name = String(body.name || '').trim(), email = normalizeEmail(body.email);
        if (!name || name.length > 150 || !emailValid(email)) reject('Informe nome completo e e-mail válido.');
        if (!passwordValid(body.password)) reject('A senha deve ter de 3 a 128 caracteres, com pelo menos uma letra maiúscula e um número.');
        if (body.password !== body.confirmPassword) reject('As senhas não coincidem.');
        versions(body);
        const password = await passwordHash(body.password), user = { id: randomUUID(), name, email };
        db.exec('BEGIN IMMEDIATE');
        try {
          if (stmt('SELECT 1 FROM users WHERE email=?').get(email)) reject('Este e-mail já possui uma conta. Entre ou recupere sua senha.', 409);
          stmt('INSERT INTO users VALUES(?,?,?,?,NULL)').run(user.id, name, email, password); accept(user.id);
          if(String(body.patientCode||'').trim())notifications.joinCode(user.id,body.patientCode);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        startSession(res, user, body.remember === true); return json(res, 201, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/login') {
        const email = normalizeEmail(body.email);
        if (!emailValid(email) || typeof body.password !== 'string' || !body.password || body.password.length > 128) reject(invalidLogin, 401);
        const user = stmt('SELECT * FROM users WHERE email=?').get(email);
        if (!await verify(body.password, user?.password)) reject(invalidLogin, 401);
        startSession(res, user, body.remember === true); return json(res, 200, { ok: true, needsConsent: !hasConsent(user) });
      }
      if (req.method === 'POST' && path === '/api/consent') {
        const user = session(req); if (!user) reject('Entre novamente.', 401);
        versions(body); if (!hasConsent(user)) accept(user.id); return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/logout') {
        notifications.invalidateSession(hash(getCookie(req,'cf_session')||''));
        stmt('DELETE FROM sessions WHERE token=?').run(hash(getCookie(req, 'cf_session') || ''));
        res.setHeader('Set-Cookie', cookie('cf_session', '', 0)); return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/forgot') {
        if (!emailValid(normalizeEmail(body.email))) reject('Informe um e-mail válido.');
        if (!mailConfigured) reject('Envio de e-mail ainda não configurado neste ambiente.', 503);
        const user = stmt('SELECT * FROM users WHERE email=?').get(normalizeEmail(body.email));
        if (user?.password) {
          const value = token(); stmt('INSERT INTO resets VALUES(?,?,?)').run(hash(value), user.id, Date.now() + 1800000);
          try { await sendMail({ to: user.email, link: `${origin}/?reset=${value}` }); }
          catch { stmt('DELETE FROM resets WHERE token=?').run(hash(value)); reject('Serviço de e-mail indisponível. Tente novamente mais tarde.', 503); }
        }
        return json(res, 200, { message: 'Se houver uma conta com senha para este e-mail, você receberá as instruções de redefinição.' });
      }
      if (req.method === 'POST' && path === '/api/reset') {
        if (!passwordValid(body.password)) reject('A senha deve ter de 3 a 128 caracteres, com pelo menos uma letra maiúscula e um número.');
        if (body.password !== body.confirmPassword) reject('As senhas não coincidem.');
        const password = await passwordHash(body.password);
        db.exec('BEGIN IMMEDIATE');
        try {
          const reset = stmt('SELECT * FROM resets WHERE token=? AND expires>?').get(hash(String(body.token || '')), Date.now());
          if (!reset) reject('Link inválido ou expirado. Solicite uma nova redefinição.');
          stmt('UPDATE users SET password=? WHERE id=?').run(password, reset.user_id);
          stmt('DELETE FROM sessions WHERE user_id=?').run(reset.user_id);
          stmt('DELETE FROM resets WHERE user_id=?').run(reset.user_id); db.exec('COMMIT');
          notifications.invalidateUser(reset.user_id);
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/google/start') {
        if (!googleConfigured) reject('Login Google ainda não configurado neste ambiente.', 503);
        if (body.register) versions(body);
        const state = token(), verifier = token(), binding = token();
        for (const [key, value] of oauth) if (value.expires < Date.now()) oauth.delete(key);
        oauth.set(state, { verifier, binding, register: body.register === true, remember: body.remember === true, patientCode:body.register?String(body.patientCode||'').slice(0,100):'', expires: Date.now() + 600000, termsVersion, privacyVersion });
        res.setHeader('Set-Cookie', cookie('cf_oauth', binding, 600));
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: `${origin}/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
        return json(res, 200, { url: authUrl.href });
      }
      if (path === '/auth/google/callback') {
        const state = url.searchParams.get('state'), flow = oauth.get(state); oauth.delete(state);
        if (!flow || flow.expires < Date.now() || getCookie(req, 'cf_oauth') !== flow.binding || !url.searchParams.get('code')) return redirect(res, '/?error=google');
        res.setHeader('Set-Cookie', cookie('cf_oauth', '', 0));
        const exchange = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, code: url.searchParams.get('code'), code_verifier: flow.verifier, redirect_uri: `${origin}/auth/google/callback`, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(15000) });
        if (!exchange.ok) return redirect(res, '/?error=google');
        const tokens = await exchange.json();
        const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000) });
        if (!info.ok) return redirect(res, '/?error=google');
        const identity = await info.json();
        if (!identity.sub || identity.email_verified !== true || !emailValid(identity.email)) return redirect(res, '/?error=google');
        let user = stmt('SELECT * FROM users WHERE google_sub=?').get(identity.sub);
        if (!user) {
          if (stmt('SELECT 1 FROM users WHERE email=?').get(normalizeEmail(identity.email))) return redirect(res, '/?error=existing');
          if (!flow.register) return redirect(res, '/?error=firstaccess');
          if (flow.termsVersion !== termsVersion || flow.privacyVersion !== privacyVersion) return redirect(res, '/?error=consent');
          user = { id: randomUUID(), name: String(identity.name || identity.email).slice(0,150), email: normalizeEmail(identity.email) };
          db.exec('BEGIN IMMEDIATE');
          try { stmt('INSERT INTO users VALUES(?,?,?,NULL,?)').run(user.id, user.name, user.email, identity.sub); accept(user.id); if(flow.patientCode)notifications.joinCode(user.id,flow.patientCode); db.exec('COMMIT'); }
          catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        if(flow.register&&flow.patientCode)notifications.joinCode(user.id,flow.patientCode);
        startSession(res, user, flow.remember); return redirect(res, '/');
      }
      if (req.method === 'GET' && path === '/app') {
        const user = session(req); if (!user || !hasConsent(user)) return redirect(res, /^[a-f0-9-]{36}$/.test(url.searchParams.get('notification')||'')?'/?notification='+url.searchParams.get('notification'):'/');
        let html = readFileSync(resolve('prototypes/cuidado-em-familia-teste-fluxo-corrigido.html'), 'utf8');
        html = html.replace("const KEY='cuidado-familia-demo-v3-clean';", `const KEY='cuidado-familia-account-${user.id}';`);
        html = html.replace("indexedDB.open('cuidado-familia-files',1)", `indexedDB.open('cuidado-familia-files-${user.id}',1)`);
        // Recheck the session before showing cached local content after back/forward navigation.
        html = html.replace(/render\(\);\s*<\/script>/, "userProfile=()=>{location.assign('/profile');return '<main>Abrindo perfil…</main>'};window.addEventListener('pageshow',()=>fetch('/api/me').then(r=>r.json()).then(s=>{if(!s.user||s.needsConsent)location.replace('/')}));render();\n</script>");
        html=html.replace('</body>','<script src="/notifications-ui.js"></script></body>');
        html=html.replace('Os dados ficam armazenados apenas neste navegador, neste dispositivo. Não há login, servidor, compartilhamento real, notificações nem envio de e-mails. Não insira dados médicos verdadeiros.','Ambiente local de testes com autenticação e central de notificações. Metadados de atendimento são sincronizados ao servidor; arquivos ficam neste navegador. O compartilhamento de leitura exige convite aceito. Push e e-mail dependem de configuração externa. Use dados fictícios.');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html);
      }
      if (req.method === 'GET' && (path === '/' || path === '/profile')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(readFileSync(resolve('server/login.html')));
      }
      if (req.method === 'GET' && path === '/auth-ui.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(readFileSync(resolve('server/auth-ui.js'))); }
      if (req.method === 'GET' && path === '/notifications-ui.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(readFileSync(resolve('server/notifications-ui.js'))); }
      json(res, 404, { error: 'Página não encontrada.' });
    } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Não foi possível concluir. Tente novamente.' }); }
  });
  const notificationTimer=setInterval(()=>notifications.work().catch(()=>{}),15000);
  notificationTimer.unref();
  server.on('close', () => {clearInterval(notificationTimer);db.close();});
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if(existsSync(resolve('.env')))process.loadEnvFile(resolve('.env'));
  const server = await createAuthServer();
  server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('Cuidado em Família: ' + (process.env.APP_ORIGIN || 'http://localhost:3000')));
}
