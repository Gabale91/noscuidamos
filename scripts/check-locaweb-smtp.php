<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors','0');
ini_set('zend.exception_ignore_args','1');

$path = getenv('CUIDADO_CONFIG');
if (!$path || !is_file($path)) {
    fwrite(STDERR, "Aponte CUIDADO_CONFIG para o arquivo privado do aplicativo.\n");
    exit(2);
}
$source = is_file(__DIR__.'/src/mail.php') ? __DIR__.'/src' : dirname(__DIR__).'/php/src';
require $source.'/patients.php';
require $source.'/oauth.php';
require $source.'/core.php';
require $source.'/mail.php';

try {
    $config = require $path;
    $smtp = $config['smtp'] ?? [];
    if (empty($smtp['password']) || empty($smtp['user']) || empty($smtp['from']) || empty($smtp['host'])) {
        fwrite(STDERR, "A configuração SMTP privada está incompleta.\n");
        exit(2);
    }
    smtp_send($smtp, $smtp['from'], 'Verificação SMTP', '', true);
    echo "Conexão TLS e autenticação SMTP confirmadas. Nenhuma mensagem enviada.\n";
} catch (Throwable $failure) {
    fwrite(STDERR, "Falha na verificação SMTP. Confira host, porta, certificado e credenciais privadas.\n");
    exit(1);
}
