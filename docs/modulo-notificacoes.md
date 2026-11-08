# Módulo de notificações — entrega local

Implementado em 05/11/2026, integrado à versão servida em http://localhost:3000/app. O HTML aberto diretamente continua sem o módulo de servidor.

## O que funciona

- Sino na tela inicial com contador de não lidas. Lista da mais recente à mais antiga, leitura individual, marcar todas e abertura de detalhes atuais.
- Eventos após persistência: cancelamento/realização de consultas ou exames; inclusão/alteração/suspensão/conclusão de medicamento; pós-atendimento e anexação de resultado. Criação e reagendamento não geram sino.
- Histórico por usuário/paciente em SQLite. IDs de evento e notificação são UUIDs. Leitura é individual e as permissões são verificadas na listagem, leitura e abertura.
- Sincronização dos metadados clínicos do protótipo com fila persistida no navegador, revisão e chave de lote para repetição sem avisos duplicados. Não envia os arquivos base64: resultados/pedidos/receitas são referenciados por metadados. Não existe migração automática dos arquivos para o servidor.
- Inicialização do módulo estabelece uma base dos cadastros antigos, sem emitir notificações retroativas. Novas alterações sincronizadas passam a gerar eventos.
- Convite de leitura por código, válido por 24 horas e vinculado ao e-mail da conta destinatária. Convite deve ser aceito na própria conta. Autorizações e revogações são persistidas. O contato do acompanhante, sozinho, não concede acesso.
- Fila push persistente com avisos de inclusão, reagendamento, cancelamento e troca de acompanhante, apenas aos envolvidos autorizados.
- Lembretes de 3 dias, 1 dia e 2 horas, somente futuros, no fuso IANA do compromisso; no protótipo o padrão explícito é America/Sao_Paulo. Reagendamento/troca cancelam lembretes anteriores e criam nova programação; cancelamento/realização interrompem pendentes.
- Worker no servidor a cada 15 segundos, sem depender da página aberta. Precisa do processo Node em execução. Faz tentativas limitadas, evita reenvio dos tickets já aceitos por dispositivo e consulta recibos do provedor quando disponível.
- Registro de tokens Expo por plataforma e sessão; invalidação em logout, mudança/redefinição de senha e exclusão da conta. DeviceNotRegistered desativa o token. Mensagens push são genéricas e não incluem conteúdo clínico.
- Tratamento concluído é um novo estado distinto de Suspenso, com confirmação, data, histórico e notificação. Ambos ficam sem edição.
- Cancelar no formulário Novo agendamento descarta rascunho e retorna à agenda sem gravar.

## Como testar a central

1. Entrar pelo servidor, atualizar a página e aguardar a sincronização inicial.
2. Cadastrar um medicamento ou confirmar a realização/cancelamento de um atendimento.
3. Voltar ao Início e abrir o sino. Marcar uma notificação como lida e conferir o contador.
4. Em Notificações → Acompanhantes e notificações, gerar um código para o e-mail do acompanhante cadastrado.
5. Entregar o código à pessoa de forma privada. Ela entra na própria conta e usa Aceitar convite nessa mesma área. O convite autoriza leitura dos dados do paciente; revogar bloqueia notificações e detalhes.
6. Gerar novo evento e conferir a central em ambas as contas. Marcar como lido em uma não altera a outra.

O código é uma forma local de distribuir convites; não há envio automático de convite por e-mail. O e-mail informado no cadastro de acompanhante deve coincidir com o e-mail da conta que aceitou acesso. Homônimos ainda são contatos do protótipo identificados por nome/e-mail; a identidade de destinatário é o UUID da conta autorizada.

## Push real: configuração necessária

