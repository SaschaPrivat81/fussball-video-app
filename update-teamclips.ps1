param(
  [switch]$ReloadNginx,
  [string]$NginxPath = "C:\nginx-1.29.6\nginx.exe"
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $ProjectDir

Write-Host "Updating Teamclips in $ProjectDir"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git ist nicht installiert oder nicht im PATH."
}

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  throw "PM2 ist nicht installiert oder nicht im PATH."
}

if (-not (Test-Path (Join-Path $ProjectDir ".git"))) {
  throw "Dieser Ordner ist kein Git-Checkout. Bitte C:\sites\teamclips einmal per git clone einrichten."
}

if (-not (Test-Path (Join-Path $ProjectDir "data"))) {
  Write-Warning "Der data-Ordner fehlt. Produktive Benutzer/Videolisten liegen normalerweise dort."
}

if (-not (Test-Path (Join-Path $ProjectDir "storage"))) {
  Write-Warning "Der storage-Ordner fehlt. Produktive Videos/Vorschaubilder liegen normalerweise dort."
}

git pull --ff-only

pm2 startOrReload ecosystem.config.cjs --only teamclips --update-env
pm2 save

if ($ReloadNginx) {
  if (-not (Test-Path $NginxPath)) {
    throw "nginx.exe wurde nicht gefunden: $NginxPath"
  }

  $NginxDir = Split-Path -Parent $NginxPath
  Push-Location $NginxDir
  try {
    & $NginxPath -t
    & $NginxPath -s reload
  } finally {
    Pop-Location
  }
}

$health = curl.exe -s http://127.0.0.1:5300/api/me
Write-Host "Health check: $health"

if ($health -notmatch '"user"') {
  throw "Health check fehlgeschlagen."
}

Write-Host "Teamclips update fertig."
