@echo off
REM ══════════════════════════════════════════════════════════════════════════════
REM  IOT-ST-KITTS-CODE  —  Internal AI cowork assistant launcher
REM  IOT St. Kitts Engineering  ·  Not for public distribution
REM ══════════════════════════════════════════════════════════════════════════════
REM
REM  ADMIN SETUP:
REM    1. Set ISTKC_TEAM_TOKEN below to a secret known only to your team.
REM       Employees must enter this token on first use.  Change it to revoke
REM       access for everyone (they'll be prompted again on next launch).
REM    2. Distribute this .bat file — and ONLY this file — to authorised staff.
REM       The Python source tree is internal; the .bat is the "key".
REM
REM  If the Rust binary has been built (scripts\build.ps1), it is preferred.
REM  Otherwise the Python front-end runs immediately with no extra build step.
REM ══════════════════════════════════════════════════════════════════════════════

REM ── Admin: change this token before distributing to your team ────────────────
if not defined ISTKC_TEAM_TOKEN set "ISTKC_TEAM_TOKEN=ISTKC-2025-ELCZ7OSB"

REM ── UTF-8 so NOVA's box-drawing animation renders correctly ──────────────────
chcp 65001 >nul 2>nul

setlocal
set "HERE=%~dp0"

REM ── Prefer compiled Rust binary if available ──────────────────────────────────
if exist "%HERE%iot-st-kitts-code.exe" (
    "%HERE%iot-st-kitts-code.exe" %*
    exit /b %ERRORLEVEL%
)
if exist "%HERE%goose-src\target\release\iot-st-kitts-code.exe" (
    "%HERE%goose-src\target\release\iot-st-kitts-code.exe" %*
    exit /b %ERRORLEVEL%
)

REM ── Fallback: Python front-end (works with no build step) ────────────────────
where py >nul 2>nul
if %ERRORLEVEL%==0 (
    py -3 "%HERE%iot_sk_coder.py" %*
    exit /b %ERRORLEVEL%
)
python "%HERE%iot_sk_coder.py" %*
exit /b %ERRORLEVEL%
