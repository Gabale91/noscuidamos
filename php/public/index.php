<?php
declare(strict_types=1);
ini_set('display_errors','0');
ini_set('zend.exception_ignore_args','1');
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');header('X-Frame-Options: DENY');
header("Content-Security-Policy: object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
header('Permissions-Policy: geolocation=(), microphone=()');
if(($_SERVER['HTTPS']??'')==='on')header('Strict-Transport-Security: max-age=31536000');
if(($_SERVER['REQUEST_METHOD']??'')==='GET' && parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH)==='/icon.svg'){
    header('Content-Type: image/svg+xml');readfile(__DIR__.'/icon.svg');exit;
}
$private=getenv('CUIDADO_PRIVATE')?:dirname(__DIR__);
require $private.'/src/patients.php';
require $private.'/src/oauth.php';
require $private.'/src/core.php';
require $private.'/src/mail.php';
require $private.'/src/registration.php';
try {
    $configFile=getenv('CUIDADO_CONFIG')?:$private.'/cuidado-config.php';
    if(!is_file($configFile))fail('Instalação pendente: configure o arquivo privado do aplicativo.',503);
    $cfgPath=realpath($configFile);
    $publicRoots=[realpath(__DIR__),realpath($_SERVER['DOCUMENT_ROOT']??__DIR__)];
    foreach($publicRoots as $web){
        if(!$web||!$cfgPath||str_starts_with(strtolower($cfgPath),strtolower(rtrim($web,'/\\')).DIRECTORY_SEPARATOR)){
            fail('A configuração deve ficar fora da pasta pública.',503);
        }
    }
    $config=require $configFile;
    if(!is_array($config)||!filter_var($config['origin']??'',FILTER_VALIDATE_URL))fail('Configuração inválida.',503);
    $method=$_SERVER['REQUEST_METHOD'];$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)?:'/');$body=[];
    $mobileOrigin=str_starts_with($config['origin'],'https://') && str_starts_with($path,'/api/') && ($_SERVER['HTTP_ORIGIN']??'')==='https://localhost';
    if($mobileOrigin){
        if(($_SERVER['HTTPS']??'')!=='on')fail('Use uma conexão HTTPS.',403);
        header('Access-Control-Allow-Origin: https://localhost');
        header('Vary: Origin');
        if($method==='OPTIONS'){
            header('Access-Control-Allow-Methods: GET, POST');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-NC-Android');
            http_response_code(204);exit;
        }
        if(($_SERVER['HTTP_X_NC_ANDROID']??'')!=='1')fail('Cliente inválido.',403);
    }
    $app=new App($config,$mobileOrigin);
    $reads=['config','me','profile','mobile/context','notifications/list','notifications/state','notifications/patient-code','notifications/share-invite','notifications/shared-patients','notifications/shared-patient','notifications/details','notifications/owned-patients','files/download','files/list'];
    if(str_starts_with($path,'/api/')){
        $action=substr($path,5);
        if(!in_array($method,['GET','POST'],true)||($method==='GET'&&!in_array($action,$reads,true))||($method==='POST'&&in_array($action,array_diff($reads,['profile']),true)))fail('Método inválido.',405);
        if($method==='POST'){
            if(!$mobileOrigin&&($_SERVER['HTTP_ORIGIN']??'')!==$config['origin'])fail('Origem da solicitação inválida.',403);
            $app->rate($path);$limit=$action==='files/upload'?11000000:($action==='notifications/sync'?2000000:($action==='profile'?300000:16000));
            if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit)fail('Solicitação muito grande.',413);
            if($action==='files/upload')$body=$_POST;
            else{if(!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json'))fail('Formato inválido.',415);$raw=file_get_contents('php://input',false,null,0,$limit+1);if(strlen($raw)>$limit)fail('Solicitação muito grande.',413);$body=json_decode($raw,true,512,JSON_THROW_ON_ERROR);if(!is_array($body))fail('Dados inválidos.');}
        }
        if($action==='mobile/context'){
            $u=$app->user();
            $saved=$app->notifications($u['id'],'owned-patients',[]);
            $saved['userId']=$u['id'];
            $saved['revision']=(int)($app->one('SELECT revision FROM cf_sync WHERE user_id=?',[$u['id']])['revision']??0);
            json_out($saved);
        }
        if(str_starts_with($action,'notifications/')){ $u=$app->user();json_out($app->notifications($u['id'],substr($action,14),$body)); }
        if(str_starts_with($action,'files/')){
            $u=$app->user();
            if($action==='files/upload')json_out($app->upload($u['id'],$body),201);
            if($action==='files/download')$app->download($u['id'],(string)($_GET['id']??''));
            if($action==='files/list'){$p=$app->patient($u['id'],(string)($_GET['patient']??''));json_out(['files'=>$app->q('SELECT id,record_id,kind,name,mime,size,created_at FROM cf_files WHERE patient=?',[$p['id']])->fetchAll()]);}
            fail('Operação inválida.',404);
        }
        json_out($app->auth($action,$body,$method),match($action){'register','register/resend'=>202,'register/confirm'=>201,default=>200});
    }
    if($method!=='GET')fail('Método inválido.',405);
    if($path==='/auth/google/callback')$app->googleCallback();
    if($path==='/healthz'){$app->q('SELECT 1');json_out(['status'=>'ok']);}
    if(str_starts_with($path,'/convite/')){
        $link=$app->one('SELECT l.code_hash,p.code FROM cf_links l JOIN cf_patients p ON p.id=l.patient JOIN cf_invite_limits i ON i.patient=p.id WHERE l.id=? AND i.expires>? AND i.used_at IS NULL',[substr($path,9),nowms()]);
        if(!$link)fail('Convite indisponível.',404);$code=implode('-',str_split($link['code'],4));if(!hash_equals($link['code_hash'],digest($code)))fail('Convite substituído.',404);
        $store=$config['play_store_url']??'';if($store&&!preg_match('#^https://play\.google\.com/store/apps/details\?id=[A-Za-z0-9_.]+$#',$store))fail('Endereço da loja inválido.',503);
        if($store&&str_contains($_SERVER['HTTP_USER_AGENT']??'','Android'))redirect_to($store);
        header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Convite</title><main><h1>💚 Nós Cuidamos</h1><p>Código de vinculação: <strong>'.e($code).'</strong></p>'.($store?'<a href="'.e($store).'">Baixar na Google Play</a>':'<p>O aplicativo ainda não está publicado na Google Play. Acesse pela web.</p>').'<p><a href="/?patientCode='.rawurlencode($code).'">Cadastrar ou entrar no aplicativo</a></p></main></html>';exit;
    }
    $assets=$private.'/assets';
    if($path==='/app'){
        try{$u=$app->user();}catch(HttpError){redirect_to('/');}
        $html=file_get_contents($assets.'/app.html');
        if($html===false||!str_contains($html,'<!-- NC_CONTEXT -->'))fail('A área clínica precisa do pacote de publicação atualizado.',503);
        $saved=$app->notifications($u['id'],'owned-patients',[]);
        $saved['userId']=$u['id'];
        $saved['revision']=(int)($app->one('SELECT revision FROM cf_sync WHERE user_id=?',[$u['id']])['revision']??0);
        $context=json_encode($saved,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_THROW_ON_ERROR);
        $html=str_replace('<!-- NC_CONTEXT -->','<script type="application/json" id="phpSaved">'.$context.'</script>',$html);
        header("Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; connect-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        header('Content-Type: text/html; charset=utf-8');echo $html;exit;
    }
    if($path==='/'||$path==='/profile'){
        header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        header('Content-Type: text/html; charset=utf-8');
        readfile($assets.'/login.html');
        exit;
    }
    $scripts=['/google-link.js'=>'google-link.js','/auth-ui.js'=>'auth-ui.js','/notifications-ui.js'=>'notifications-ui.js','/php-bootstrap.js'=>'php-bootstrap.js','/php-files.js'=>'php-files.js','/clinical-app.js'=>'clinical-app.js','/clinical-events.js'=>'clinical-events.js'];
    if(isset($scripts[$path])){header('Content-Type: text/javascript; charset=utf-8');readfile($assets.'/'.$scripts[$path]);exit;}
    fail('Página não encontrada.',404);
}catch(HttpError $x){json_out(['error'=>$x->getMessage()],$x->status);}
catch(JsonException){json_out(['error'=>'Dados JSON inválidos.'],400);}
catch(PDOException $x){error_log('Cuidado DB: '.$x->getCode());json_out(['error'=>$x->getCode()==='23000'?'Cadastro duplicado ou referência inválida.':'Banco de dados indisponível. Verifique a instalação.'],$x->getCode()==='23000'?409:503);}
catch(Throwable $x){error_log('Cuidado: '.get_class($x));json_out(['error'=>'Não foi possível concluir. Verifique a configuração do servidor.'],503);}
