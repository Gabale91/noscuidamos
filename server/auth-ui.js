let config, account, resetToken, profilePhoto, pendingRegistration;
const root = document.getElementById('authRoot');
const escapeHTML = value => String(value || '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const input = (label, name, type='text', value='', required=true) => `<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${required?'required':''} ${type==='password'?'minlength="3" maxlength="128" pattern="(?=.*[A-Z])(?=.*[0-9]).{3,128}" title="Use pelo menos 3 caracteres, uma letra maiúscula e um número." autocomplete="new-password"':''}>`;
function passwordEye(visible){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible?'':'<path d="m3 3 18 18"/>'}</svg>`;}
function newPasswordRules(){
  return config?.features?.includes('emailRegistration')
    ? 'minlength="6" maxlength="72" pattern="(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^\\p{L}\\p{N}\\s]).{6,72}" autocomplete="new-password"'
    : 'minlength="3" maxlength="128" pattern="(?=.*[A-Z])(?=.*[0-9]).{3,128}" autocomplete="new-password"';
}
function password(label,name,login=false){return `<label for="${name}">${label}</label><div class="password"><input id="${name}" name="${name}" type="password" required ${login?'autocomplete="current-password"':newPasswordRules()}><button class="password-toggle" type="button" data-auth-click="toggle-password-${name}" aria-label="Mostrar ${label.toLowerCase()}" aria-controls="${name}" aria-pressed="false" title="Mostrar ${label.toLowerCase()}">${passwordEye(false)}</button></div>`;}
function togglePassword(id,button){const field=document.getElementById(id),show=field.type==='password';field.type=show?'text':'password';button.innerHTML=passwordEye(show);button.setAttribute('aria-pressed',String(show));const label=document.querySelector(`label[for="${id}"]`)?.textContent.toLowerCase()||'senha';button.setAttribute('aria-label',(show?'Ocultar ':'Mostrar ')+label);button.title=(show?'Ocultar ':'Mostrar ')+label;}
const consent = () => `<label class="check"><input name="accepted" type="checkbox" required><span>Li e concordo com os <button class="link" type="button" data-auth-click="terms">Termos de Uso</button> e declaro estar ciente da <button class="link" type="button" data-auth-click="privacy">Política de Privacidade</button> do Nós Cuidamos.</span></label>`;
const remember = () => '<label class="check"><input name="remember" type="checkbox"><span>Lembrar de mim</span></label>';
function message(text,error=true){const target=document.getElementById('message');target.className=error?'error':'note';target.textContent=text;}
async function api(path,body){const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
function formData(form){const data=Object.fromEntries(new FormData(form));return {...data,accepted:data.accepted==='on',remember:data.remember==='on',termsVersion:config.termsVersion,privacyVersion:config.privacyVersion};}
function formWatch(){const form=document.querySelector('form[data-watch]');if(!form)return;const update=()=>{const docs=window.ncLegalDocuments;const requiresDocs=config.features?.includes('emailRegistration')&&form.elements.accepted;const current=!requiresDocs||(docs?.terms.version===config.termsVersion&&docs?.privacy.version===config.privacyVersion);if(requiresDocs&&!current)message('Atualize o aplicativo para consultar os documentos vigentes.');const p=form.elements.password,c=form.elements.confirmPassword;if(c)c.setCustomValidity(c.value!==p.value?'As senhas não coincidem.':'');form.querySelector('[type=submit]').disabled=!current||!form.checkValidity();const google=document.getElementById('googleRegister');if(google)google.disabled=!current||!form.elements.accepted.checked||!config.googleConfigured;};form.addEventListener('input',update);form.addEventListener('change',update);update();}
function page(mode='login'){
  if(mode==='register')root.innerHTML=`<h1>Primeiro acesso</h1><form data-watch data-auth-submit="register-submit">${input('Nome completo','name')}${input('E-mail','email','email')}${password('Senha','password')}${password('Confirmação de senha','confirmPassword')}<p class="note">${config.features?.includes('emailRegistration')?'Use pelo menos 6 caracteres, incluindo maiúscula, minúscula, número e símbolo.':'Use de 3 a 128 caracteres, com pelo menos uma letra maiúscula e um número.'}</p>${input('Código do paciente (opcional)','patientCode','text',sessionStorage.getItem('cf-pending-patient-code')||'',false)}<p class="note">Recebeu um convite de um familiar? Informe o código para acessar o paciente compartilhado após concluir seu cadastro.</p>${remember()}${consent()}<p id="message" role="alert"></p><button class="primary" type="submit" disabled>${config.features?.includes('emailRegistration')?'Confirmar cadastro':'Concluir cadastro'}</button><button id="googleRegister" type="button" data-auth-click="google-register" disabled>Cadastrar com Google</button></form><p class="note">No cadastro Google, nome e e-mail vêm da conta escolhida; o aceite acima continua obrigatório.</p><button data-auth-click="login">Já tenho conta</button>`;
  else if(mode==='forgot')root.innerHTML=`<h1>Esqueci minha senha</h1><form data-auth-submit="forgot-submit">${input('E-mail','email','email')}<p id="message" role="alert"></p><button class="primary">Enviar link de redefinição</button></form>${window.ncAndroidApiOrigin?'<form data-auth-submit="android-recovery-submit"><label for="recoveryLink">Link recebido por e-mail</label><input id="recoveryLink" name="recoveryLink" type="url" required autocomplete="off"><button>Redefinir senha no aplicativo</button></form>':''}${!config.mailConfigured?'<p class="note">Envio de e-mail ainda não configurado neste ambiente.</p>':''}<button data-auth-click="login">Voltar ao login</button>`;
  else if(mode==='reset')root.innerHTML=`<h1>Redefinir senha</h1><form data-watch data-auth-submit="reset-submit">${password('Nova senha','password')}${password('Confirmação de senha','confirmPassword')}<p id="message" role="alert"></p><button class="primary" type="submit" disabled>Salvar nova senha</button></form><button data-auth-click="login">Voltar ao login</button>`;
  else if(mode==='consent')root.innerHTML=`<h1>Documentos atualizados</h1><p>Leia e aceite as versões atuais antes de continuar.</p><form data-watch data-auth-submit="consent-submit">${consent()}<p id="message" role="alert"></p><button class="primary" type="submit" disabled>Aceitar e continuar</button></form><button data-auth-click="consent-logout">Sair</button>`;
  else root.innerHTML=`<h1>Nós Cuidamos</h1><h2>Entrar na sua conta</h2><form data-auth-submit="login-submit">${input('E-mail','email','email')}${password('Senha','password',true)}${remember()}<p id="message" role="alert"></p><button class="primary" type="submit">Entrar</button></form><button data-auth-click="google-login" ${config.googleConfigured?'':'disabled'}>Entrar com Google</button>${!config.googleConfigured?'<p class="note">Login Google ainda não configurado.</p>':''}<button data-auth-click="register">Primeiro acesso</button><button class="link" style="margin-top:18px" data-auth-click="forgot">Esqueci minha senha</button>`;
  formWatch();
}
async function submitAuth(e,path){e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;try{await api(path,formData(e.target));await route();}catch(error){message(error.message);button.disabled=false;formWatch();}}
function confirmationPage(){
  root.innerHTML=`<h1>Confirmar e-mail</h1><p>Informe o código enviado para <strong>${escapeHTML(pendingRegistration.email)}</strong>.</p>
    <form data-auth-submit="register-confirm"><label for="code">Código de confirmação</label>
    <input id="code" name="code" required minlength="6" maxlength="6" pattern="[A-Za-z0-9]{6}" autocomplete="one-time-code">
    <button class="primary">Confirmar e-mail</button></form>
    <form data-auth-submit="register-resend">${input('E-mail para reenvio ou correção','email','email',pendingRegistration.email)}
    <button>Enviar novo código</button></form><p class="note">Para reenviar ao mesmo endereço, aguarde 60 segundos.</p>
    <p id="message" role="alert"></p><button data-auth-click="login">Voltar ao login</button>`;
  document.getElementById('code').focus();
}
async function startRegistration(event){
  if(!config.features?.includes('emailRegistration')) return submitAuth(event,'register');
  await registrationRequest(event,async data=>{
    const result=await api('register',data);
    pendingRegistration={token:result.registrationToken,email:data.email};
    confirmationPage();
  });
}
async function confirmRegistration(event){
  await registrationRequest(event,async data=>{
    const result=await api('register/confirm',{code:data.code,registrationToken:pendingRegistration.token});
    pendingRegistration=null;
    sessionStorage.removeItem('cf-pending-patient-code');
    page('login');
    message(result.message,false);
  });
}
async function resendRegistration(event){
  await registrationRequest(event,async data=>{
    const result=await api('register/resend',{email:data.email,registrationToken:pendingRegistration.token});
    pendingRegistration={token:result.registrationToken,email:data.email};
    confirmationPage();
    message('Novo código solicitado. Confira seu e-mail.',false);
  });
}
async function registrationRequest(event,request){
  event.preventDefault();
  const button=event.target.querySelector('button');
  button.disabled=true;
  try{await request(formData(event.target));}
  catch(error){message(error.message);}
  finally{button.disabled=false;}
}
async function google(register){try{const {accepted,remember,termsVersion,privacyVersion,patientCode}=formData(document.querySelector('form'));const result=await api('google/start',{accepted,remember,termsVersion,privacyVersion,patientCode,register});location.assign(result.url);}catch(error){message(error.message);}}
async function forgot(e){e.preventDefault();try{const data=await api('forgot',formData(e.target));message(data.message,false);}catch(error){message(error.message);}}
function openAndroidRecovery(event){
  event.preventDefault();
  const link=String(new FormData(event.target).get('recoveryLink')||'').trim();
  try{
    const url=new URL(link);
    const tokens=url.searchParams.getAll('reset');
    if(url.origin!==window.ncAndroidApiOrigin||url.pathname!=='/'||url.username||url.password||
       tokens.length!==1||!/^[a-f0-9]{64}$/.test(tokens[0]))throw new Error();
    resetToken=tokens[0];
    page('reset');
  }catch{message('Cole o link de redefinição recebido no e-mail do Nós Cuidamos.');}
}
async function resetPassword(e){e.preventDefault();try{await api('reset',{...formData(e.target),token:resetToken});resetToken=null;history.replaceState(null,'','/');page();message('Senha redefinida. Entre com sua nova senha.',false);}catch(error){message(error.message);}}
function modal(content){const previous=document.activeElement,dialog=document.createElement('dialog');dialog.innerHTML=content;dialog.setAttribute('aria-labelledby','modalTitle');const close=()=>{dialog.close();dialog.remove();previous?.focus();};dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(dialog);dialog.showModal();dialog.closeModal=close;return dialog;}
function legal(type){
 const doc=window.ncLegalDocuments?.[type];
 if(!doc)return;
 const back=document.querySelector('[data-auth-submit="register-submit"]')?'Voltar ao cadastro':'Voltar';
 modal(`<h2 id="modalTitle">${escapeHTML(doc.title)}</h2><p>Incorporado ao aplicativo em 11/11/2026.</p><div class="legal">${escapeHTML(doc.text)}</div><button type="button" data-auth-click="close-dialog">${back}</button>`);
}
async function route(){const state=await api('me');account=state.user;if(!account){page();return;}if(state.needsConsent){page('consent');return;}if(location.pathname==='/profile'){await profile();return;}const pendingCode=sessionStorage.getItem('cf-pending-patient-code');if(pendingCode){await api('notifications/join-patient',{code:pendingCode});sessionStorage.removeItem('cf-pending-patient-code');}const pendingNotice=sessionStorage.getItem('cf-pending-notification');sessionStorage.removeItem('cf-pending-notification');location.replace('/app'+(pendingNotice?'?notification='+encodeURIComponent(pendingNotice):''));}

function profileIcon(name){const shapes={document:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h6"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',exit:'<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h12"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',back:'<path d="m10 5-7 7 7 7M3 12h18"/>'};return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+shapes[name]+'</svg>'}
async function profile(){const data=await api('profile');account=data.user;profilePhoto=account.photo||'';root.innerHTML=`<div class="profile-heading"><button class="profile-back" type="button" aria-label="Voltar ao aplicativo" data-auth-click="back-to-app">‹</button><h1>Meu perfil</h1></div><div class="profile-summary">${profilePhoto?'<img class="profile-photo" alt="Foto de perfil" src="'+escapeHTML(profilePhoto)+'">':'<span class="profile-avatar" aria-hidden="true">'+profileIcon('user')+'</span>'}<div><strong>${escapeHTML(account.name)}</strong><p>${escapeHTML(account.email)}</p><p><b>ID do usuário:</b> ${escapeHTML(account.id)}</p></div></div><p id="message" role="alert"></p><nav class="profile-options" aria-label="Opções da conta">${[['Dados pessoais','user','editProfile()'],['Alterar senha','lock','changePassword()'],['Termos de Uso','document',"legal('terms')"],['Política de Privacidade','document',"legal('privacy')"],['Sair da conta','exit','logoutModal()'],['Excluir conta','trash','deleteModal()']].map(([label,icon,action])=>`<button class="profile-row ${icon==='trash'?'danger':''}" type="button" data-auth-click="${action}"><span class="profile-row-icon">${profileIcon(icon)}</span><span class="profile-row-label">${label}</span><svg class="profile-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7"/></svg></button>`).join('')}</nav>`}
async function editProfile(){const data=await api('profile');account=data.user;profilePhoto=account.photo||'';root.innerHTML=`<div class="profile-heading"><button class="profile-back" type="button" aria-label="Voltar ao meu perfil" data-auth-click="profile">‹</button><h1>Dados pessoais</h1></div><form data-auth-submit="profile-submit"><img id="profilePhoto" class="profile-photo" alt="Foto de perfil" ${profilePhoto?'src="'+escapeHTML(profilePhoto)+'"':'hidden'}><label for="photo">Adicionar ou alterar foto (JPG/PNG, até 200 KB)</label><input id="photo" type="file" accept="image/jpeg,image/png" data-auth-change="photo-change"><button type="button" data-auth-click="photo-remove">Remover foto</button>${input('Nome completo','name','text',account.name)}${input('E-mail','email','email',account.email)}<p class="note">Um novo e-mail só será aplicado após confirmação pelo link enviado ao novo endereço.</p><p id="message" role="alert"></p><button class="primary">Salvar alterações</button></form><button type="button" data-auth-click="profile">Cancelar</button>`;}
async function choosePhoto(input){const file=input.files[0];if(!file)return;if(file.size>200000||!['image/jpeg','image/png'].includes(file.type)){input.value='';message('Use JPG ou PNG com até 200 KB.');return;}profilePhoto=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const image=document.getElementById('profilePhoto');image.src=profilePhoto;image.hidden=false;}
async function saveProfile(e){e.preventDefault();try{const data=await api('profile',{...formData(e.target),photo:profilePhoto});message(data.message,false);}catch(error){message(error.message);}}
function logoutModal(){modal('<h2 id="modalTitle">Deseja sair da sua conta?</h2><p>Você precisará realizar o login novamente para acessar suas informações.</p><p class="error" role="alert"></p><button data-auth-click="close-dialog">Cancelar</button><button class="primary" data-auth-click="logout">Sair da conta</button>');}
async function logout(button){button.disabled=true;try{await api('logout',{});location.replace('/');}catch(error){button.closest('dialog').querySelector('[role=alert]').textContent=error.message;button.disabled=false;}}
function changePassword(){modal(`<h2 id="modalTitle">Alterar senha</h2><form data-auth-submit="password-submit">${password('Senha atual','currentPassword',true)}${password('Nova senha','password')}${password('Confirmação de senha','confirmPassword')}<p class="error" role="alert"></p><button class="primary">Salvar nova senha</button><button type="button" data-auth-click="close-dialog">Cancelar</button></form>`);}
async function updatePassword(e){e.preventDefault();try{await api('password',formData(e.target));location.replace('/?changed=1');}catch(error){e.target.querySelector('[role=alert]').textContent=error.message;}}
function deleteModal(){modal(`<h2 id="modalTitle">Excluir conta permanentemente?</h2><p>Ao confirmar, sua conta será excluída e você perderá o acesso aos seus dados, incluindo consultas, exames, medicamentos e agendamentos.</p><p>Esta ação não poderá ser desfeita. Nesta versão de testes, a conta, seus aceites e notificações serão removidos do banco ativo e os dados locais desta conta neste navegador serão apagados. Se houver pacientes compartilhados sob sua responsabilidade, será necessário revogar os vínculos antes da exclusão. Cópias exportadas, backups externos e dados em outros navegadores não são apagados automaticamente.</p><form data-auth-submit="delete-submit"><label for="deleteText">Para confirmar, digite EXCLUIR</label><input id="deleteText" name="confirmation" data-auth-input="delete-confirm" autocomplete="off">${account.hasPassword?password('Senha atual','currentPassword',true):'<p>Valide sua identidade pelo link enviado ao e-mail atual antes de excluir.</p><button type="button" data-auth-click="reauth">Enviar validação de identidade</button>'}<p class="error" role="alert"></p><button class="primary" type="submit" disabled>Excluir minha conta</button><button type="button" data-auth-click="close-dialog">Cancelar</button></form>`);}
async function sendReauth(button){try{await api('reauth/request',{});button.textContent='Link de validação enviado';}catch(error){button.closest('form').querySelector('[role=alert]').textContent=error.message;}}
async function deleteAccount(e){e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;try{const data=formData(e.target);await api('delete-account',data);localStorage.removeItem('cuidado-familia-account-'+account.id);localStorage.removeItem('cuidado-familia-account-'+account.id+':notification-outbox');localStorage.removeItem('cuidado-familia-account-'+account.id+':notification-revision');indexedDB.deleteDatabase('cuidado-familia-files-'+account.id);location.replace('/?deleted=1');}catch(error){e.target.querySelector('[role=alert]').textContent=error.message;button.disabled=false;}}
(async()=>{try{config=await api('config');const query=new URLSearchParams(location.search);if(/^[a-f0-9-]{36}$/.test(query.get('notification')||''))sessionStorage.setItem('cf-pending-notification',query.get('notification'));if(query.has('patientCode'))sessionStorage.setItem('cf-pending-patient-code',query.get('patientCode'));resetToken=query.get('reset');if(resetToken){history.replaceState(null,'','/');page('reset');return;}if(query.has('verifyEmail')){await api('email/confirm',{token:query.get('verifyEmail')});history.replaceState(null,'','/profile');await route();message('E-mail confirmado e atualizado.',false);return;}if(query.has('reauth')){await api('reauth/confirm',{token:query.get('reauth')});history.replaceState(null,'','/profile');await route();message('Identidade validada por 5 minutos. Você pode solicitar a exclusão.',false);return;}await route();if(query.has('deleted'))message('Exclusão concluída no banco ativo. Os dados locais desta conta neste navegador foram removidos.',false);if(query.has('changed'))message('Senha alterada. Entre novamente.',false);if(query.has('error'))message('Não foi possível concluir o acesso Google. Se já possui conta por senha, utilize-a; para uma nova conta, selecione Primeiro acesso e aceite os documentos.');}catch(error){root.textContent=error.message;}})();

const authActions = {
    terms: () => legal('terms'),
    privacy: () => legal('privacy'),
    login: () => page(),
    register: () => page('register'),
    forgot: () => page('forgot'),
    'login-submit': e => submitAuth(e,'login'),
    'register-submit': startRegistration,
    'register-confirm': confirmRegistration,
    'register-resend': resendRegistration,
    'consent-submit': e => submitAuth(e,'consent'),
    'forgot-submit': forgot,
    'android-recovery-submit': openAndroidRecovery,
    'reset-submit': resetPassword,
    'google-register': () => google(true),
    'google-login': () => google(false),
    'consent-logout': () => api('logout',{}).then(() => page()),
    'close-dialog': (_e, element) => element.closest('dialog').closeModal(),
    'back-to-app': () => location.assign('/app'),
    profile: () => profile(),
    'profile-submit': saveProfile,
    'photo-change': (_e, element) => choosePhoto(element),
    'photo-remove': () => {
        profilePhoto = '';
        document.getElementById('profilePhoto').hidden = true;
        document.getElementById('photo').value = '';
    },
    logout: (_e, element) => logout(element),
    'password-submit': updatePassword,
    'delete-submit': deleteAccount,
    'delete-confirm': (_e, element) => {
        element.form.querySelector('[type=submit]').disabled = element.value !== 'EXCLUIR';
    },
    reauth: (_e, element) => sendReauth(element),
    'editProfile()': () => editProfile(),
    'changePassword()': () => changePassword(),
    "legal('terms')": () => legal('terms'),
    "legal('privacy')": () => legal('privacy'),
    'logoutModal()': () => logoutModal(),
    'deleteModal()': () => deleteModal()
};
for (const eventName of ['click','submit','change','input']) {
    const attribute = 'data-auth-' + eventName;
    document.addEventListener(eventName, event => {
        const element = event.target.closest?.('[' + attribute + ']');
        if (!element || (!root.contains(element) && !element.closest('dialog'))) return;
        const action = element.getAttribute(attribute);
        if (eventName === 'click' && action.startsWith('toggle-password-')) {
            togglePassword(action.slice('toggle-password-'.length), element);
        } else if (Object.hasOwn(authActions, action)) {
            authActions[action](event, element);
        }
    });
}
