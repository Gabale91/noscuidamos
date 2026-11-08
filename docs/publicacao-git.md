# Publicação automática por GitHub e Render

Preparação local concluída em 08/11/2026. A publicação externa depende da conexão das contas GitHub/Render, autorização do plano e sucesso do deploy. Não há URL onrender.com confirmada enquanto o serviço não for criado.

## Fluxo preparado

1. Repositório privado exclusivo deste projeto; branch inicial `codex/publicacao`.
2. Workflow `.github/workflows/validar.yml` executa testes e build Docker a cada push/PR.
3. `render.yaml` descreve o serviço com Node 24 via Docker, verificação `/healthz`, SQLite persistente em `/app/data` e SMTP Locaweb.
4. Após publicação e validação, associar `noscuidamos.gabale.com.br` ao serviço e alterar na Locaweb apenas o registro desse subdomínio.
5. Publicações seguintes são automáticas quando os testes da branch passarem.

## Custo e acesso

O manifesto usa instância Starter e disco persistente. Não foi contratado ou criado um recurso pago nesta preparação. O valor vigente precisa ser apresentado/aprovado na conta Render antes de criar o serviço.

Esse plano é necessário para manter a arquitetura atual: o plano gratuito não oferece disco persistente e bloqueia as portas SMTP 465/587. Referências oficiais: https://render.com/docs/free e https://render.com/docs/disks.

GitHub e Render precisam ser instalados/conectados à sessão e o repositório privado precisa autorizar o acesso do serviço de hospedagem. Não colocar senha, token ou credenciais em URL de Git, argumentos de comandos, commits ou logs.

## Configurações de produção

O SMTP usa `noscuidamos@gabale.com.br`. O segredo SMTP_PASSWORD_B64 é solicitado como variável privada no Render (`sync: false`). Apesar do nome, Base64 não é criptografia: deve ser tratado como senha e não incluído no código. A credencial só será transferida ao destino autorizado e não faz parte do repositório.

Antes do domínio próprio estar pronto, o servidor usa RENDER_EXTERNAL_URL como origem para login e links. Quando o domínio estiver verificado, configurar APP_ORIGIN e APP_PUBLIC_URL para `https://noscuidamos.gabale.com.br` e confirmar o novo deploy. Não inventar o destino do CNAME: usar exatamente o hostname exibido pelo Render no serviço criado. Preservar os registros do site Gabale e do e-mail.

A emissão HTTPS do domínio é feita pelo Render após a validação do DNS: https://render.com/docs/custom-domains.

## Dados locais

Esta publicação começa com banco vazio. Não há envio automático de banco, contas, pacientes ou anexos do computador. Dados clínicos continuam com as limitações de armazenamento e migração descritas em modulo-notificacoes.md. O código pode ser publicado no repositório privado; dados pessoais e segredos ficam excluídos.

## Verificações antes de considerar publicado

- Testes locais e CI aprovados; Docker build aprovado no CI.
- Serviço externo iniciado, `/healthz` respondendo e volume gravável/persistente.
- Login/cadastro e convite funcionando no endereço externo.
- SMTP com teste autorizado de recebimento.
- DNS do subdomínio validado e certificado HTTPS correto.

Ainda não executado nesta preparação: push GitHub, build remoto, contratação/criação do serviço Render, deploy público e mudança de DNS.
