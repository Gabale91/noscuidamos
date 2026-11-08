# Comparação da especificação com o projeto

Verificação em 05/11/2026. Fonte: arquivo “Texto colado.txt” anexado pela usuária nesta conversa, com objetivo de revisar o que falta criar. Nenhuma funcionalidade de notificações foi implementada por esta análise.

## Resultado principal

O protótipo web já possui login, cadastro, aceite, perfil e gestão básica da conta. A nova entrega necessária concentra-se em persistência clínica no servidor, vínculos e permissões entre contas, central de notificações, envio push e agendamento de lembretes. O aplicativo React Native ainda é apenas uma tela inicial; os recursos web não estão implementados nas versões nativas Android/iOS.

“Existente” abaixo significa código encontrado, não homologação de produção nem envio externo comprovado.

## Matriz de cobertura

| Seção da especificação | Estado encontrado | Trabalho restante |
| --- | --- | --- |
| 1.1 Login | Servidor local autentica e-mail/senha; sessão, Lembrar de mim e olho de senha implementados | Homologação, implantação e integração nativa. Mensagem atual usa “Verifique os dados informados”; novo documento omite “informados” — diferença apenas textual |
| 1.1 Recuperação | Token com prazo/uso único, senha protegida e revogação de sessões | Configurar remetente/provedor e testar entrega real; sem configuração retorna indisponibilidade |
| 1.2 Cadastro | Nome/e-mail/senha/confirmação/aceite; unicidade no banco e validações | Homologação nativa; manter regra anterior de 3 a 128 caracteres com maiúscula e número, salvo alteração explícita da usuária |
| 1.3 Aceite | Checkbox desmarcado, links em modal, versões e instante vinculados à conta; bloqueio por versão | Textos finais, política aplicável e teste completo de atualização de versão com usuários existentes |
| 2.1 Perfil | Foto/nome; mudança de e-mail pendente de validação; senha atual na troca de senha | Envio real de validação; sincronização de alterações em múltiplas sessões e integração móvel |
| 2.2 Sair | Modal, revogação da sessão atual, retorno ao login sem excluir cadastros | Ainda não há tokens push para invalidar; incluir quando dispositivos existirem |
| 2.3 Excluir | Confirmação EXCLUIR, revalidação, remoção da conta no banco ativo e solicitação de limpeza local | Política de retenção, exclusão verificável em todos os dispositivos/backups, proteção dos dados compartilhados e direitos de terceiros |
| 3 Gestão de notificações | Não implementada | Criar eventos, destinatários, canais e persistência |
| 4 Sino | Não implementado | Ícone/contador/listagem/leitura individual/navegação/autorização |
| 5 Push | Não implementado | Identidade do acompanhante, dispositivos/tokens, provedor e envio real |
| 6 Lembretes | Apenas descritos na documentação antiga | Criar agenda de tarefas persistente para 3 dias, 1 dia e 2 horas; sem retroativos |
| 7 Abrir notificação | Não implementado | Login, retomada de destino e permissão atual antes de abrir registro atualizado |
| 8 Rastreabilidade | Histórico local de ações com “Usuário de demonstração” | Eventos de servidor, destinatários e estados de notificação; histórico local não é auditoria autenticada |
| 9 Segurança | Sessões de conta existem; clínica ainda em localStorage/IndexedDB | Autorização clínica por paciente, proteção de documentos, revogação de vínculos, tokens e conteúdo genérico no push |
| 10 Critérios de aceite | Testes existentes cobrem partes da conta e regras locais | Testes de todos os eventos/canais, permissões, tarefas, falhas e aparelhos |
| 11 Android/iOS | App.js apenas demonstra nome/seleção de paciente em memória | Migrar recursos e navegação; integrar API, credenciais móveis, permissões, push e builds assinados |

## O que precisa ser criado

### 1. Dados clínicos compartilháveis e autorização

- Banco/API para pacientes, contatos, vínculos de usuários, agendamentos, medicamentos, pós-atendimento e documentos. Atualmente o banco do servidor contém usuários, sessões, aceites, recuperação, fotos de perfil e desafios de validação; não contém clínica.
- Identificadores persistentes de conta, paciente, acompanhante, agendamento e evento. Acompanhantes hoje têm nome/e-mail/vínculo, sem ID de usuário autenticado; agendamentos referenciam nome de acompanhante. Isso não permite determinar com segurança quem recebe push nem distinguir homônimos.
- Fluxo de convite/aceite e vínculo autorizado da conta do acompanhante ao paciente. Os convites atuais apenas gravam um e-mail no navegador.
- Revogação de vínculo com efeito imediato na leitura da central, nos detalhes e nos envios pendentes. Separar contato acompanhante de conta com acesso.
- Migração explícita e validada dos dados locais, preservando registros, anexos e rascunhos; não substituir cadastros automaticamente.

### 2. Eventos persistidos

- Publicar evento apenas depois da gravação confirmada. Usar transação com caixa de saída persistente para não perder envio entre salvar e enfileirar.
- Versionar cada alteração e deduplicar por evento, destinatário e canal. Nome de medicamento/horário isoladamente não é uma chave de deduplicação.
- Cobrir cadastro manual e importação de receitas/pedidos, inclusão/edição de pós-atendimento e anexos. Não usar toast nem apenas histórico textual como fonte do envio.

### 3. Central interna

