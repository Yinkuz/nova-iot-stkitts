@echo off
setlocal enabledelayedexpansion
title NOVA — IOT St. Kitts AI Assistant

set "ROOT=%~dp0"
set "APP_DIR=%ROOT%iot-sk-coder\desktop"

echo.
echo   IOT-ST-KITTS-CODE  ^|  NOVA
echo   Internal AI Cowork Assistant
echo   ─────────────────────────────────
echo.

:: ── 1. Check Python ───────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found. Install Python 3.8+ and add it to PATH.
    echo  Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: ── 2. Check Node.js ──────────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install Node.js 18+ and add it to PATH.
    echo  Download: https://nodejs.org/
    pause
    exit /b 1
)

:: ── 3. Kill stale bridge process on port 7823 ─────────────────────────────
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":7823 " ^| findstr "LISTENING"') do (
    if not "%%p"=="0" (
        taskkill /PID %%p /F >nul 2>&1
    )
)

:: ── 4. Install / update Python bridge dependencies ────────────────────────
python -c "import ddgs" 2>nul
if errorlevel 1 (
    echo  Installing ddgs ^(web search^)...
    pip install ddgs --quiet
)
python -c "import bs4" 2>nul
if errorlevel 1 (
    echo  Installing beautifulsoup4 ^(HTML parser^)...
    pip install beautifulsoup4 --quiet
)

:: ── 5. Install Node dependencies if missing ───────────────────────────────
if not exist "%APP_DIR%\node_modules\electron" (
    echo  Installing Node.js dependencies ^(first run only^)...
    pushd "%APP_DIR%"
    call npm install --silent 2>nul
    popd
)

:: ── 6. Create desktop shortcut (first run only) ─────────────────────────────
set "SHORTCUT=%USERPROFILE%\Desktop\NOVA.lnk"
if not exist "%SHORTCUT%" (
    powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath='%~f0'; $s.WorkingDirectory='%ROOT%'; $s.Description='NOVA — IOT St. Kitts AI Assistant'; $s.Save()" >nul 2>&1
    if exist "%SHORTCUT%" echo  [OK] Desktop shortcut created.
)

:: ── 7. Launch NOVA ────────────────────────────────────────────────────────
echo  Launching NOVA...
echo.
set ISTKC_TEAM_TOKEN=ISTKC-2025-ELCZ7OSB
set PYTHONIOENCODING=utf-8
cd /d "%APP_DIR%"
node_modules\.bin\electron.cmd .

endlocal
