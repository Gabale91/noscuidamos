# Publicação e DNS — gabale.com.br

Preparação em 08/11/2026. Endereço proposto: **https://app.gabale.com.br**.

## Estado real

O aplicativo continua no computador, em localhost. Não existe hospedagem externa criada/verificada nesta etapa, nem IP/CNAME confirmado para informar como destino. Nenhuma entrada DNS foi alterada. Não apontar para localhost, 127.0.0.1 ou um IP de exemplo.

O serviço Sites disponível nesta sessão hospeda Workers com conexões HTTP, não o servidor Node/SQLite e SMTP/TCP atual sem migração de arquitetura. Por isso, não foi publicado um HTML isolado fingindo hospedar o aplicativo completo. É necessário acesso a hospedagem compatível com Node 24, armazenamento persistente e saída SMTP segura, ou aprovar uma migração para outro ambiente.

## Arquivos preparados

- `deploy/Dockerfile`: servidor Node 24 com dependência de e-mail, sem incluir os dados ou senhas do computador.
- `deploy/compose.yaml`: aplicação, volume persistente de SQLite e proxy Caddy para HTTPS.
- `deploy/Caddyfile`: configuração do subdomínio e proxy.
- `deploy/runtime.env.example`: configuração de produção sem segredos.
- `.dockerignore`: permite somente fontes necessárias na imagem; `.env` local, credenciais, banco e anexos não são enviados.

Em uma VPS Linux com Docker/Compose, preencher `deploy/runtime.env` de forma privada e executar, na raiz do projeto:

```text
docker compose --env-file deploy/runtime.env -f deploy/compose.yaml up -d --build
```

Abrir somente 80/443 para o acesso público, mantendo a porta da aplicação interna. O domínio precisa apontar à VPS para a emissão do certificado HTTPS. Confirmar também a saída SMTP 465 permitida pela hospedagem.

Docker/Compose não foram executados neste computador; a imagem e o certificado ainda precisam de homologação no destino real. O volume não é backup: definir cópia, retenção e restauração antes de dados reais. Esta implantação começa com banco vazio; não transfere automaticamente contas e dados locais. Os arquivos clínicos do protótipo ainda são locais ao navegador de origem.

## Dados de DNS a preencher após confirmar o destino

Escolher **uma** das formas abaixo, conforme a hospedagem informar:

| Campo | Hospedagem com IP público | Hospedagem com destino de domínio |
| --- | --- | --- |
| Tipo | A | CNAME |
| Nome/entrada | app | app |
| Destino | IP público real fornecido pela hospedagem — pendente | Host real fornecido pela hospedagem — pendente |
| TTL inicial proposto | 3600 segundos | 3600 segundos |

Não criar A e CNAME simultaneamente para app. Não adicionar AAAA sem IPv6 confirmado. Consultar registros existentes de app antes de substituir qualquer entrada.

Adicionar o subdomínio não exige trocar os servidores NS do domínio nem os registros de e-mail. Preservar MX, SPF, DKIM, DMARC, site principal e www. Caso o DNS autoritativo esteja em outra empresa, alterar no painel dessa empresa, mesmo que o domínio seja contratado na Locaweb.

Após aplicar: verificar resolução pública, certificado HTTPS, login/cadastro, persistência após reinício, envio de e-mail e links de convite/recuperação no celular. Só então informar o endereço como disponível para uso externo.

Referências oficiais consultadas: [Locaweb — domínio para aplicação na nuvem](https://www.locaweb.com.br/ajuda/wiki/como-configurar-um-dominio-para-sua-aplicacao-na-nuvem-locaweb-cloud/) e [Locaweb — apontamento externo no DNS](https://www.locaweb.com.br/ajuda/wiki/como-adicionar-apontamento-externo-na-zona-de-dns-registro-de-dominio/).

## Verificação real da hospedagem em 08/11/2026

FTPS autenticado e pasta de publicação confirmados: servidor ftp.gabale1.hospedagemdesites.ws, usuário gabale1, pasta /web/noscuidamos. A pasta /noscuidamos na raiz FTP não é a raiz web do subdomínio. Arquivo temporário em /web/noscuidamos respondeu HTTP 200 no subdomínio e foi removido.

Uma verificação isolada do handler Node no IIS retornou HTTP 500.21: módulo iisnode não registrado. Isso comprova que o caminho de execução Node pelo IIS não está habilitado nessa hospedagem; não confirma suporte a Node 24 em outro modo de execução do plano. Todos os arquivos e a subpasta de diagnóstico foram removidos. O aplicativo completo ainda não foi publicado. Confirmar com a Locaweb suporte a processo Node 24, armazenamento persistente e proxy HTTPS, ou usar um destino compatível e apontar o subdomínio a ele. Não é suficiente copiar o HTML para obter autenticação e serviços do servidor.
