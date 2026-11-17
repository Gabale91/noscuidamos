const apiOrigin = 'https://noscuidamos.gabale.com.br';
window.ncAndroidApiOrigin = apiOrigin;
const sessionKey = 'nc-android-session';
const originalFetch = window.fetch.bind(window);
const rememberedSession = options => window.Capacitor?.Plugins?.NativeTools?.rememberedSession(options);
const restoredSession = (async () => {
  if (sessionStorage.getItem(sessionKey)) return;
  try {
    const saved = await rememberedSession({});
    if (/^[a-f0-9]{64}$/.test(saved?.token || '')) sessionStorage.setItem(sessionKey, saved.token);
  } catch {}
})();

window.fetch = async function (input, options = {}) {
  if (typeof input !== 'string' || !input.startsWith('/api/')) return originalFetch(input, options);
  await restoredSession;
  const headers = new Headers(options.headers);
  headers.set('X-NC-Android', '1');
  const token = sessionStorage.getItem(sessionKey);
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const route = new URL(input,apiOrigin);
    const endpoint = new URL('/index.php',apiOrigin);
    endpoint.search = route.search;
    endpoint.searchParams.set('nc_route',route.pathname==='/api/delete-account'?'/api/account/closure':route.pathname);
    const response = await originalFetch(endpoint, {
      ...options, headers, credentials: 'omit', redirect: 'error',
      signal: options.signal ?? controller.signal
    });
    if (input === '/api/login' && response.ok) {
      const data = await response.clone().json();
      if (!/^[a-f0-9]{64}$/.test(data.sessionToken || '')) throw Error('Sessão inválida.');
      sessionStorage.setItem(sessionKey, data.sessionToken);
      const {remember} = JSON.parse(options.body);
      await rememberedSession({token:remember===true?data.sessionToken:''});
    }
    if ((response.ok && ['/api/logout','/api/password','/api/delete-account'].includes(input)) ||
        (response.status === 401 && input !== '/api/login')) {
      sessionStorage.removeItem(sessionKey);
      await rememberedSession({token:''});
    }
    if(input==='/api/me'&&response.ok&&!(await response.clone().json()).user&&token){
      sessionStorage.removeItem(sessionKey);
      await rememberedSession({token:''});
    }
    return response;
  } catch {
    throw new Error('Não foi possível conectar ao Nós Cuidamos. Verifique a internet e tente novamente.');
  } finally {
    clearTimeout(timeout);
  }
};
