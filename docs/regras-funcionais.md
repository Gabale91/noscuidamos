# Especificação funcional consolidada

Atualização de acesso e perfil: as regras e o estado da implementação de login, Google, recuperação, aceite, foto, mudança de e-mail/senha, saída e exclusão estão em [acesso-e-conta.md](acesso-e-conta.md). A versão servida pelo Node usa conta autenticada; referências anteriores a perfil local dizem respeito ao HTML direto legado.

Versão 0.1 — 05/11/2026. Requisitos confirmados vêm do pedido atual e dos turnos recuperados. Detalhes operacionais abaixo são propostas de implementação quando não explicitados na conversa. Não são funcionalidades já concluídas no aplicativo nativo.

## 1. Pacientes e contexto

RF01. Instalação nova começa vazia, sem pacientes ou dados clínicos fictícios pré-carregados. Nome completo e nascimento são obrigatórios no cadastro definitivo; foto, alergias e observações médicas são opcionais. Validar nome em branco e nascimento inválido ou futuro.

RF02. Uma conta pode acompanhar vários pacientes. Cada agenda, medicamento, documento, familiar, histórico e relatório pertence a um patientId. Mostrar o paciente ativo em todas as telas. Trocar paciente não transfere dados nem rascunhos. Rascunhos devem ser vinculados a usuário, paciente e operação; evitar mistura ao alternar contexto.

RF03. Alterações do cadastro exigem permissão e histórico. Não tratar nome ou data de nascimento como identificador único. Arquivar paciente deve retirar alertas futuros sem apagar silenciosamente o histórico; exclusão segue política de retenção.

## 2. Familiares, acompanhantes e acesso

RF04. Cadastro de acompanhante exige nome; e-mail e vínculo familiar são opcionais. Acompanhante é um contato do paciente e pode não ter conta. Seu cadastro não concede acesso aos dados. Usar identificador próprio, permitindo homônimos com diferenciação na tela.

RF05. Convite real deve ser específico por paciente e perfil, ter expiração, uso único e aceite autenticado. Convite pendente não concede acesso. O titular ou representante autorizado gerencia vínculos. Revogação bloqueia novas consultas, downloads e notificações; não é possível recolher cópias já exportadas.

Matriz proposta, a validar com a responsável pelo produto:

| Ação | Administrador autorizado do paciente | Cuidador editor | Leitor | Contato acompanhante |
| --- | --- | --- | --- | --- |
| Ver dados e documentos do paciente | Sim | Sim | Sim | Não |
| Cadastrar/editar agenda, medicamentos e anexos | Sim | Sim | Não | Não |
| Convidar, revogar e mudar permissões | Sim | Não | Não | Não |
| Exportar relatório | Sim | Sim | Não por padrão | Não |
| Solicitar exclusão/gerir representação | Sim, sujeito a validação | Não | Não | Não |

RF06. Negar acesso por padrão, validar no servidor em toda operação e conferir vínculo de todos os IDs recebidos. O papel vale por paciente; vínculo familiar não prova representação legal. Menores e pessoas representadas exigem fluxo específico de comprovação e autorização antes de produção.

## 3. Consultas, exames e acompanhante opcional

RF07. Consulta ou exame exige paciente, tipo, título/especialidade ou nome do exame, data, horário e local na confirmação final. Profissional, observações, preparo e acompanhante são opcionais. Não inventar data, local ou instruções de preparo ao ler documentos. Armazenar instante e fuso horário do atendimento.

RF08. Acompanhante nunca bloqueia criação, edição ou importação. Pode ser adicionado, substituído ou removido depois. Não conceder acesso clínico ao selecioná-lo.

