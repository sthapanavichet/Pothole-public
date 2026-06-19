param(
    [string]$TexFile = "submission/project_integration_submission.tex",
    [string]$OutputDir = "submission"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not (Test-Path $TexFile)) {
    throw "TeX source not found: $TexFile"
}

$pdflatex = (Get-Command pdflatex -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)

if (-not $pdflatex) {
    $candidate = Join-Path $env:LOCALAPPDATA "Programs\MiKTeX\miktex\bin\x64\pdflatex.exe"
    if (Test-Path $candidate) {
        $pdflatex = $candidate
    }
}

if (-not $pdflatex) {
    throw "pdflatex not found. Install MiKTeX first or add pdflatex to PATH."
}

Write-Host "Using pdflatex:" $pdflatex

& $pdflatex -interaction=nonstopmode -output-directory $OutputDir $TexFile | Out-Host
if ($LASTEXITCODE -ne 0) { throw "First LaTeX pass failed." }

& $pdflatex -interaction=nonstopmode -output-directory $OutputDir $TexFile | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Second LaTeX pass failed." }

$pdfOut = Join-Path $repoRoot "submission/project_integration_submission.pdf"
if (Test-Path $pdfOut) {
    Write-Host "PDF generated:" $pdfOut
} else {
    throw "Build finished but PDF not found at expected path: $pdfOut"
}
