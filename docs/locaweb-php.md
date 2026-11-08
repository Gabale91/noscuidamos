# Locaweb — PHP 8.3 e MySQL, sem novos serviços

Implementação alternativa ao servidor Node, mantendo as telas existentes. Nenhuma contratação, banco remoto, alteração de DNS ou upload é executado pelo empacotador.

## Pacote e instalação

Execute `node scripts/package-php.mjs`. O resultado é `release/locaweb-php/`, sem credenciais, contas, pacientes ou anexos. Publique SOMENTE o conteúdo de `public/` em `/web/noscuidamos`. Nunca envie o repositório inteiro para essa pasta.

Crie `/cuidado-private` como pasta irmã de `/web`, fora da raiz pública. Coloque nela o conteúdo de `private/`, incluindo `src` e `assets`. O index gerado resolve esse caminho automaticamente: dois níveis acima de `/web/noscuidamos`. Se o caminho físico da hospedagem diferir, ajuste o caminho privado no index. Verifique no FTP/painel o diretório real; uma pasta chamada private dentro da área pública não é suficiente.

Em `/cuidado-private`, copie `config.example.php` para `cuidado-config.php` e preencha host, banco, usuário e senha do MySQL já incluído. Configure o remetente SMTP existente e sua senha sem enviá-la pelo chat. O nome do banco é fornecido pela Locaweb; a aplicação não cria nem contrata banco. Importe `schema.sql` pelo gerenciador MySQL. Requer InnoDB, utf8mb4 e PDO MySQL. Não publicar instalador web.

Crie `/cuidado-private/files`, gravável pelo usuário PHP, e configure storage com o CAMINHO FÍSICO ABSOLUTO dessa pasta. Anexos recebem nomes aleatórios e são servidos somente por `/api/files/download`, após autenticação e autorização sobre o paciente. O código recusa armazenamento dentro de DOCUMENT_ROOT. Se não houver pasta privada fora da área pública, uploads permanecem bloqueados; não remover essa proteção.

IIS precisa de PHP 8.3 e URL Rewrite para web.config. O .htaccess equivalente atende Apache. Ajuste upload_max_filesize=10M, post_max_size=12M e o limite do IIS. O aplicativo permite até 10.000.000 bytes por PDF/JPG/PNG. Extensões fileinfo, PDO MySQL e OpenSSL necessárias.

## Funcionalidades e limites

- Cadastro, e-mail único, password_hash/password_verify, login, lembrar de mim e logout com sessão MySQL invalidada.
- Aceites versionados, recuperação de senha, confirmação de novo e-mail com nova checagem de unicidade, perfil/foto e exclusão mediante senha atual. Tokens como hash, com expiração e consumo único transacional.
- Snapshots clínicos no MySQL, revisões e lotes idempotentes, recuperação em outro navegador, familiares de consulta por código único, revogação com troca do código e invalidação dos links.
- WhatsApp direto e e-mail SMTP com TLS e certificado validado. OAuth Google com PKCE e vínculo de navegador implementado; permanece desabilitado até configurar client_id/client_secret e a URL de retorno no Google. Exige cURL com certificados válidos; não foi homologado com credenciais reais. Sem URL oficial da Play Store, o convite oferece acesso web e informa que o app ainda não está publicado.
- Central de notificações persistentes. Push nativo e lembretes em segundo plano não são executados nesta versão PHP; dependem de etapa própria e agendador do plano.
- Novos anexos privados centralizados. Anexos antigos no navegador não são migrados automaticamente. Contas SQLite anteriores também não: a instalação MySQL começa vazia.
- Validação de conflito por paciente e por nome de acompanhante entre pacientes do proprietário. Responsável de atendimento realizado e medicamentos suspensos preservados no servidor.
- Auditoria de ações sem conteúdo clínico, senha ou tokens nos logs.

## Homologação no destino

Validar HTTPS para noscuidamos.gabale.com.br antes de login remoto. Confirmar extensões PHP, schema MySQL, pasta privada, SMTP e regras IIS. Testar duas contas, vínculo/revogação, conflitos, recuperação de senha e anexos. Acesso HTTP direto à pasta privada deve falhar. Verificar persistência em outro aparelho. Definir backups e retenção sem contratar recursos; excluir do banco ativo não apaga backups da hospedagem.

Não há credenciais MySQL nesta entrega: testes locais não comprovam conexão com a conta Locaweb. Textos legais são provisórios. Usar dados fictícios até homologação e aprovação da política de retenção.

## Desenvolvimento e migração

Preparar MySQL com schema e configuração privada. CUIDADO_CONFIG aponta ao arquivo de configuração e CUIDADO_PRIVATE ao caminho absoluto de release/locaweb-php/private. Para testar: `php -S 127.0.0.1:8083 -t release/locaweb-php/public release/locaweb-php/public/index.php`, configurando origin=http://127.0.0.1:8083 somente localmente. APIs mantêm rotas; regras em php/src e telas copiadas das fontes existentes. Migração futura deve levar MySQL e diretório privado juntos, preservando IDs e vínculos.