RF09. Ao abrir “Cadastrar acompanhante” dentro de um agendamento, preservar todos os campos, inclusive tipo, preparo, observações e documento de origem. Ao salvar, voltar à mesma operação, selecionar o contato criado e manter os demais valores. Cancelar retorna sem alteração. Validar e-mail apenas se informado. Falha no cadastro mantém ambos os rascunhos. O retorno do cadastro de acompanhante preserva o rascunho da operação atual. Ao clicar em Agendar ou Novo agendamento, iniciar uma operação nova com formulário vazio; nunca restaurar dados do último agendamento salvo.

RF10. Em pedido com vários exames, preservar todos os itens. Proposta: selecionar o novo acompanhante apenas no item de origem, sem sobrescrever acompanhantes dos outros itens. Esse comportamento refina o HTML, que preenche itens sem acompanhante; confirmar na homologação.

RF11. Estados propostos: agendado, realizado e cancelado. Reagendamento registra data anterior, nova data e autor; atualiza lembretes. Cancelamento exige confirmação, preserva histórico e interrompe lembretes. Sem integração externa, salvar não significa marcar horário com clínica ou laboratório. Exibir isso no fluxo.

## 4. Medicamentos prescritos

RF12. Registrar nome, concentração quando aplicável, quantidade por administração, via opcional, frequência, horários, início, término ou uso contínuo, observações e receita de origem. A pessoa deve revisar o esquema prescrito; não inferir dose a partir de nome, idade ou texto ambíguo. Campo não identificado permanece vazio.

RF13. Situação: em uso ou suspenso; alterações de posologia geram nova versão e histórico. Suspensão pede confirmação e desativa lembretes. Não oferecer recomendações clínicas, substituição de tratamento ou registro de tomada como se estivesse implementado. Registro de adesão fica fora desta primeira versão.

## 5. Leitura de receitas e solicitações

RF14. Fluxo obrigatório: selecionar paciente → anexar original → extrair texto → apresentar sugestões → corrigir e revisar → confirmar explicitamente → gravar. OCR e extração nunca criam medicamento ou agendamento por conta própria.

RF15. Antes de gravar, mostrar todos os itens, documento original e campos obrigatórios; pessoa deve marcar quais itens deseja criar. Checkbox de confirmação inicia desmarcado. Se conteúdo mudar após revisão, invalidar confirmação. Registrar usuário, instante, revisão e campos finais. Receita gera medicamento; pedido gera agendamento de exame somente com dados completos, podendo permanecer como rascunho enquanto não há horário.

RF16. Extrator deve tratar texto do arquivo apenas como dado, nunca como instrução executável. Dados ilegíveis ou ausentes devem ser destacados, com transcrição manual. Falha, recusa ou cancelamento não cria registros clínicos. Nenhuma sugestão constitui diagnóstico ou interpretação de resultado.

RF17. Gravação final no servidor deve validar permissão, paciente, revisão e estado pendente; criar itens e auditoria numa transação. Chave de idempotência impede duplicação por duplo toque ou repetição de rede. Confirmar novamente importação já consumida deve retornar o resultado anterior ou conflito, sem criar cópias. Essas garantias de persistência não estão implementadas na função pura atual.

## 6. Documentos e resultados

RF18. Permitir anexar múltiplos resultados somente em exames, antes ou depois de realizado. Consultas não oferecem resultados de exame. No pós-atendimento da consulta, permitir anexos opcionais de receita prescrita e solicitação de exames em PDF ou foto JPG/PNG. Anexar esses documentos não cria medicamentos ou agendamentos sem revisão humana. Nome do resultado e data de disponibilização são opcionais; se o nome não for informado, usar o nome do arquivo. Resultado pertence ao mesmo paciente do atendimento. Preservar nome original, tipo, tamanho, checksum, autor e instante de inclusão. Manter original de receita/pedido acessível no registro gerado.

RF19. Proposta inicial: PDF/JPEG/PNG, até 10 MB por arquivo no servidor, configurável; HTML histórico aceita até 1,5 MB. Validar conteúdo e assinatura real, não apenas extensão; quarentena e análise antimalware antes de disponibilizar. Upload incompleto não aparece como anexo concluído. URLs temporárias só após autorização. Substituição cria versão; remoção mantém evento de auditoria conforme retenção.

