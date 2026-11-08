# Acesso, primeiro cadastro e conta

Implementação local para homologação, adicionada em 05/11/2026. As telas de autenticação e perfil funcionam pelo servidor Node, não ao abrir o HTML diretamente. Nenhuma conta de teste foi criada no banco de uso da usuária pelos testes automatizados: cada teste usa banco isolado em memória.

## Como testar

O servidor foi iniciado em `http://localhost:3000`. Abra esse endereço no navegador, selecione Primeiro acesso, preencha os campos, leia os documentos e aceite para concluir. A senha deve ter entre 3 e 128 caracteres, com pelo menos uma letra maiúscula e um número. Após entrar, use Mais opções → Meu perfil, ou o link Meu perfil e conta no topo.

Se o servidor tiver sido encerrado, abra o terminal na pasta do projeto e execute `node server/auth.mjs`. Requer Node 24; não precisa instalar pacotes adicionais. Para iniciar com configuração externa, copie `.env.example` para `.env`, preencha somente no computador/servidor e execute `node --env-file=.env server/auth.mjs`. Nunca versionar segredos. O serviço é vinculado apenas a 127.0.0.1 para teste local. APP_ORIGIN deve corresponder exatamente ao endereço usado; em produção exigir HTTPS e cookies Secure.

O arquivo HTML direto continua sendo a demonstração anterior sem autenticação. O fluxo autenticado está em `/`, `/app` e `/profile`. Os cadastros antigos do HTML não são importados automaticamente: novos dados locais são separados por identificador da conta e anexos por banco IndexedDB. Isso evita migração sem escolha do usuário. A autenticação não transforma armazenamento de navegador em banco clínico seguro de produção.

## Regras implementadas

- Login com e-mail e senha obrigatórios; mostrar/ocultar senha; mensagem de credenciais incorretas conforme especificação.
- Primeiro acesso com nome, e-mail, senha, confirmação e aceite obrigatório. E-mail é normalizado por espaços externos/maiúsculas e tem índice UNIQUE no banco, também abrangendo cadastro Google. Não fazer associação automática entre conta por senha e conta Google apenas pela coincidência de e-mail.
- Senhas protegidas por scrypt com salt aleatório; não armazenadas no HTML/localStorage. Cookies HttpOnly e SameSite; tokens de sessão opacos e armazenados como hash no banco.
- Sem Lembrar de mim, cookie de sessão e validade máxima de oito horas no servidor. Com a opção, persistência por 30 dias. Não guarda a senha no navegador. O comportamento de restauração de cookies de sessão também depende do navegador.
- Checkbox inicialmente desmarcado. Termos e Política abrem modais independentes sem reconstruir o formulário; voltar não aceita automaticamente. Conclusão desabilitada enquanto inválido. Versões atuais também são conferidas no servidor.
- Aceite armazena accountId, data/hora UTC, versão dos Termos e versão da Política. Alterar a versão aplicável no servidor bloqueia `/app` para sessões com aceite anterior até novo aceite. O conteúdo jurídico é provisório, explícito na tela; textos e política real precisam de aprovação antes de produção.
- Recuperação: resposta neutra, token aleatório com hash no banco, validade de 30 minutos, uso único. Redefinição revoga sessões e demais tokens de recuperação. Nenhum link é exposto em logs ou devolvido ao cliente.
- Meu perfil: nome e foto editáveis, com inclusão/troca/remoção de JPG/PNG até 200 KB; validação básica de assinatura do arquivo no servidor. Salvar exibe sucesso. Imagem não é enviada a terceiros.
- Novo e-mail fica pendente até confirmação por link de uso único de 30 minutos; exige sessão da mesma conta ao confirmar e verifica unicidade novamente no momento de gravar. Enquanto não confirmado, login continua com endereço anterior.
- Alterar senha exige senha atual para conta local e revoga todas as sessões ao concluir. Conta Google gerencia senha no Google; não é criada senha local silenciosamente.
- Saída abre modal com Cancelar e Sair da conta, revoga a sessão atual e redireciona ao login. Cadastros e documentos não são apagados.
- Excluir exige EXCLUIR exato, senha atual para conta local ou nova validação por link ao e-mail atual para conta Google (autorização de cinco minutos vinculada à sessão). Conta, foto, sessões, aceites e tokens são removidos do banco ativo em transação. O navegador solicita a exclusão do armazenamento clínico local da conta. Cancelar não altera dados.

## Configurações externas pendentes

**Google:** definir GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para cliente Web no Google Cloud, cadastrar `${APP_ORIGIN}/auth/google/callback` como redirect URI e preparar a tela de consentimento do provedor. Fluxo de código com estado vinculado a cookie e PKCE, troca no servidor e consulta autenticada do userinfo, exigindo e-mail verificado. Cadastro Google exige aceite prévio no aplicativo; conta nova usa nome/e-mail do provedor. Não foi executado contra uma conta Google real.

Referência: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

**E-mail:** definir RESEND_API_KEY e MAIL_FROM com remetente/domínio autorizado. Recuperação, novo endereço e validação de identidade usam envio no servidor. Sem essa configuração, a tela informa indisponibilidade; não simula sucesso. A escolha de fornecedor deve passar pela avaliação de privacidade e contratos antes de dados reais.

Referência: [Resend, envio de e-mail](https://resend.com/docs/api-reference/emails/send-email).

## Limites e retenção

Esta é uma base local, não um serviço clínico pronto para produção. Dados de saúde ainda estão no navegador; quem tem acesso ao perfil do navegador pode acessá-los, inclusive após logout por ferramentas locais. O servidor não oferece API clínica, criptografia de cache, compartilhamento familiar ou sincronização entre dispositivos. O arquivo HTML direto é uma demonstração legada e não deve ser distribuído como aplicativo autenticado.

Exclusão remove registros do banco ativo, não garante eliminação forense de páginas SQLite, backups, exportações e dados em outro navegador/dispositivo. A tela informa isso. Não há política aprovada de retenção obrigatória para dados reais; não foi inventado prazo de conservação. Produção exige centralizar os registros, estabelecer retenção por categoria e obrigação aplicável, processo de exclusão em backups, comprovante de conclusão/retenções e fluxo verificável para todos os dispositivos.

Limitador de tentativas e estado OAuth são locais ao processo; produção precisa armazenamento compartilhado, recuperação após reinício, monitoramento, verificação de e-mail de cadastro quando adotada, revisão de segurança e canal do titular. Ainda não implementado na base React Native: as telas entregues pertencem ao protótipo web servido localmente.

## Verificação

`node --test tests/auth.test.mjs tests/domain.test.mjs tests/prototype.test.cjs` valida cadastro, aceite, unicidade de e-mail, login inválido, cookies, logout, recuperação, confirmação de e-mail, exclusão com nova senha e regressões funcionais. Recuperação usa adaptador falso somente nos testes, sem envio real. Também foram conferidos login, primeiro acesso e modal de documento no navegador. Não foram homologados login Google, envio externo, fotos em aparelhos reais, restauração de backups ou distribuição móvel.

Meu perfil oferece também Termos de Uso e Política de Privacidade como itens de lista separados. Ambos abrem os mesmos documentos/versionamentos do cadastro em modal e retornam ao perfil sem alterar dados ou registrar aceite automaticamente.
