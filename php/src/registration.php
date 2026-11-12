<?php
declare(strict_types=1);

final class Registration {
    public function __construct(private App $app) {}

    public function handle(string $action, array $body): array {
        $app = $this->app;
        $now = nowms();
        $app->q('DELETE FROM cf_pending_registrations WHERE expires<? LIMIT 100', [$now - 3600000]);
        if ($action === 'register') {
            $email = email_value($body['email'] ?? '');
            $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
            if (!$name || strlen($name)>150 || strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL)) {
                fail('Informe nome completo e e-mail válido.');
            }
            $password = $body['password'] ?? null;
            if (!valid_password($password) || $password !== ($body['confirmPassword'] ?? null)) {
                fail('Use senhas iguais com pelo menos 6 caracteres, maiúscula, minúscula, número e símbolo.');
            }
            $this->checkConsent($body);
            $payload = array_intersect_key($body, array_flip(['accepted','termsVersion','privacyVersion','patientCode']));
            $payload['name'] = $name;
            $payload['passwordHash'] = secure_password_hash($password);
            $token = secret();
            $this->issue($token, $email, $payload, null);
            return ['registrationToken'=>$token];
        }

        $token = $this->token($body['registrationToken'] ?? null);
        if (!$token) fail('Código expirado. Solicite um novo.');
        if ($action === 'register/resend') {
            $row = $app->one('SELECT * FROM cf_pending_registrations WHERE token=?',[digest($token)]);
            if (!$row || $row['payload'] === null) fail('Solicitação encerrada. Inicie um novo cadastro.');
            $email = array_key_exists('email',$body) ? email_value($body['email']) : $row['email'];
            if (strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Informe um e-mail válido.');
            $next = secret();
            $this->issue($next, $email, json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR), $token);
            return ['registrationToken'=>$next];
        }

        $code = is_string($body['code'] ?? null) ? strtoupper(trim($body['code'])) : '';
        $error = $app->tx(function () use ($app,$token,$code) {
            $key = digest($token);
            $row = $app->one('SELECT * FROM cf_pending_registrations WHERE token=? FOR UPDATE',[$key]);
            if (!$row || (int)$row['expires'] <= nowms()) return 'Código expirado. Solicite um novo.';
            if ($row['payload'] === null) return 'Este código já foi utilizado ou substituído.';
            if ((int)$row['attempts'] >= 5) return 'Limite de tentativas atingido. Solicite um novo código.';
            if (!preg_match('/^[A-Z0-9]{6}$/D',$code) || !hash_equals($row['code_hash'],hash_hmac('sha256',$code,$token))) {
                $app->q('UPDATE cf_pending_registrations SET attempts=attempts+1 WHERE token=?',[$key]);
                return (int)$row['attempts'] === 4 ? 'Limite de tentativas atingido. Solicite um novo código.' : 'Código incorreto. Confira o e-mail recebido.';
            }

            $payload = json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR);
            $id = uid();
            try {
                $app->q('INSERT INTO cf_users(id,name,email,password) VALUES(?,?,?,?)',[$id,$payload['name'],$row['email'],$payload['passwordHash']]);
            } catch (PDOException $failure) {
                if ((int)($failure->errorInfo[1] ?? 0) === 1062) return 'Não foi possível concluir o cadastro. Entre na sua conta ou recupere a senha.';
                throw $failure;
            }
            $app->q('INSERT INTO cf_sync VALUES(?,0)',[$id]);
            $app->consent($id,$payload);
            if (!empty($payload['patientCode'])) $app->join($id,(string)$payload['patientCode']);
            $app->audit('account_created',$id);
            $app->q('UPDATE cf_pending_registrations SET payload=NULL, code_hash=NULL WHERE token=?',[$key]);
            return null;
        });
        if ($error !== null) fail($error);
        return ['message'=>'Conta criada com sucesso!'];
    }

    private function checkConsent(array $body): void {
        if (($body['accepted'] ?? false) !== true ||
            ($body['termsVersion'] ?? null) !== $this->app->config['terms_version'] ||
            ($body['privacyVersion'] ?? null) !== $this->app->config['privacy_version']) {
            fail('Leia e aceite as versões atuais dos Termos de Uso e da Política de Privacidade.');
        }
    }

    private function token(mixed $token): ?string {
        return is_string($token) && preg_match('/^[a-f0-9]{64}$/D',$token) ? $token : null;
    }

    private function issue(string $token, string $email, array $payload, ?string $previous): void {
        $app = $this->app;
        if (!$app->mailConfigured()) fail('Envio de e-mail temporariamente indisponível.',503);
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        do {
            $code = '';
            for ($i=0; $i<6; $i++) $code .= $alphabet[random_int(0,35)];
        } while (ctype_alpha($code) || ctype_digit($code));
        $key = digest($token);
        $now = nowms();
        $old = $app->tx(function () use ($app,$previous,$email,$payload,$key,$code,$token,$now) {
            $bucket = digest('register-email:'.$email.':'.intdiv(time(),3600));
            $app->q('INSERT INTO cf_rate(bucket,hits,expires) VALUES(?,1,?) ON DUPLICATE KEY UPDATE hits=hits+1',[$bucket,$now+7200000]);
            if ((int)$app->one('SELECT hits FROM cf_rate WHERE bucket=?',[$bucket])['hits'] > 5) fail('Limite de envios atingido. Tente mais tarde.',429);
            $old = null;
            if ($previous) {
                $old = $app->one('SELECT email,payload,code_hash,resend_at FROM cf_pending_registrations WHERE token=? FOR UPDATE',[digest($previous)]);
                if (!$old || $old['payload'] === null) fail('Solicitação encerrada. Inicie um novo cadastro.');
                if ($old['email'] === $email && (int)$old['resend_at'] > $now) fail('Aguarde 60 segundos antes de solicitar outro código.',429);
                $app->q('UPDATE cf_pending_registrations SET payload=NULL, code_hash=NULL WHERE token=?',[digest($previous)]);
            }
            $app->q('INSERT INTO cf_pending_registrations(token,email,payload,code_hash,expires,resend_at) VALUES(?,?,?,?,?,?)',
                [$key,$email,json_encode($payload,JSON_THROW_ON_ERROR),hash_hmac('sha256',$code,$token),$now+600000,$now+60000]);
            return $old;
        });
        try {
            $existing = $app->one('SELECT id FROM cf_users WHERE email=?',[$email]);
            $body = $existing
                ? "Recebemos uma solicitação de cadastro. Já existe uma conta para este endereço. Entre normalmente ou solicite a recuperação de senha."
                : "Seu código de confirmação é: $code\n\nEle vale por 10 minutos. Se você não solicitou este cadastro, ignore esta mensagem.";
            $app->send($email,'Confirme seu e-mail no Nós Cuidamos',$body);
        } catch (Throwable $failure) {
            $app->tx(function () use ($app,$key,$previous,$old) {
                $app->q('DELETE FROM cf_pending_registrations WHERE token=?',[$key]);
                if ($old) $app->q('UPDATE cf_pending_registrations SET payload=?,code_hash=? WHERE token=?',
                    [$old['payload'],$old['code_hash'],digest($previous)]);
            });
            fail('Não foi possível enviar o e-mail. Tente novamente.',503);
        }
    }
}
