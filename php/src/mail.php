<?php
declare(strict_types=1);
// Minimal SMTP submission, TLS with hostname and CA validation. No PHP mail() fallback.
function smtp_send(array $c,string $to,string $subject,string $text,bool $verifyOnly=false): void {
    if(!filter_var($to,FILTER_VALIDATE_EMAIL)||!filter_var($c['from'],FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$subject))fail('Mensagem inválida.');
    $port=(int)$c['port'];if(!in_array($port,[465,587],true))fail('Porta SMTP inválida.',503);
    $ctx=stream_context_create(['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'peer_name'=>$c['host'],'allow_self_signed'=>false]]);
    $s=@stream_socket_client(($port===465?'ssl':'tcp').'://'.$c['host'].':'.$port,$errno,$error,15,STREAM_CLIENT_CONNECT,$ctx);
    if(!$s)fail('Serviço de e-mail indisponível.',503);stream_set_timeout($s,20);
    $read=static function(array $codes)use($s):void{$last='';do{$line=fgets($s,4096);if($line===false)fail('Resposta SMTP indisponível.',503);$last=$line;}while(isset($line[3])&&$line[3]==='-');if(!in_array((int)substr($last,0,3),$codes,true))fail('O provedor não aceitou o envio do e-mail.',503);};
    $write=static function(string $line,array $codes)use($s,$read):void{if(fwrite($s,$line."\r\n")===false)fail('Envio SMTP indisponível.',503);$read($codes);};
    try{
        $read([220]);$write('EHLO noscuidamos.gabale.com.br',[250]);
        if($port===587){$write('STARTTLS',[220]);if(!stream_socket_enable_crypto($s,true,STREAM_CRYPTO_METHOD_TLS_CLIENT))fail('Não foi possível estabelecer TLS.',503);$write('EHLO noscuidamos.gabale.com.br',[250]);}
        $write('AUTH LOGIN',[334]);$write(base64_encode($c['user']),[334]);$write(base64_encode($c['password']),[235]);
        if($verifyOnly){fwrite($s,"QUIT\r\n");return;}
        $write('MAIL FROM:<'.$c['from'].'>',[250]);$write('RCPT TO:<'.$to.'>',[250,251]);$write('DATA',[354]);
        $message='From: Nos Cuidamos <'.$c['from'].">\r\nTo: <".$to.">\r\nSubject: =?UTF-8?B?".base64_encode($subject)."?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\nDate: ".date(DATE_RFC2822)."\r\nMessage-ID: <".secret().'@noscuidamos.gabale.com.br'.">\r\n\r\n".chunk_split(base64_encode($text),76,"\r\n");
        $write($message."\r\n.",[250]);fwrite($s,"QUIT\r\n");
    }finally{fclose($s);}
}
