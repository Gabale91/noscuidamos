<?php
declare(strict_types=1);

function google_token_claims(string $token, array $certificates, string $client, string $nonce, int $now): array
{
    $invalid = static function (): never { throw new UnexpectedValueException('Identidade Google inválida.'); };
    $decode = static function (string $value) use ($invalid): string {
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $value)) $invalid();
        $bytes = base64_decode(strtr($value, '-_', '+/'), true);
        if ($bytes === false) $invalid();
        return $bytes;
    };
    $parts = explode('.', $token);
    if (count($parts) !== 3 || strlen($token) > 16384 || $nonce === '') $invalid();
    [$headerPart, $claimsPart, $signaturePart] = $parts;
    $header = json_decode($decode($headerPart), true, 16, JSON_THROW_ON_ERROR);
    $key = $header['kid'] ?? null;
    if (($header['alg'] ?? '') !== 'RS256' || isset($header['crit']) || !is_string($key) || !is_string($certificates[$key] ?? null)) $invalid();
    if (openssl_verify($headerPart.'.'.$claimsPart, $decode($signaturePart), $certificates[$key], OPENSSL_ALGO_SHA256) !== 1) $invalid();
    $claims = json_decode($decode($claimsPart), true, 16, JSON_THROW_ON_ERROR);
    if (!in_array($claims['iss'] ?? '', ['https://accounts.google.com','accounts.google.com'], true)
        || ($claims['aud'] ?? null) !== $client
        || (isset($claims['azp']) && $claims['azp'] !== $client)
        || !is_int($claims['exp'] ?? null) || $claims['exp'] <= $now
        || !is_int($claims['iat'] ?? null) || $claims['iat'] > $now + 60
        || !is_string($claims['nonce'] ?? null) || !hash_equals($nonce, $claims['nonce'])
        || !is_string($claims['sub'] ?? null) || $claims['sub'] === '' || strlen($claims['sub']) > 255
        || ($claims['email_verified'] ?? false) !== true
        || !filter_var($claims['email'] ?? '', FILTER_VALIDATE_EMAIL)) $invalid();
    return $claims;
}
