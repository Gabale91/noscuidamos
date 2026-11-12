# Nós Cuidamos — Google Play

## Ficha preliminar

**Nome:** Nós Cuidamos

**Descrição curta:** Organize consultas, exames e medicamentos em família.

**Descrição completa:** Organize o cuidado em família. Cadastre pacientes, acompanhe consultas e exames, registre medicamentos prescritos e reúna documentos e observações em um só lugar. Convide familiares para consultar os dados compartilhados e acompanhe as atualizações na central de notificações. O aplicativo ajuda a organizar informações e não substitui orientação de profissionais de saúde.

## Antes de enviar

- Confirme o identificador definitivo. O APK desta rodada usa br.com.gabale.noscuidamos.teste.
- Valide HTTPS, migrations, SMTP, armazenamento privado e revogação no backend de homologação. Valide login Google no Android, recuperação e links de e-mail antes de apresentar esses recursos como completos.
- Configure Play App Signing e assine o AAB release com a chave de upload autorizada. Guarde chave e senhas fora do repositório e do chat.
- Capture login, início, agenda e medicamentos no APK com dados fictícios. Use os arquivos de evidência do CI para verificar instalação e identidade visual.
- Publique política de privacidade e página pública de solicitação de exclusão. Revise a segurança dos dados, declaração de saúde, classificação indicativa, público-alvo e instruções de acesso com conta de teste para revisão. Confirme o tratamento de dados e a retenção antes de preencher declarações definitivas.
- Na Play Console, selecione Testes fechados, cadastre os testadores, crie a versão, envie o AAB assinado e aguarde a liberação do link de adesão. Para contas pessoais novas sujeitas à regra, mantenha ao menos 12 testadores inscritos continuamente por 14 dias antes de solicitar acesso à produção.

## Assinatura do AAB

Depois de confirmar o identificador definitivo e o número de versão, gere o bundle release correspondente. Use a chave de upload cadastrada no Play App Signing. Execute localmente em um ambiente com JDK e informe a senha no prompt do terminal.

```text
jarsigner -keystore CAMINHO_PRIVADO_DA_CHAVE -signedjar nos-cuidamos-play.aab app-release.aab ALIAS_DA_CHAVE
jarsigner -verify -certs nos-cuidamos-play.aab
```

Compare a impressão digital do certificado com a chave de upload indicada no Play Console antes do envio.

## Minuta de privacidade para revisão

Nós Cuidamos utiliza nome e e-mail para criar a conta, confirmar o cadastro e gerenciar o acesso. O usuário pode incluir informações de pacientes, consultas, exames, medicamentos, observações e documentos para organizar os cuidados. Os dados ficam associados à conta e aos pacientes autorizados. Familiares vinculados podem consultar as informações compartilhadas enquanto o acesso estiver ativo.

O aplicativo usa o servidor contratado na Locaweb para autenticação, armazenamento e envio de mensagens de conta. Quando o login Google for habilitado, a política deverá identificar os dados de identidade recebidos e a finalidade da vinculação. A política final também deverá descrever o processamento de documentos, os dados técnicos e de auditoria, os backups e a exclusão.

Antes da publicação, complete a identificação do responsável pelo tratamento, os canais para pedidos de privacidade e exclusão, os prazos de retenção e os compartilhamentos efetivamente praticados. Valide a política final e publique-a em uma URL pública. Esta minuta descreve a finalidade do produto e exige confirmação das práticas efetivas.

Referências oficiais: https://support.google.com/googleplay/android-developer/answer/14151465 e https://support.google.com/googleplay/android-developer/answer/11926878.
