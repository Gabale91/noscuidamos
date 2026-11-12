async function loadClinicalApp() {
  const status = document.getElementById('mobile-loading');
  try {
    const response = await fetch('/api/mobile/context');
    if (response.status === 401) { location.replace('/index.html'); return; }
    if (!response.ok) throw new Error('Os dados estão indisponíveis. Tente novamente.');
    const context = document.createElement('script');
    context.id = 'phpSaved';
    context.type = 'application/json';
    context.textContent = JSON.stringify(await response.json());
    document.body.append(context);
    for (const src of ['/clinical-app.js','/php-bootstrap.js','/notifications-ui.js','/php-files.js','/clinical-events.js','/mobile-tools.js']) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Não foi possível carregar a tela.'));
        document.body.append(script);
      });
    }
    status.remove();
  } catch (error) {
    status.textContent = error.message;
    const retry = document.createElement('button');
    retry.textContent = 'Tentar novamente';
    retry.onclick = () => location.reload();
    status.append(retry);
  }
}
loadClinicalApp();
