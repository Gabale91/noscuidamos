# Google e SMTP na Locaweb

Destino: https://noscuidamos.gabale.com.br. Não contratar novos serviços nem habilitar faturamento.

## Google OAuth

No projeto do proprietário em https://console.cloud.google.com/auth/overview, configurar a marca/tela de consentimento com o nome Nós Cuidamos, e-mail de suporte e domínio autorizado gabale.com.br. Para homologação, manter público externo em modo de teste e cadastrar os e-mails dos testadores. Os links de termos e privacidade devem apontar a documentos reais publicados; os textos atuais do aplicativo são provisórios.

Criar cliente OAuth do tipo Aplicativo da Web. Usar:

- Origem JavaScript autorizada: `https://noscuidamos.gabale.com.br`
- URI de redirecionamento autorizada, exatamente: `https://noscuidamos.gabale.com.br/auth/google/callback`
- Escopos solicitados pelo aplicativo: `openid email profile`. Não solicita acesso ao Gmail, Drive ou contatos.

Guardar client_id e client_secret no arquivo cuidado-config.php fora de /web, na seção google. Não enviar client_secret pelo chat, não colocar em JavaScript, Git ou pasta pública. O botão Google só é habilitado quando as credenciais e cURL estiverem disponíveis. Validar cadastro com aceite explícito, login, cancelamento e recusa de vincular automaticamente uma conta existente apenas por e-mail.

Criar um cliente OAuth não exige contratar uma hospedagem Google para este aplicativo. Se aparecer pedido de contratar produto ou ativar faturamento, interromper essa etapa.

Documentação: https://developers.google.com/identity/protocols/oauth2/web-server

## SMTP existente

- Servidor: email-ssl.com.br
- Porta: 465, TLS implícito
- Usuário e remetente: noscuidamos@gabale.com.br
- Senha: configuração privada existente; não duplicar em arquivos públicos.

A biblioteca PHP verifica certificado e hostname e suporta 465/TLS ou 587/STARTTLS. Não há fallback para conexão sem TLS. A verificação com verifyOnly=true autentica e encerra a conexão sem enviar mensagem. Convites e recuperação só são considerados submetidos quando o servidor SMTP confirma a mensagem; isso não comprova entrega na caixa do destinatário.

## Pré-requisitos da publicação

Host, banco, usuário e senha MySQL da conta contratada; schema importado; pasta privada files gravável pelo PHP; HTTPS válido. Não substituir o site principal Gabale. Não usar credenciais de banco de outro sistema sem isolamento e autorização. FTP pode transferir arquivos mesmo quando o processo PHP não possui permissão de gravar: essa permissão deve ser configurada especificamente para a pasta de anexos.
