# Nós Cuidamos no Android

O APK usa Capacitor para executar login, cadastro, confirmação de e-mail, perfil e telas clínicas empacotados no dispositivo. As operações de conta e de dados usam as APIs HTTPS de noscuidamos.gabale.com.br. O PHP e o MySQL ficam na Locaweb.

## Instalação

No GitHub Actions, abra a execução de Gerar APK Android de testes, baixe o artifact nos-cuidamos-apk-teste e extraia nos-cuidamos-teste.apk. A assinatura debug destina-se a instalação manual. O artifact nos-cuidamos-aab-sem-assinatura é a saída release para a etapa de assinatura com a chave de upload autorizada.

O login por senha recebe um token aleatório com validade de oito horas. O token fica na sessão do WebView e o servidor guarda seu hash. O Android transmite o token somente à API HTTPS do domínio configurado na compilação. Logout invalida a sessão no servidor. O frontend reutilizado mantém cache de sincronização por conta no dispositivo, que precisa de revisão antes do uso com dados reais.

O APK precisa de uma implantação compatível do backend e da configuração SMTP para concluir o cadastro. Login Google e retorno ao aplicativo pelos links de e-mail ainda exigem integração Android. Use apenas dados fictícios nesta homologação.
