# Nós Cuidamos — homologação na Locaweb Windows

## Instalação e recuperação

1. Use o banco MySQL separado para homologação e documentos fictícios. Coloque `public` em `/web/noscuidamos` e mantenha a configuração, código privado e anexos fora de `/web`. Consulte também o LEIA-ME.
2. Interrompa gravações. Guarde juntos o dump MySQL, os anexos privados e os respectivos hashes. O script `backup-locaweb.ps1` faz o dump e compacta os anexos a partir de um host Windows autorizado. Consulte os parâmetros no próprio script. Guarde as cópias em armazenamento privado e protegido.
3. Em um ambiente PHP CLI autorizado a acessar o banco, configure `CUIDADO_CONFIG` com o caminho absoluto da configuração e execute `php migrate.php` a partir da pasta privada. As migrações 001 a 004 instalam a base, convertem e verificam registros legados e adicionam o controle de convites. No MySQL, a criação das tabelas ocorre separadamente da transação de conversão.
4. Valide os totais e os vínculos por paciente, teste leitura, edição e anexos com usuários fictícios e só então retome as gravações. As gravações mantêm o snapshot e os registros relacionais sincronizados na mesma transação.
5. Para ensaiar a recuperação, verifique os hashes e restaure o SQL e os anexos em banco e diretório privados separados. Aponte uma instância de homologação para as cópias e valide as permissões, os totais e a abertura dos documentos. Em caso de falha de atualização, mantenha as gravações pausadas até validar a recuperação.

## Google e hospedagem

- No projeto Google Cloud nos-cuidamos-514200, abra Google Auth Platform, configure Público externo em teste e adicione as contas de teste. Crie um cliente Web com a URI autorizada `https://noscuidamos.gabale.com.br/auth/google/callback`. Use os escopos openid, email e profile. Salve ID e segredo somente na configuração PHP privada. Teste também a vinculação voluntária pelo perfil.
- Solicite à Locaweb permissão de leitura e gravação para a identidade PHP/IIS em `/cuidado-private/files`. Valide a escrita com o próprio PHP. Confirme se o plano Windows permite executar PHP em tarefa agendada antes de configurar lembretes ou cópias automáticas.

## Pendências para dados reais

A homologação local usou PHP 8.3 e MariaDB. Falta validar o MySQL e a gravação privada da Locaweb, restaurar uma cópia completa em homologação e testar o OAuth real. O acompanhante ainda é registrado por nome e o familiar tem leitura. Faltam permissões delegadas de escrita, lembretes agendados, push e testes abrangentes de autorização e OCR. A CSP da área clínica ainda permite origens específicas necessárias para OCR e PDF. A política de retenção, a proteção das cópias e a configuração de autenticação precisam ser revisadas antes de receber dados reais.

## Confirmação de cadastro

A migração 004 cria a tabela temporária de confirmação, sem alterar contas ou registros clínicos existentes. O cadastro exige senha com pelo menos seis caracteres, maiúscula, minúscula, dígito e símbolo. O limite é 72 bytes para permitir o fallback bcrypt sem truncamento. O hash usa Argon2id quando disponível. O login continua aceitando a senha das contas anteriores.

O código vence em dez minutos. O reenvio ao mesmo endereço exige um minuto, com até cinco envios por endereço e por janela de hora do servidor. A correção de endereço invalida o código anterior. A cada requisição de cadastro, confirmação ou reenvio, a aplicação remove em lotes pendências cuja validade terminou há mais de uma hora. Esse intervalo permite reenviar sem preencher todo o formulário novamente. A limpeza em períodos sem tráfego depende de agendador ainda por confirmar.

Configure o SMTP na seção privada smtp, com remetente e usuário noscuidamos@gabale.com.br, host email-ssl.com.br e porta 465, desde que correspondam ao painel da caixa postal. A configuração também aceita 587 com STARTTLS. Teste com uma caixa de homologação e confira os resultados SPF, DKIM e DMARC nos cabeçalhos recebidos. Nenhuma credencial entra no ZIP.

Com `CUIDADO_CONFIG` apontando para o arquivo privado, execute `php check-locaweb-smtp.php` na pasta privada do pacote. O diagnóstico testa TLS e autenticação sem enviar e-mail. Em seguida, use o cadastro de homologação para testar a entrega e o consumo do código.
