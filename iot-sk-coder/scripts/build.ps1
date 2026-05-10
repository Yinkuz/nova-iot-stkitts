# Build script for the IOT-SK-CODER Rust binary on Windows.
#
# Prerequisites:
#   1. Rust toolchain (https://rustup.rs/)
#   2. The rebranded `goose` source tree placed at .\goose-src\
#      (extracted from the company-provided iot-sk-coder source bundle).
#
# Usage (from the iot-sk-coder folder):
#   powershell -ExecutionPolicy Bypass -File scripts\build.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$src  = Join-Path $root "goose-src"

if (-not (Test-Path $src)) {
    Write-Host "ERROR: source tree not found at $src" -ForegroundColor Red
    Write-Host "Place the rebranded goose source under '$src' and re-run."
    exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: cargo not on PATH. Install via https://rustup.rs/" -ForegroundColor Red
    exit 1
}

Push-Location $src
try {
    Write-Host "Building IOT-SK-CODER (release) ..." -ForegroundColor Cyan
    cargo build --release --bin iot-sk-coder
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $exe = Join-Path $src "target\release\iot-sk-coder.exe"
    if (-not (Test-Path $exe)) {
        Write-Host "ERROR: build succeeded but binary not found at $exe" -ForegroundColor Red
        exit 1
    }

    Copy-Item $exe (Join-Path $root "iot-sk-coder.exe") -Force
    Write-Host "Built: $exe" -ForegroundColor Green
    Write-Host "Copied to: $(Join-Path $root 'iot-sk-coder.exe')" -ForegroundColor Green
} finally {
    Pop-Location
}
