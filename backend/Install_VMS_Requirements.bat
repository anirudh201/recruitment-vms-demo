@echo off
setlocal EnableExtensions
title Recruitment VMS - Dependency Installer

REM Expected layout: requirements.txt, backend\, frontend\package.json
REM This script does not delete project files or reset Git.

set "PROJECT_DIR=%~dp0"
set "REQ_FILE=%PROJECT_DIR%requirements.txt"
set "BACKEND_DIR=%PROJECT_DIR%backend"
set "FRONTEND_DIR=%PROJECT_DIR%frontend"
set "VENV_DIR=%PROJECT_DIR%.venv"

echo.
echo === Recruitment VMS Dependency Installer ===
echo Project folder: "%PROJECT_DIR%"
echo.

where py >nul 2>&1
if errorlevel 1 (
    where python >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python was not found. Install Python 3.11 or 3.12 and enable Add Python to PATH.
        goto :fail
    )
    set "PYTHON_CMD=python"
) else (
    set "PYTHON_CMD=py -3"
)

where npm >nul 2>&1
if errorlevel 1 (
    set "NPM_MISSING=1"
    echo WARNING: npm not found. Frontend install will be skipped.
    echo Install Node.js LTS from https://nodejs.org/ and rerun this file.
) else (
    set "NPM_MISSING=0"
)

if not exist "%REQ_FILE%" (
    echo ERROR: requirements.txt not found beside this BAT file.
    echo Put this BAT file in the project root beside requirements.txt.
    goto :fail
)

echo [1/5] Checking Python...
%PYTHON_CMD% --version
if errorlevel 1 goto :fail

echo.
echo [2/5] Creating or reusing .venv...
if not exist "%VENV_DIR%\Scripts\python.exe" (
    %PYTHON_CMD% -m venv "%VENV_DIR%"
    if errorlevel 1 goto :fail
) else (
    echo Existing .venv found; reusing it.
)

echo.
echo [3/5] Upgrading pip...
"%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :fail

echo.
echo [4/5] Installing Python requirements...
"%VENV_DIR%\Scripts\python.exe" -m pip install -r "%REQ_FILE%"
if errorlevel 1 (
    echo ERROR: Python dependency installation failed. Review the output above.
    goto :fail
)

echo.
echo [5/5] Installing frontend dependencies...
if "%NPM_MISSING%"=="1" (
    echo SKIPPED: npm is not installed.
) else if exist "%FRONTEND_DIR%\package.json" (
    pushd "%FRONTEND_DIR%"
    if exist "package-lock.json" (
        call npm ci
    ) else (
        call npm install
    )
    if errorlevel 1 (
        popd
        echo ERROR: Frontend dependency installation failed.
        goto :fail
    )
    popd
) else (
    echo SKIPPED: "%FRONTEND_DIR%\package.json" was not found.
)

echo.
echo === Dependency installation finished ===
echo Backend start command:
echo   cd /d "%BACKEND_DIR%"
echo   "%VENV_DIR%\Scripts\python.exe" -m uvicorn app.main:app --reload
echo.
echo Frontend start command (in a second terminal):
echo   cd /d "%FRONTEND_DIR%"
echo   npm run dev
echo.
echo Keep both terminals open. This script does not install or start PostgreSQL.
echo Check the backend .env/database configuration if the API cannot connect.
pause
exit /b 0

:fail
echo.
echo Installation stopped because of an error. No project source files were deleted.
pause
exit /b 1
