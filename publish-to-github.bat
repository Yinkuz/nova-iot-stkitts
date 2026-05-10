@echo off
setlocal enabledelayedexpansion
title NOVA — Publish to GitHub

set "GH=C:\Program Files\GitHub CLI\gh.exe"
set "ROOT=%~dp0"
set "REPO=nova-iot-stkitts"

echo.
echo   NOVA  ^|  Publish to GitHub
echo   ────────────────────────────
echo.

:: ── 1. Authenticate GitHub CLI ─────────────────────────────────────────────
"%GH%" auth status >nul 2>&1
if errorlevel 1 (
    echo  Logging into GitHub — a browser window will open.
    echo  Sign in with the Yinkuz account, then return here.
    echo.
    "%GH%" auth login --hostname github.com --git-protocol https --web
    if errorlevel 1 (
        echo  [ERROR] GitHub login failed. Run manually: gh auth login
        pause & exit /b 1
    )
)
echo  [OK] GitHub authenticated.

:: ── 2. Create private repo (skip if already exists) ────────────────────────
"%GH%" repo view Yinkuz/%REPO% >nul 2>&1
if errorlevel 1 (
    echo  Creating private repo: Yinkuz/%REPO%...
    "%GH%" repo create %REPO% --private --description "NOVA — IOT St. Kitts internal AI assistant" --confirm 2>nul
    if errorlevel 1 (
        "%GH%" repo create Yinkuz/%REPO% --private --description "NOVA — IOT St. Kitts internal AI assistant"
    )
    echo  [OK] Repo created.
) else (
    echo  [OK] Repo already exists.
)

:: ── 3. Add remote and push ─────────────────────────────────────────────────
cd /d "%ROOT%"
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin https://github.com/Yinkuz/%REPO%.git
)
echo  Pushing code to GitHub...
git push -u origin master
if errorlevel 1 (
    echo  [ERROR] Push failed. Check your connection and permissions.
    pause & exit /b 1
)
echo  [OK] Code pushed.

:: ── 4. Upload .exe as GitHub Release ───────────────────────────────────────
echo  Looking for installer .exe...
for /r "%ROOT%iot-sk-coder\desktop\dist" %%f in (*.exe) do (
    if not "%%~nf"=="*Uninstaller*" (
        set "EXE_PATH=%%f"
        set "EXE_NAME=%%~nxf"
    )
)

if defined EXE_PATH (
    echo  Creating GitHub Release v1.0.0 and uploading: !EXE_NAME!
    "%GH%" release create v1.0.0 "!EXE_PATH!" ^
        --title "NOVA v1.0.0" ^
        --notes "## NOVA v1.0.0 — Windows Installer^^

**Requirements before installing:**^^
- Windows 10/11 (64-bit)^^
- Python 3.8+ — https://www.python.org/downloads/ (tick 'Add Python to PATH')^^
- Node.js 18+ — https://nodejs.org/ (optional — only needed if building from source)^^

**Install:**^^
1. Download NOVA-Setup-1.0.0.exe and run it^^
2. Python packages install automatically during setup^^
3. Launch from the NOVA desktop shortcut^^

**For IT Admin:** set the ISTKC_TEAM_TOKEN environment variable or distribute it to users." ^
        --repo Yinkuz/%REPO%
    echo  [OK] Release uploaded: https://github.com/Yinkuz/%REPO%/releases/latest
) else (
    echo  [WARN] .exe not found in dist/ — run 'npm run dist' in desktop/ first, then re-run this script.
)

echo.
echo   Done! Repo: https://github.com/Yinkuz/%REPO%
echo.
pause