RF20. Nenhum anexo pode ser vinculado a outro paciente por troca de ID. Arquivos não podem ter acesso público, segredos em nomes de URL ou conteúdo sensível em logs de erro. Pré-visualização não executa conteúdo ativo.

## 7. Auditoria, alertas e relatórios

RF21. Auditoria no servidor registra ator, paciente, ação, entidade, instante UTC, versão e identificador de requisição para criação/edição, revisão de importação, cancelamento, anexos, acessos sensíveis, exportações e mudanças de permissão. Não permitir alteração pelo cliente; reduzir conteúdo clínico nos eventos. Auditoria respeita política de retenção, acesso restrito e tratamento de solicitações do titular.

RF22. Notificações são configuráveis por pessoa e paciente. Proposta inicial: lembretes de atendimento 24 h e 2 h antes; medicamentos apenas nos horários revisados. Pedir permissão do sistema operacional no contexto apropriado. Alteração/cancelamento/suspensão/revogação reconcilia alertas; deduplicar por evento, destinatário e horário. Considerar fuso e falta de conexão. Não prometer entrega garantida. Tela bloqueada usa texto genérico por padrão; abrir exige autenticação e autorização atual.

RF23. Relatórios filtram paciente, período e tipo e mostram agenda, situações, medicamentos e documentos referenciados. Exportação PDF exige permissão e registra evento; não exportar binários sem escolha específica. Dados ausentes são identificados. Compartilhamento externo deve ser explícito e informado. Relatórios não substituem prontuário ou parecer clínico.

## 8. Privacidade e LGPD

Requisitos de produto para implementação, não certificação de conformidade. Dados de saúde são sensíveis. Definir controlador, operadores, encarregado/canal e fundamento aplicável a cada finalidade antes do uso real; não assumir que convite familiar ou aceite genérico autoriza todo tratamento.

RF24. Aviso de privacidade deve informar finalidade, dados, destinatários, fornecedores de OCR/nuvem, retenção, transferências e canal de direitos. Coletar apenas o necessário. Consentimentos, quando forem a base aplicável, devem ser específicos, demonstráveis e revogáveis. Não enviar documentos a OCR/IA externo antes de avaliar contratos e condições de tratamento.

RF25. Implementar autenticação, expiração e revogação de sessões, criptografia em trânsito e repouso, armazenamento móvel protegido, backups criptografados e restauração testada. Evitar dados reais em desenvolvimento e telemetria. Segredos ficam fora do código. Dados offline exigem desenho de criptografia, prazo de cache e bloqueio por revogação.

RF26. Prover confirmação de tratamento, acesso, correção, exportação e solicitação de eliminação/revogação, após verificar identidade e representação. Definir tabela de retenção por categoria e obrigação, incluindo backups e eventos; não prometer eliminação imediata onde houver retenção justificada. Preparar resposta a incidentes e análise das comunicações exigíveis. Prazos, fornecedores e políticas finais ficam pendentes de validação jurídica e operacional.

Referência primária consultada: [LGPD, texto atualizado — Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html), especialmente arts. 5, 6, 11, 14, 18 e 46. O lançamento depende de revisão jurídica do tratamento concreto.

## 9. Critérios de aceite e verificação