Definir `PUSH_ENABLED=true` e `EXPO_ACCESS_TOKEN` no ambiente do servidor somente após configurar o projeto Expo, credenciais FCM/APNs e build móvel. O adaptador usa os endpoints de envio e recibos da [documentação oficial Expo](https://docs.expo.dev/push-notifications/sending-notifications/).

No aplicativo móvel, obter o token com expo-notifications após permissão e registrar pela API autenticada:

```json
POST /api/notifications/device
{"platform":"android","permission":"granted","token":"ExpoPushToken[...]"}
```

O cliente deve enviar a sessão autenticada e o servidor deve estar disponível por HTTPS. O app React Native atual ainda não tem o fluxo de login/telas completo nem aquisição automática desse token; portanto esta entrega não comprova push entregue em Android/iOS. Não colar tokens ou segredos em documentos versionados. A integração nativa de permissão/registro e retomada de navegação exige a migração móvel planejada.

Sem credenciais, o worker não envia; sem dispositivo autorizado, o job registra a pendência e não é marcado como Enviada. O status Enviada significa pedido aceito pelo provedor, não confirmação de leitura. Um recibo posterior de falha pode atualizar para Falha. Como em qualquer provedor externo, um timeout após aceite pode deixar resultado incerto; não é possível prometer entrega exatamente uma vez no dispositivo.

Ao tocar no push, o cliente móvel deve encaminhar o ID para `/app?notification=ID`. A leitura verifica sessão, destinatário e autorização atual. Se for solicitado login, a retomada do destino deve ser preservada pelo cliente móvel; esse fluxo ainda não está conectado na base React Native.

## APIs

Todas as rotas exigem conta autenticada e aceite vigente; POST valida origem.

| Rota | Função |
| --- | --- |
| GET /api/notifications/list | Lista autorizada e contador |
| POST /api/notifications/read | Ler um ID ou all |
| GET /api/notifications/details?id= | Detalhes atuais do aviso interno |
| GET /api/notifications/push-details?id= | Detalhes de push próprio |
| GET /api/notifications/state | Revisão, pacientes próprios, membros e fila de envios |
| POST /api/notifications/sync | Salvar snapshot de metadados e gerar eventos na mesma transação |
| POST /api/notifications/invite | Convite pelo responsável do paciente |
| POST /api/notifications/accept | Aceite pela conta destinatária |
| POST /api/notifications/revoke | Revogar um membro |
| POST /api/notifications/device | Registrar dispositivo autorizado |

## Integridade e limites

A cópia no servidor permite detalhes compartilhados e notificações persistentes, mas ainda não substitui uma API clínica completa. A edição permanece no protótipo local do responsável, com sincronização sequencial. Conflitos de revisão de duas sessões são recusados; não há fusão automática de alterações clínicas nem edição compartilhada dos registros. Os binários continuam no navegador de origem e não podem ser baixados por um acompanhante apenas por ter aceitado o convite. Exportações e dados anteriores não são apagados.

O envio só é gerado depois que o snapshot é confirmado no banco. Uma alteração salva offline pode aparecer localmente antes de gerar sua notificação; a fila avisa e tenta novamente. Não confundir o toast de cadastro local com confirmação de entrega. O usuário deve manter o servidor local ligado para processar filas; reiniciar recupera jobs persistidos.

Antes da primeira sincronização, definir que só serão usados dados fictícios, como no protótipo. O servidor agora armazena metadados e textos de atendimento, não apenas autenticação. Implantação para dados reais ainda exige revisão de segurança, criptografia/backup, política de retenção e infraestrutura operacional.

Exclusão da conta responsável é bloqueada se houver pacientes com outros usuários ativos, evitando apagar registros compartilhados. É necessário revogar vínculos antes de excluir nesta versão; transferência de administração e retenção legal ainda precisam de um fluxo próprio. Contas acompanhantes são removidas sem apagar registros do responsável. Tokens, leitura e vínculos da conta excluída são removidos.

## Testes

Testes cobrem regras de canais, programação em fuso, ausência de retroativos, idempotência, cancelamento/reagendamento/troca, leitura individual, revogação, acesso por outro usuário, rollback de lote, proteção da exclusão e ausência de falso envio. O transporte real não é acionado nos testes. Homologação em celulares e validação de entrega externa continuam pendentes.

## Compartilhamento pelo WhatsApp

Em Familiares e responsáveis → Convidar familiar, informar o e-mail da conta destinatária, gerar o convite e clicar Compartilhar convite pelo WhatsApp. O mesmo botão aparece na área de autorizações do sino. A mensagem contém instruções e código válido por 24 horas, sem nome do paciente ou dados clínicos; o envio é confirmado manualmente no WhatsApp e não é registrado como entregue pelo aplicativo. O aceite continua vinculado à conta do e-mail convidado. Em localhost, não é enviado link inacessível ao celular e a tela avisa que a publicação/versão instalada é necessária para uso remoto.

## Código único por paciente — fluxo atualizado

Cada paciente sincronizado possui um código aleatório único e persistente (20 caracteres hexadecimais, exibidos em grupos). O responsável pode consultá-lo em Mais → Pacientes cadastrados → Código do paciente / Convidar familiar, ou em Familiares e responsáveis → Convidar familiar. O WhatsApp compartilha esse mesmo código, sem depender de um e-mail previamente convidado.

Primeiro acesso tem Código do paciente opcional. Se preenchido, o cadastro valida o código e cria o vínculo na mesma transação da conta; um código inválido não deixa conta criada parcialmente. Quem já possui conta usa Conectar por código na seleção de pacientes ou Tenho um código de paciente na tela inicial vazia. Aceitar novamente não duplica cadastro nem vínculo.

O familiar acessa o cadastro original em Compartilhados comigo, com agenda, medicamentos, histórico, observações e identificação de documentos. O acesso é de consulta, validado no servidor em cada abertura; a edição continua com o responsável. O paciente não é copiado para o armazenamento local da conta convidada. Dados de nascimento, alergias e informações médicas passam a compor os metadados sincronizados. Arquivos anexados ainda permanecem no navegador de origem, portanto o compartilhamento atual mostra sua identificação, sem disponibilizar o binário.

O código não expira em 24 horas: fica estável até uma revogação de vínculo, quando é renovado para impedir reconexão pelo código antigo. Os demais membros ativos continuam autorizados. Apenas o responsável vê o código para convidar novas pessoas. As APIs antigas de convite por e-mail continuam por compatibilidade, mas não são mais o fluxo principal na interface. Código de acesso deve ser compartilhado apenas com familiares autorizados.

## ID, convites por e-mail e link inteligente

Meu perfil mostra o ID UUID da conta. O cartão do paciente do responsável mostra seu ID e código de vinculação; a tela de convite também informa o ID completo do paciente. Esses identificadores não substituem o código de vinculação e não concedem acesso por si só.

Convidar familiar mantém um campo de e-mail com Enviar convite por e-mail e a opção Compartilhar pelo WhatsApp. Ambos usam a mensagem solicitada pela usuária, com nome do paciente, código de vinculação e link inteligente. O envio real por e-mail depende de remetente/provedor configurados e endereço público; grava Pendente/Enviado/Falha e só informa aceitação pelo serviço quando a chamada é bem-sucedida. Enviado não comprova entrega nem leitura.

APP_PUBLIC_URL configura a origem pública HTTPS dos convites. PLAY_STORE_URL deve ser a página oficial do aplicativo publicado na Google Play, no formato documentado em https://developer.android.com/distribute/marketing-tools/linking-to-google-play. Não há endereço fictício pré-configurado. A rota /convite/ID identifica o convite por token aleatório e confere se o código continua atual. Não inclui nome do paciente no endereço. No Android, com PLAY_STORE_URL configurada, encaminha à página de download. Em outros navegadores, oferece a página de convite com botão da loja e acesso web; o código é preservado ao seguir para o cadastro web. Não há detecção de instalação ou integração de App Links nativos nesta versão, e o código deve ser informado após instalar o app.

Sem publicação/configuração, a página informa a pendência e não simula download. Sem endereço público, o link é local, há aviso na interface e o envio por e-mail é bloqueado. O WhatsApp abre a mensagem para escolha do contato/confirmação manual. Os links e convites de e-mail são removidos do banco ativo na exclusão da conta responsável; a revogação que renova o código também invalida links do código anterior.

## Correção da navegação do sino

O sino abre apenas a lista de notificações, contador, leitura individual/todas e acesso aos registros. O botão Acompanhantes e notificações foi removido. Convidar/gerenciar acesso fica em Familiares e responsáveis → Gerenciar acesso dos familiares (paciente selecionado); Conectar por código fica em Pacientes. A fila técnica de envios push não é mais exposta nessa navegação de usuário. Instruções anteriores que citam convite dentro do sino estão substituídas por este fluxo.
