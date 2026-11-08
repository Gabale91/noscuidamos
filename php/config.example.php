<?php
// Copy OUTSIDE the public web directory as cuidado-config.php. Never commit credentials.
return [
    'origin' => 'https://noscuidamos.gabale.com.br',
    'dsn' => 'mysql:host=HOST_MYSQL;dbname=BANCO;charset=utf8mb4',
    'db_user' => 'USUARIO',
    'db_password' => '',
    'storage' => '/CAMINHO_PRIVADO/cuidado-files',
    'terms_version' => '2026-11-05.1',
    'privacy_version' => '2026-11-05.1',
    'smtp' => ['host'=>'email-ssl.com.br','port'=>465,'user'=>'noscuidamos@gabale.com.br','password'=>'','from'=>'noscuidamos@gabale.com.br'],
    'play_store_url' => '',
    'google' => ['client_id'=>'','client_secret'=>''],
];
