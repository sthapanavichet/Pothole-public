$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

Set-Location $BackendDir

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

if (-not (Test-Path $VenvPython)) {
  python -m venv .venv
  & $VenvPython -m pip install --upgrade pip
  & $VenvPython -m pip install -r requirements.txt
}

& $VenvPython -m streamlit run main.py --server.address=0.0.0.0 --server.port=8501 --server.headless=true
