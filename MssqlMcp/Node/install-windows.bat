@echo off
REM Installation script for MSSQL MCP HTTP Server on Windows

echo ============================================================
echo MSSQL MCP Server - Windows Installation
echo
echo This script will set up the MCP server for Windows.
echo It will install necessary dependencies and build the project.
echo It must be ran before launching install-windows-service.bat 
echo 
echo ============================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Node.js detected:
node --version
echo.

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed!
    pause
    exit /b 1
)

echo [2/4] npm detected:
npm --version
echo.

REM Install dependencies
echo [3/4] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b 1
)
echo.

REM Install node-windows for service installation
echo [3.5/4] Installing node-windows for Windows service...
call npm install node-windows --save-dev
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Failed to install node-windows. Service installation may not work.
    echo You can install it later by running: npm install node-windows --save-dev
)
echo.

REM Build the project
echo [4/4] Building the project...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to build the project!
    pause
    exit /b 1
)
echo.

echo ============================================================
echo Installation completed successfully!
echo ============================================================
echo.
echo Next steps:
echo   1. Copy .env.example to .env
echo   2. Configure your database settings in .env
echo   3. Run start-http-server.bat to start the HTTP server
echo   4. (Optional) Run create-service-installation-script.bat as Administrator
echo      to install the server as a Windows service
echo.
pause
