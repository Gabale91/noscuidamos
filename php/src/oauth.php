<?php
declare(strict_types=1);
trait OAuthApi {
    public function googleConfigured(): bool { return !empty($this->config['google']['client_id'])&&!empty($this->config['google']['client_secret'])&&function_exists('curl_init'); }
    public function googleStart(array $b): array {
        if(!$this->googleConfigured())fail('Login Google ainda não configurado.',503);
        if(($b['register']??false)===true&&(($b['accepted']??false)!==true||($b['termsVersion']??'')!==$this->config['terms_version']||($b['privacyVersion']??'')!==$this->config['privacy_version']))fail('Leia e aceite os documentos atuais.');
        $state=secret();$binding=secret();$verifier=secret();
        $flow=['register'=>($b['register']??false)===true,'remember'=>($b['remember']??false)===true,'patientCode'=>substr((string)($b['patientCode']??''),0,100),'terms'=>$this->config['terms_version'],'privacy'=>$this->config['privacy_version']];
        $this->q('DELETE FROM cf_oauth WHERE expires<?',[nowms()]);$this->q('INSERT INTO cf_oauth VALUES(?,?,?,?,?)',[digest($state),digest($binding),$verifier,json_encode($flow,JSON_THROW_ON_ERROR),nowms()+600000]);
        setcookie('cf_oauth',$binding,['expires'=>time()+600,'path'=>'/','httponly'=>true,'secure'=>str_starts_with($this->config['origin'],'https://'),'samesite'=>'Lax']);
        return ['url'=>'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query(['client_id'=>$this->config['google']['client_id'],'redirect_uri'=>$this->config['origin'].'/auth/google/callback','response_type'=>'code','scope'=>'openid email profile','state'=>$state,'code_challenge'=>rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'='),'code_challenge_method'=>'S256'])];
    }
    public function googleHttp(string $url,?array $form=null,?string $token=null): array {
        $c=curl_init($url);curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>15,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
        if($form!==null){curl_setopt($c,CURLOPT_POST,true);curl_setopt($c,CURLOPT_POSTFIELDS,http_build_query($form));}if($token!==null)curl_setopt($c,CURLOPT_HTTPHEADER,['Authorization: Bearer '.$token]);
        $raw=curl_exec($c);$status=curl_getinfo($c,CURLINFO_HTTP_CODE);curl_close($c);if(!is_string($raw)||$status!==200)fail('Não foi possível validar o acesso Google.',503);return json_decode($raw,true,512,JSON_THROW_ON_ERROR);
    }
    public function googleCallback(): never {
        if(!$this->googleConfigured())redirect_to('/?error=google');
        $flow=$this->tx(function(){ $state=digest((string)($_GET['state']??''));$f=$this->one('SELECT * FROM cf_oauth WHERE state=? AND expires>? FOR UPDATE',[$state,nowms()]);if(!$f||!hash_equals($f['binding'],digest((string)($_COOKIE['cf_oauth']??''))))return false;$this->q('DELETE FROM cf_oauth WHERE state=?',[$state]);return $f; });
        if(!$flow||empty($_GET['code']))redirect_to('/?error=google');
        $g=$this->config['google'];$t=$this->googleHttp('https://oauth2.googleapis.com/token',['client_id'=>$g['client_id'],'client_secret'=>$g['client_secret'],'code'=>(string)$_GET['code'],'code_verifier'=>$flow['verifier'],'redirect_uri'=>$this->config['origin'].'/auth/google/callback','grant_type'=>'authorization_code']);
        if(empty($t['access_token']))redirect_to('/?error=google');$identity=$this->googleHttp('https://openidconnect.googleapis.com/v1/userinfo',null,$t['access_token']);
        if(empty($identity['sub'])||($identity['email_verified']??false)!==true||!filter_var($identity['email']??'',FILTER_VALIDATE_EMAIL))redirect_to('/?error=google');
        $f=json_decode($flow['payload'],true,512,JSON_THROW_ON_ERROR);$email=email_value($identity['email']);$u=$this->one('SELECT * FROM cf_users WHERE google_sub=?',[$identity['sub']]);
        if(!$u){if($this->one('SELECT id FROM cf_users WHERE email=?',[$email]))redirect_to('/?error=existing');if(!$f['register'])redirect_to('/?error=firstaccess');if($f['terms']!==$this->config['terms_version']||$f['privacy']!==$this->config['privacy_version'])redirect_to('/?error=consent');
            $u=['id'=>uid()];$this->tx(function()use($u,$identity,$email,$f){$this->q('INSERT INTO cf_users(id,name,email,google_sub) VALUES(?,?,?,?)',[$u['id'],substr((string)($identity['name']??$email),0,150),$email,$identity['sub']]);$this->q('INSERT INTO cf_sync VALUES(?,0)',[$u['id']]);$this->consent($u['id'],['accepted'=>true,'termsVersion'=>$f['terms'],'privacyVersion'=>$f['privacy']]);if($f['patientCode'])$this->join($u['id'],$f['patientCode']);$this->audit('google_account_created',$u['id']);});
        }
        $this->start($u['id'],$f['remember']);redirect_to('/');
    }
}
