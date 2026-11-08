# Arquitetura e plano de desenvolvimento

## Organização

Base única React Native/Expo para Android e iOS; protótipo HTML é referência funcional, não código nativo. Separar componentes/telas, domínio, cliente da API e armazenamento. As funções atuais em src/domain.mjs são verificações locais e não substituem autorização no servidor.

Servidor proposto: API autenticada, banco relacional com transações, armazenamento privado de objetos, fila de extração e notificações. A escolha de fornecedor está aberta. Todas as consultas e mutações devem filtrar vínculos por paciente. IDs opacos e UUIDs no servidor; nunca confiar em IDs sequenciais ou autorização calculada só no aparelho.

## Modelo de dados proposto

| Entidade | Campos e relações principais |
| --- | --- |
| User | id, identidade autenticada, estado da conta |
| Patient | id, nome, nascimento, alergias, observações, archivedAt |
| PatientMembership | userId, patientId, role, status, grantedBy, revokedAt |
| Companion | id, patientId, name, email opcional, relationship opcional; não implica Membership |
| Invitation | id, patientId, email, role, tokenHash, expiresAt, acceptedAt |
| Appointment | id, patientId, kind, title, startsAt, timezone, location, companionId nullable, preparation, notes, status, version |
| Medication | id, patientId, nome, concentração, posologia estruturada e texto original, via, início, fim, contínuo, status, prescriptionDocumentId, version |
| Document | id, patientId, ownerId, finalidade, objectKey privado, MIME, tamanho, checksum, scanStatus, createdBy |
| AppointmentResult | appointmentId, documentId, nome, data opcional; conferir mesmo patientId |
| ImportDraft | id, patientId, kind, documentId, extractedText, items, revision, status, reviewedBy, reviewedAt |
| AuditEvent | id, patientId, actorId, action, entityId, version, occurredAt, requestId |
| Notification | id, patientId, recipientId, eventId, scheduledAt, status, deduplicationKey |
| PrivacyRequest | id, requesterId, patientId, type, identityVerification, status, resolution |

Relações por chave estrangeira; documento pode ser referenciado por vários resultados do mesmo paciente quando autorizado. Evitar duplicação de arquivos sem perder histórico de acesso. Controle otimista por version impede sobrescrever edição concorrente; apresentar conflito e permitir revisão humana.

## Contratos sugeridos, ainda não implementados

API sob /v1. Operações por paciente: `/patients/{id}/appointments`, `/medications`, `/companions`, `/memberships`, `/reports` e `/documents`. Convites e privilégios requerem administrador autorizado.

Importação: POST `/patients/{id}/imports` abre rascunho; PATCH `/imports/{id}` altera itens e incrementa revisão; POST `/imports/{id}/confirm` recebe revisão e confirmação explícita com Idempotency-Key. Servidor valida permissão atual e grava entidades + auditoria atomicamente. Extração assíncrona não tem acesso à operação de confirmação.

Upload: solicitar autorização de envio, armazenar em quarentena, validar e analisar, finalizar, vincular ao atendimento. Download exige permissão atual e URL de curta duração. Integração com prestador para marcação de horário está fora do escopo inicial.

## Migração do protótipo

Não importar automaticamente localStorage para produção. Criar exportação explícita, prévia dos dados, mapeamento paciente/contato por IDs, validação e consentimento aplicável. Histórico do HTML não comprova identidade, e-mail enviado ou revisão autenticada. Anexos base64 devem ser transferidos pelo fluxo seguro e verificados. Qualquer migração precisa ser repetível sem duplicar dados.

## Sequência de entrega

1. Validar dependências e dispositivos; migrar cadastro completo, seleção de pacientes e navegação acessível.
2. API, autenticação, permissões e testes de isolamento; cadastro de familiares e convites reais.
3. Agenda e rascunhos por contexto, retorno de acompanhante e estados de atendimento.
4. Medicamentos, histórico e documentos; importação com revisão e confirmação transacional.
5. Resultados, notificações, relatórios e fluxos de privacidade.
6. Testar perda de rede, reinício do app, revogação, concorrência, recuperação de backup e segurança; homologar acessibilidade e aparelhos reais.

Critério de lançamento: cenários de aceite aprovados nos dois sistemas, políticas e fornecedores definidos, restauração e incidentes exercitados, credenciais e identificadores das lojas configurados e builds assinados verificados. Nada disso é afirmado como concluído nesta organização inicial.
