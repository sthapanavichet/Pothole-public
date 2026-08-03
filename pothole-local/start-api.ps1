$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ApiDir = Join-Path $Root "api"

Set-Location $ApiDir

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.local.example" ".env.local"
  Write-Host "Created api/.env.local. Fill SUPABASE_URL and SUPABASE_SECRET_KEY before creating reports."
}

if (-not (Test-Path "node_modules")) {
  npm install
}

npm run dev -- -H 0.0.0.0 -p 3000