| ID | Cenário e resultado esperado | Estado da entrega |
| --- | --- | --- |
| AC01 | Instalação limpa; cadastrar dois pacientes; nenhuma agenda ou familiar atravessa contexto | Homologar HTML e implementar nativo |
| AC02 | Salvar consulta e exame sem acompanhante | Regra isolada testada; homologar interface |
| AC03 | Preencher todos os campos, cadastrar acompanhante, retornar com dados iguais e novo contato selecionado | Regra isolada testada; homologar navegação e cancelamento |
| AC04 | Receita/pedido lido sem confirmação, ou revisão antiga: zero registros criados | Regra isolada testada; implementar servidor |
| AC05 | Pedido com vários exames e acompanhantes distintos preserva escolhas | Implementar refinamento e testar |
| AC06 | Anexar resultado somente em exame; consulta e ID de outro paciente são recusados | Regra isolada testada; implementar armazenamento |
| AC07 | Leitor/contato tenta editar por API, usar URL de outro paciente ou vínculo revogado: acesso negado | Implementar servidor e testar |
| AC08 | Repetir confirmação e upload após falha de rede: nenhum registro duplicado | Implementar transações/idempotência |
| AC09 | Cancelar evento/suspender medicamento: nenhum lembrete futuro; bloqueio de tela sem dado clínico | Implementar e testar em ambos os sistemas |
| AC10 | Exportar por período; auditar operação; atender correção e solicitação de exclusão | Implementar e validar políticas |
| AC11 | Arquivo inválido, grande, ilegível ou falha OCR mantém rascunho e permite transcrição | Homologar e implementar servidor |
| AC12 | Aplicativo com leitor de tela, fonte ampliada e teclado mantém campos e botões utilizáveis | Testar Android e iOS |

Pendências de decisão: perfis finais; representação legal; fornecedores e regiões; retenção; limites finais de arquivo; canal de notificação; identificadores das lojas; política de recuperação da conta; conflito de edições offline. Até sua validação, aplicar as propostas apenas em ambiente de desenvolvimento com dados fictícios.

## Ajustes confirmados em 05/11/2026

Após realização, preservar responsável/acompanhante e impedir substituição, inclusive por chamada direta da ação. Pós-atendimento abre tela com texto livre opcional, sem mínimo de caracteres, aceitando vazio ou um caractere. Na consulta, receita prescrita e solicitação de exames são categorias de documentos separadas de resultados. Botões Salvar informações e Cancelar têm dimensões iguais. Anexos do protótipo aceitam PDF/JPG/PNG até 1,5 MB por arquivo; arquivos já salvos são preservados ao editar.

Ajuste no cadastro de medicamentos: via de administração opcional tanto no cadastro manual quanto na revisão da receita; campo médico/prescritor removido da interface de medicamentos. Dados antigos não são apagados.

Suspensão de medicamento: o primeiro clique abre um pop-up do aplicativo com nome e concentração. Somente “Confirmar suspensão” altera o estado e registra histórico; “Cancelar” ou Escape fecha sem alterações. Cancelar recebe o foco inicial. Falha de persistência mantém o medicamento em uso e permite tentar novamente.

Correção de navegação: salvar um agendamento não recaptura o formulário encerrado. Agendar/Novo agendamento limpa o rascunho e volta ao tipo Consulta; retorno após cadastrar acompanhante preserva os campos e a seleção automática.

Agendamento de exames: não apresentar Observações pré-atendimento no formulário nem nos detalhes. Usar Exige preparo?/Instruções de preparo. Observações pré-atendimento permanecem exclusivas de consultas. Dados antigos não são excluídos.

Conflitos de agenda: bloquear consultas/exames no mesmo dia e horário do mesmo paciente, mesmo sem acompanhante. Entre pacientes, bloquear o mesmo acompanhante no mesmo dia e horário. Ignorar cancelados. Exibir pop-up informativo antes de gravar e preservar formulário. Validar também substituição de acompanhante e importações, incluindo conflitos entre itens do mesmo pedido; validar todo o lote antes de criar qualquer item. O protótipo compara nomes de acompanhantes sem acentos, espaços extras ou diferença entre maiúsculas/minúsculas, nos pacientes salvos no mesmo navegador. Homônimos podem ser considerados o mesmo contato; produção deve usar identidade compartilhada do acompanhante e validação transacional no servidor, inclusive entre dispositivos. A regra compara horário de início exato; não calcula sobreposição por duração.

