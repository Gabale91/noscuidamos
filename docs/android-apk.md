# Nós Cuidamos — APK Android para testes

## Baixar e instalar

1. Abra https://github.com/Gabale91/noscuidamos/actions/workflows/android-apk.yml e entre no GitHub.
2. Abra a execução mais recente com indicação verde. Caso não exista, selecione Run workflow na branch main.
3. Na seção Artifacts, baixe nos-cuidamos-apk-teste. Extraia o ZIP e transfira nos-cuidamos-teste.apk para o celular.
4. Abra o APK e autorize a instalação por esse navegador/gerenciador de arquivos, se o Android solicitar. Não precisa publicar na Play Store nem contratar serviço.
5. O nome instalado é Nós Cuidamos. Identificador de testes: br.com.gabale.noscuidamos.teste. Requer Android 7 ou superior (SDK mínimo do Capacitor 8).

O artifact dura 30 dias; uma nova execução o gera novamente. O APK usa assinatura debug gerada no compilador. Builds de execuções diferentes podem usar chaves diferentes e exigir desinstalar a versão anterior, apagando os dados locais dessa versão. Preserve seus testes antes disso. Não é uma versão de produção ou chave definitiva para lojas.

## O que está dentro do APK

O projeto completo atual é uma aplicação web HTML/JavaScript. Há dois servidores equivalentes em desenvolvimento: Node/SQLite e PHP 8.3/MySQL para a Locaweb. App.js/Expo é somente uma base inicial e não contém os módulos completos; essa base foi preservada. O APK usa Capacitor 8 em mobile/, sem modificar regras do protótipo ou migrar silenciosamente os dados.

- **Demonstração local:** o HTML existente é empacotado e executado no WebView Android, com a mesma identidade visual e regras de pacientes, agendamentos, medicamentos, familiares, leitura de documentos com revisão humana, anexos e relatórios. Não exige servidor para cadastros locais. A leitura OCR e PDF usa bibliotecas já carregadas via internet pelo protótipo. Não é um login fictício nem sincroniza dados da conta.
- **Entrar no aplicativo:** abre o servidor configurado em uma aba do navegador do Android (Custom Tab). Assim, login Google, cookies, downloads e as funções web continuam usando o navegador suportado, sem transportar senhas para código nativo nem usar login Google dentro de WebView proibido. Voltar retorna ao APK. A experiência com conta é a versão web, não uma conversão completa para telas nativas.
- Relatórios da demonstração usam o serviço de impressão Android, incluindo Salvar como PDF. Anexos PDF/JPG/PNG locais usam o seletor de destino do Android para salvar cópias; a entrada de arquivos continua usando o seletor existente do Capacitor. Não solicita acesso amplo ao armazenamento.

Os cadastros do navegador do computador não são transferidos automaticamente. Dados locais da demonstração, cookies do navegador do Android e dados do servidor são ambientes diferentes. A demonstração preserva as limitações e os limites do HTML existente; novos anexos da versão PHP podem usar o limite de 10 MB quando o backend estiver configurado.

## Dependências reais das funcionalidades

| Função | Requisito no celular |
| --- | --- |
| Login, conta, recuperação, perfil e aceites | Backend publicado, HTTPS, banco e sessões funcionando |
| Login Google | Cliente OAuth e callback configurados; ainda pendente de homologação |
| Pacientes, consultas, exames e medicamentos locais | Funcionam na demonstração, com armazenamento do WebView |
| Dados entre aparelhos, códigos e familiares autorizados | Backend e MySQL/SQLite; não se conectam apenas por instalar APK |
| Convite por WhatsApp/e-mail | Conta e backend, link público e SMTP; o usuário confirma envio no WhatsApp |
| Anexos compartilhados | Pasta privada gravável e permissões do PHP; pendente na hospedagem |
| Central de notificações | Versão web autenticada e backend |
| Push com aplicativo fechado | Integração nativa/push não concluída no projeto atual; APK não cria essa função |
| Relatório PDF e cópia dos anexos locais | Seletor de impressão/arquivos do Android; precisa ser homologado no celular real |

Na preparação deste APK, a publicação Locaweb ainda dependia da senha/configuração MySQL e da permissão de gravação na pasta privada. SMTP foi autenticado no servidor sem enviar mensagem de teste. O APK não corrige essas pendências nem contém credenciais do servidor. Sem backend, o acesso com conta pode apresentar erro; a demonstração local permanece disponível.

Para testar o backend Node no computador na mesma rede: inicie-o com HOST=0.0.0.0 e APP_ORIGIN=http://IP-DO-COMPUTADOR:3000. No APK, em Endereço do servidor de testes, informe esse endereço. PORT padrão é 3000. O computador precisa estar ligado e o firewall permitir acesso nessa rede. Não use localhost: no celular ele aponta para o celular. Para internet, utilize HTTPS.

## Compilar gratuitamente

O workflow usa runner padrão Ubuntu do GitHub no repositório público, sem EAS, Appflow, Render, chave da Play Store ou serviços pagos. O workflow não publica a aplicação, não muda DNS, não inclui .env, bancos, FTP, senhas ou anexos reais. Dependências ficam fixadas em mobile/package-lock.json. Fontes Java da integração de PDF/arquivos em mobile/native/.

Localmente, requer Node 22+, JDK 21 e Android SDK compatível com Capacitor 8. Na pasta mobile: npm ci --ignore-scripts; npm run build; npm run android:prepare; depois cd android e ./gradlew assembleDebug (gradlew.bat assembleDebug no Windows). APK em mobile/android/app/build/outputs/apk/debug/app-debug.apk.

Referências: https://capacitorjs.com/docs/getting-started/environment-setup e https://capacitorjs.com/docs/apis/browser.
