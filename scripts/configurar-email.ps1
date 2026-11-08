$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectDirectory '.env'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Arquivo de configuração não encontrado.' }
Write-Host 'Configurar envio: noscuidamos@gabale.com.br (Locaweb)'
$securePassword = Read-Host 'Digite a senha deste e-mail (ela ficará oculta)' -AsSecureString
if ($securePassword.Length -eq 0) { throw 'A senha não pode ficar vazia.' }
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $encodedPassword = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plainPassword))
  $content = [IO.File]::ReadAllText($configPath)
  $content = [regex]::Replace($content, '(?m)^SMTP_PASSWORD=.*\r?\n?', '')
  if ($content -match '(?m)^SMTP_PASSWORD_B64=') { $content = [regex]::Replace($content, '(?m)^SMTP_PASSWORD_B64=.*$', 'SMTP_PASSWORD_B64=' + $encodedPassword) }
  else { $content += "`nSMTP_PASSWORD_B64=$encodedPassword`n" }
  [IO.File]::WriteAllText($configPath, $content, (New-Object Text.UTF8Encoding($false)))
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $plainPassword = $null
  $encodedPassword = $null
  $securePassword.Dispose()
}
Write-Host 'Senha salva somente na configuração local. Nenhuma mensagem foi enviada.'
Write-Host 'Volte ao chat e avise que concluiu, para verificarmos a conexão.'
