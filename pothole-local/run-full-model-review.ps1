$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"

Set-Location $BackendDir

if (!(Test-Path $Python)) {
  python -m venv .venv
  & $Python -m pip install --upgrade pip
  & $Python -m pip install -r requirements.txt
}

& $Python ".\full_model_review.py" @args