- Sino na tela inicial com contador de não lidas.
- Página de notificações da conta, mais recentes primeiro, com indicação de paciente e estado visual.
- Leitura individual e “Marcar todas como lidas”; histórico persistido por destinatário.
- Navegação para agendamento/medicamento/atendimento; conferir sessão e vínculo na consulta e ao abrir o destino.

### 4. Push e dispositivos

- Cadastro de dispositivos por conta/plataforma, tokens, permissão do sistema e controle de tokens inválidos.
- Integração com provedor push adequado a Android/iOS, configuração das credenciais e testes reais.
- Envio ao acompanhante selecionado, nunca aos contatos sem vínculo/conta autorizada. Ausência de acompanhante não bloqueia salvar.
- Mensagens genéricas, sem detalhes clínicos na tela bloqueada.
- Tentativas com limites, tratamento de falha e status Programada/Enviada/Falha/Cancelada; “Enviada” não comprova entrega ou leitura.
- Desvincular tokens da sessão/dispositivo conforme a política de saída e exclusão, evitando entrega ao próximo usuário do mesmo aparelho.

### 5. Lembretes e reconciliação

- Persistir fuso do compromisso e programar somente horários futuros: 3 dias, 1 dia e 2 horas antes.
- Até três lembretes por programação ativa; avisos de evento são separados desse limite.
- Reagendamento cancela a programação antiga e cria nova; troca de acompanhante transfere a programação; cancelamento e conclusão interrompem pendentes.
- Conferir estado, versão, destinatário, vínculo e horário de novo no momento do envio, inclusive após reinício do serviço.
- Serviço de tarefas precisa executar sem o aplicativo estar aberto; temporizador na página não satisfaz o requisito.

### 6. Conclusão de tratamento

Hoje medicamentos têm Em uso e Suspenso. Falta criar a ação/estado de tratamento concluído, data e histórico. Suspender e concluir são eventos distintos. Não inferir conclusão apenas pela passagem de uma data sem uma regra aprovada. Criar esse evento antes de notificar sua ocorrência.

### 7. Exclusão e retenção de dados compartilhados

O fluxo atual não modela pacientes compartilhados entre contas. Antes de disponibilizar compartilhamento, definir propriedade/responsabilidade dos registros, transferência de administração e retenções. Excluir conta deve remover seus acessos e dados de conta sem apagar indevidamente o histórico de outro usuário/paciente. A exclusão local atual não comprova eliminação em outros navegadores, exportações ou backups.

## Matriz de eventos a implementar

| Evento confirmado | Central interna | Push de evento | Lembretes |
| --- | --- | --- | --- |
| Novo agendamento | Não | Somente acompanhante selecionado autorizado | Programar futuros |
| Reagendamento | Não | Somente acompanhante selecionado autorizado | Cancelar anteriores; recalcular |
| Cancelamento | Responsável e acompanhantes autorizados | Acompanhante selecionado autorizado | Cancelar pendentes |
| Consulta/exame realizado | Responsável e acompanhantes autorizados | Não solicitado neste documento | Cancelar pendentes |
| Troca de acompanhante | Não solicitado neste documento | Anterior e novo, respeitando vínculo/acesso | Cancelar anteriores; programar para novo |
| Medicamento incluído/alterado/suspenso/concluído | Responsável e acompanhantes autorizados | Não solicitado neste documento | Não são os lembretes de consulta/exame |
| Pós-atendimento/orientação/resultado incluído ou atualizado | Responsável e acompanhantes autorizados | Não solicitado neste documento | Sem nova programação de consulta/exame |

Regra nova prevalece sobre a sugestão antiga de dois lembretes (24 h e 2 h) documentada no início do projeto: usar até três, incluindo 3 dias antes. Não gerar sino em criação/reagendamento. Não enviar nada antes da confirmação humana de um documento importado.

## Ordem recomendada

1. Persistência clínica, migração e vínculos de contas com permissões.
2. Eventos transacionais e conclusão de tratamento.
3. Central interna com leitura individual e bloqueio por revogação.
4. Dispositivos, provedor push e abertura protegida dos destinos.
5. Serviço de lembretes e atualização após mudanças.
6. Exclusão/retencão para dados compartilhados e homologação Android/iOS.

Não é necessário refazer as telas de login e perfil do zero. É necessário integrar e completar a infraestrutura acima; desenhar o sino isoladamente não atende ao documento.

## Evidência consultada

- `server/auth.mjs`: tabelas e rotas de autenticação/conta; ausência de tabelas clínicas e notificações.
- `server/auth-ui.js`: login, cadastro, perfil e modais.
- `prototypes/cuidado-em-familia-teste-fluxo-corrigido.html`: agenda, cancelamento/reagendamento, medicamentos, importação e documentos locais; cadastro de acompanhante sem identidade de conta e convite simulado.
- `App.js`: base móvel em memória, sem integrações de conta/agenda/push.
- `tests/auth.test.mjs`, `tests/domain.test.mjs`, `tests/prototype.test.cjs`: testes atuais, sem cobertura de envio push, dispositivos ou central interna.

Não foram inspecionadas chaves secretas nem realizadas tentativas de envio para terceiros. Existência de um adaptador de e-mail/Google no código não comprova configuração ou funcionamento externo.

## Atualização após a análise

O módulo web foi posteriormente implementado; o estado atualizado está em modulo-notificacoes.md. A matriz acima documenta a situação anterior à implementação e não representa a cobertura atual.
