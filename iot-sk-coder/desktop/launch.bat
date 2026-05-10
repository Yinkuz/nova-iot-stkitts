@echo off
:: Quick-launch for NOVA (run from the desktop/ folder).
:: For first-time setup use "Start NOVA.bat" at the repo root instead.
setlocal
cd /d "%~dp0"
set ISTKC_TEAM_TOKEN=ISTKC-2025-ELCZ7OSB
set PYTHONIOENCODING=utf-8
node_modules\.bin\electron.cmd .
endlocal
