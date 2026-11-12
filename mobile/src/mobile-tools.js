const tools = window.Capacitor.Plugins.NativeTools;
window.print = () => tools.print().catch(error => toast(error.message));

window.downloadMobileFile = async (path, name) => {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Documento indisponível ou acesso revogado.');
    const blob = await response.blob();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await tools.saveDocument({base64,name:name || 'documento',mime:blob.type});
  } catch (error) {
    toast(error.message);
  }
};
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="/api/files/download?"]');
  if (!link) return;
  event.preventDefault();
  window.downloadMobileFile(link.getAttribute('href'),link.textContent.trim());
});
