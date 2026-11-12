function addGoogleLinkControl() {
    if (!config.googleConfigured || !account?.hasPassword) return;
    const options = root.querySelector('.profile-options');
    if (!options || options.querySelector('[data-google-link]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.googleLink = '';
    button.textContent = 'Vincular conta Google';
    button.addEventListener('click', () => {
        const dialog = modal('<h2 id="modalTitle">Vincular conta Google</h2><p>Confirme a senha e escolha a conta Google com o mesmo e-mail.</p><form><label>Senha atual <input name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></label><p class="error" role="alert"></p><button class="primary">Continuar com Google</button><button type="button" data-cancel>Cancelar</button></form>');
        dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.closeModal());
        dialog.querySelector('form').addEventListener('submit', async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const submit = form.querySelector('.primary');
            submit.disabled = true;
            try {
                const result = await api('google/start', {link:true, currentPassword:form.elements.currentPassword.value});
                location.assign(result.url);
            } catch (error) {
                form.querySelector('[role=alert]').textContent = error.message;
                submit.disabled = false;
            } finally {
                form.elements.currentPassword.value = '';
            }
        });
    });
    options.append(button);
}
new MutationObserver(addGoogleLinkControl).observe(root, {childList:true, subtree:true});
addGoogleLinkControl();
