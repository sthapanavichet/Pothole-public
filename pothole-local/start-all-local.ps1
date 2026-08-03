$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$Root\start-api.ps1`""
)

Start-Sleep -Seconds 3

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$Root\start-dashboard.ps1`""
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$Root\start-backend.ps1`""
)

Write-Host "Starting local services:"
Write-Host "API:       http://192.168.137.1:3000"
Write-Host "Dashboard: http://192.168.137.1:5173"
Write-Host "Streamlit: http://192.168.137.1:8501"