Datas em todos os formulários: ano de quatro dígitos (0001 a 9999), com dia/mês válidos e ano bissexto verificado. Bloquear salvamento de ano com cinco ou seis dígitos e preservar os demais campos. Aplicar a medicamentos, pacientes, agenda, revisão de documentos e resultados; manter restrição adicional de nascimento não futuro.

Leitura de receita: preencher apenas nome, concentração, quantidade por administração, via opcional, frequência, horários/períodos, início e uso contínuo quando explicitamente identificados no texto. Ignorar identificação do paciente, médico, registros profissionais, cabeçalho, contato e endereço no preenchimento. Não deduzir informações ausentes: deixar campos em branco para revisão. Cada medicamento deve manter seus próprios dados. A tela de confirmação oferece Cancelar, descartando sugestões sem criar medicamentos. Extração local por padrões é limitada a formatos reconhecíveis; revisão humana permanece obrigatória.

Ao entrar na listagem de medicamentos, inclusive por Ver todos, selecionar Em uso por padrão. Histórico é acessado apenas por seleção explícita dentro da listagem.

Medicamentos suspensos são somente leitura: ocultar Alterar posologia e bloquear a ação de edição mesmo por chamada direta, preservando os dados e histórico.

Alterar posologia abre modal na própria tela com quantidade atual, nome/concentração, Salvar alterações e Cancelar de mesmo tamanho. Cancelar ou Escape não altera dados. Salvar exige texto não vazio, medicamento em uso e persistência bem-sucedida; registra valor anterior/novo no histórico. Suspensos permanecem somente leitura.

Registrar suspendedAt no instante da confirmação da suspensão, persistido com estado e histórico. Exibir Data da suspensão nos detalhes do medicamento suspenso, no fuso America/Sao_Paulo. Registros anteriores sem esse dado mostram Não registrada; não inventar data retroativa. Cancelamento ou falha de gravação não registra data.

Relatório PDF: substituir contagens gerais por resumo das observações pós-consultas realizadas do paciente ativo, em ordem da mais recente para a mais antiga. Incluir data/hora, especialidade, médico e local quando informados, acompanhante preservado, texto integral das observações e nomes/categorias de documentos vinculados. Excluir exames, consultas agendadas e registros sem observação textual. Não interpretar ou resumir clinicamente o texto. Mostrar estado vazio quando não houver registros. Impressão em A4 oculta navegação e botões; arquivos anexados não são incorporados ao PDF.

Anexar resultado de exame: Nome do resultado é opcional. Quando vazio ou composto só por espaços, identificar o anexo pelo nome do arquivo. Arquivo permanece obrigatório.

Resultados de exames: limite atualizado para 10 MB (10.000.000 bytes) por arquivo, aceitando PDF/JPG/PNG. Arquivos novos ficam no IndexedDB e os metadados no cadastro local, evitando o limite do localStorage para binários; anexos antigos em base64 continuam acessíveis. Bloquear duplo envio e reverter metadados/histórico se a gravação falhar. Persistência depende de espaço e permissões do navegador; não há sincronização com servidor.

Substituição de acompanhante abre modal com select dos contatos do paciente, acompanhante atual selecionado quando cadastrado e opção Sem acompanhante. Salvar valida cadastro, atendimento agendado e conflitos; Cancelar/Escape não altera dados. Erros aparecem dentro do modal e preservam seleção.

Perfil do usuário: disponibilizar Meu perfil em Mais opções, separado dos dados de pacientes, com nome e e-mail. No protótipo, nome obrigatório e e-mail opcional, persistidos no mesmo navegador sem autenticação ou verificação. Cancelar não altera o cadastro; perfil permanece ao trocar paciente. Produção deve carregar perfil da sessão autenticada, validar alterações de e-mail com reautenticação/verificação e gerenciar conta por servidor; editar perfil não muda permissões. O perfil local não deve ser considerado prova da autoria dos eventos de auditoria.

