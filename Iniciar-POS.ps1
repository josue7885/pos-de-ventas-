$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instala Node.js 22.12 o posterior y vuelve a abrir PowerShell.' }
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22 || (a===22 && b<12)) process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Se requiere Node.js 22.12 o posterior.' }
if (-not (Test-Path '.\server\node_modules\express')) {
  npm run setup:server
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias del servidor.' }
}
$dataDir = if ($env:POS_DATA_DIR) { $env:POS_DATA_DIR } else { Join-Path $PSScriptRoot 'server' }
$previousPin = $env:POS_ADMIN_PIN
try {
  if (-not (Test-Path (Join-Path $dataDir 'pos.db'))) {
    $securePin = Read-Host 'Define el PIN inicial del administrador (6 a 12 digitos)' -AsSecureString
    $pinPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePin)
    try { $env:POS_ADMIN_PIN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pinPtr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pinPtr) }
    if ($env:POS_ADMIN_PIN -notmatch '^\d{6,12}$') { throw 'PIN invalido: usa de 6 a 12 digitos.' }
  }
  Write-Host 'Abre http://localhost:3000. Para detener: Ctrl+C.'
  npm start
} finally {
  $env:POS_ADMIN_PIN = $previousPin
}
