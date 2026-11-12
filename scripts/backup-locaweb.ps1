param(
    [Parameter(Mandatory)][string]$Database,
    [Parameter(Mandatory)][string]$MySqlOptions,
    [Parameter(Mandatory)][string]$PrivateFiles,
    [Parameter(Mandatory)][string]$Destination,
    [string]$DumpProgram = 'mysqldump'
)
$ErrorActionPreference = 'Stop'
if ($Database -notmatch '^[a-zA-Z0-9_]+$') { throw 'Nome de banco inválido.' }
$options = (Resolve-Path -LiteralPath $MySqlOptions).Path
$files = (Resolve-Path -LiteralPath $PrivateFiles).Path
$destinationRoot = (Resolve-Path -LiteralPath $Destination).Path
$sourcePrefix = $files.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
$targetPrefix = $destinationRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
if ($targetPrefix.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Escolha um destino fora da pasta de anexos.' }
$bundle = Join-Path $destinationRoot ('nos-cuidamos-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $bundle | Out-Null
$sql = Join-Path $bundle 'database.sql'
$archive = Join-Path $bundle 'attachments.tar.gz'
& $DumpProgram "--defaults-extra-file=$options" --single-transaction --quick --hex-blob --no-tablespaces --skip-add-drop-table "--result-file=$sql" $Database
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $sql)) { throw 'Falha no backup MySQL. O conjunto está incompleto.' }
& tar -czf $archive -C $files .
if ($LASTEXITCODE -ne 0) { throw 'Falha no backup dos anexos. O conjunto está incompleto.' }
$manifest = [ordered]@{
    database = $Database
    createdAt = [DateTime]::UtcNow.ToString('o')
    databaseSha256 = (Get-FileHash -LiteralPath $sql -Algorithm SHA256).Hash
    attachmentsSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Encoding utf8
Write-Output "Backup concluído: $bundle"