Reagendamento: disponível para consultas e exames com status diferente de Realizado. Abrir formulário com data e horário atuais; salvar altera apenas data/hora e retorna status Agendado, preservando acompanhante, local, preparo e documentos. Bloquear realizados tanto na interface quanto na ação de gravação. Validar datas e conflitos do paciente/acompanhante, excluindo o próprio registro da comparação. Registrar data/hora anterior e nova no histórico. Cancelar ou falha de gravação preserva registro original.

Leitura de pedidos de exames: extrair itens numerados, marcados, identificados por Exame: ou em seção de exames solicitados; ignorar dados de clínica/contato, paciente, médico e data de emissão. Data/hora/local/preparo só preenchem quando explicitamente identificados para o exame. Sem identificação segura, apresentar item vazio para revisão manual, sem converter cabeçalho em exame. Leitura concluída abre revisão automaticamente; acompanhante continua opcional, cancelamento e confirmação humana obrigatória preservados.

Cancelar agendamento: disponível somente para consultas/exames Agendados. Modal com Manter agendamento e Confirmar cancelamento; Escape mantém o registro. Confirmar muda status para Cancelado, grava cancelledAt e histórico sem excluir dados/anexos. Cancelados saem de Próximos e não bloqueiam horários; permanecem no histórico e podem ser reagendados. Realizados não podem ser cancelados. Falha de persistência reverte status/data/histórico. O aplicativo não comunica cancelamento ao prestador.

## Módulo de notificações implementado

Consultar modulo-notificacoes.md para a central interna persistente, vínculos por convite, fila push, lembretes de 3 dias/1 dia/2 horas, estado Concluído de medicamento e limites da integração móvel. Cadastro de novo agendamento agora tem Cancelar (descarta rascunho e retorna à agenda sem criar registro). Nenhuma entrega externa é presumida.

Atualização do convite familiar: cada paciente possui código único próprio. O familiar pode informá-lo no Primeiro acesso ou conectar uma conta já existente. O vínculo abre os dados do paciente original em modo consulta, sem cadastrar cópia. A opção Código do paciente / Convidar familiar fica na listagem de pacientes do responsável e permite compartilhar pelo WhatsApp. Ver detalhes e limites de arquivos em modulo-notificacoes.md.

Convites atualizados: ID da conta visível no perfil; ID e código do paciente junto à identificação do paciente. Manter envio por e-mail e compartilhamento WhatsApp, com a mensagem aprovada pela usuária, nome do paciente, código e link inteligente de download. A Google Play depende de publicação e configuração de PLAY_STORE_URL; APP_PUBLIC_URL deve ser público. Não informar envio ou download como concluído sem resultado real.

Código do paciente: oferecer Copiar código junto à identificação do paciente e no convite. Copiar somente o código de vinculação, confirmar sucesso após a operação e oferecer seleção/cópia manual se o navegador bloquear a área de transferência. O clique no botão não troca o paciente.

Separação de navegação: o sino contém exclusivamente a central de notificações e ações de leitura/abertura de registros. Não exibir autorizar acompanhantes, convite, conexão por código ou fila técnica de push na central. Convites e gerenciamento/revogação ficam em Familiares e responsáveis; conexão por código fica em Pacientes. A antiga rota de Acompanhantes e notificações passa a abrir a central, sem ações de gestão.

Compartilhar pelo WhatsApp deve encaminhar diretamente para wa.me com a mensagem pronta no primeiro clique. Não exibir prévia da mensagem nem exigir outro clique de envio dentro do aplicativo. O formulário de convite continua oferecendo copiar código e envio por e-mail; abrir a tela de convite não abre WhatsApp automaticamente. A escolha do destinatário e confirmação de envio ocorrem no WhatsApp.

Identificação visível do paciente: apresentar apenas Código do paciente (o código de vinculação), sem exibir o identificador interno separado. Na página inicial, exibir somente o código, sem botão de cópia. Copiar código permanece na listagem de pacientes e no convite. IDs internos continuam preservados no banco e nas relações.
