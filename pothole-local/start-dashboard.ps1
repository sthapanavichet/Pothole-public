$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DashboardDir = Join-Path $Root "dashboard"

Set-Location $DashboardDir

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
}

if (-not (Test-Path "node_modules")) {
  npm install
}

npm run dev -- --host 0.0.0.0 --port 5173
