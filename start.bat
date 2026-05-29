@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

:: ============================================
:: AI Novel Studio Startup Script (Windows)
:: Prerequisites: Node.js + MySQL
:: ============================================

set ROOT_DIR=%~dp0
set BACKEND_DIR=%ROOT_DIR%backend
set FRONTEND_DIR=%ROOT_DIR%frontend

cls
echo.
echo   _____ _                   _ _              _
echo  ^/ ____^^^| ^|                 ^| ^| ^|            ^|_^|
echo ^| (___ ^| ^|_ __ _ _ ____   _^| ^| ^|_  ___ _ _ _ _ ____
echo  \___ \^^^| __/ _` ^| '__^| ^|/ _  ^|  __/ /__/ _` ^| '__^| ^|
echo  ____) ^| ^|^| (_^| ^| ^|  ^| ^| (_^| ^| ^|_ ^| ^| ^| (_^| ^| ^|  ^| ^|
echo ^|_____/ \__\__,_^|_^|  ^|_^| _ _/\___/^|^| ^|  \__,_^|_^|  ^|_^|
echo.
echo             ==== AI Powered Novel Creation ====
echo                   ==== by standtrain ====
echo.
echo ================================================================
echo                           Starting...
echo ================================================================
echo.

:: ---- Check Node.js ----
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)
echo [OK] Node.js found:
node -v
echo.

:: ---- Backend ----
echo [1/2] Starting backend...
cd /d "%BACKEND_DIR%"

if not exist "node_modules\" (
    echo       Installing backend dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Backend npm install failed.
        pause
        exit /b 1
    )
)

echo       Backend: http://localhost:3000
start "AI-Novel-Backend" /min cmd /c "cd /d "%BACKEND_DIR%" && npm run dev"

:: ---- Frontend ----
echo [2/2] Starting frontend...
cd /d "%FRONTEND_DIR%"

if not exist "node_modules\" (
    echo       Installing frontend dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend npm install failed.
        pause
        exit /b 1
    )
)

echo       Frontend: http://localhost:5173
start "AI-Novel-Frontend" /min cmd /c "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo ================================================================
echo   Startup complete!
echo.
echo   Backend API : http://localhost:3000
echo   Frontend App: http://localhost:5173
echo ================================================================
echo.
echo Close this window will NOT stop the services.
echo.
pause
