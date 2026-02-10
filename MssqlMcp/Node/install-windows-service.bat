@echo off
REM Install MSSQL MCP HTTP Server as Windows Service

echo ============================================================
echo MSSQL MCP Server - Windows Service Installation
echo ============================================================
echo.
echo This script will install the MCP server as a Windows service.
echo The service will start automatically on system boot.
echo.
echo Prerequisites:
echo    - install-windows.bat must be run successfully first
echo    - Node.js must be installed
echo    - Run this script as Administrator
echo.
echo Checking prerequisites...
pause

REM Check if running as administrator
echo [CHECK] Verifying administrator privileges...
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] This script must be run as Administrator!
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)
echo [OK] Running as administrator

REM Check if dist folder exists
echo [CHECK] Verifying project build...
if not exist "dist\http-server.js" (
    echo [ERROR] Project not built! dist\http-server.js not found.
    echo Please run install-windows.bat first to build the project.
    pause
    exit /b 1
)
echo [OK] Project build found

REM Install node-windows locally if not present
echo.
echo [CHECK] Verifying node-windows installation...
if not exist "node_modules\node-windows" (
    echo [WARNING] node-windows not found. Installing now...
    call npm install node-windows --save-dev
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install node-windows!
        echo Please check your internet connection and npm configuration.
        pause
        exit /b 1
    )
    echo [OK] node-windows installed successfully
) else (
    echo [OK] node-windows already installed
)
echo.

REM Create service installation script
echo [STEP 1/2] Creating service configuration...
(
echo const Service = require('node-windows'^).Service;
echo const path = require('path'^);
echo.
echo // Create a new service object
echo const svc = new Service({
echo   name: 'MSSQL MCP HTTP Server',
echo   description: 'Streamable HTTP wrapper for MSSQL MCP Server',
echo   script: path.join(__dirname, 'dist', 'http-server.js'^),
echo   nodeOptions: [],
echo   env: [{
echo     name: "NODE_ENV",
echo     value: "production"
echo   }]
echo }^);
echo.
echo // Listen for the "install" event
echo svc.on('install', function(^) {
echo   console.log('Service installed successfully!'^);
echo   svc.start(^);
echo }^);
echo.
echo // Listen for the "start" event
echo svc.on('start', function(^) {
echo   console.log('Service started successfully!'^);
echo   console.log('The service is now running.'^);
echo }^);
echo.
echo // Install the service
echo svc.install(^);
) > install-service.cjs

REM Run the installation script
echo [STEP 2/2] Installing Windows service...
echo.
node install-service.cjs
echo.

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo Service installed successfully!
    echo ============================================================
    echo.
    echo The service is now running and will start automatically on boot.
    echo.
    echo To manage the service:
    echo   - Open Services (services.msc^)
    echo   - Find "MSSQL MCP HTTP Server"
    echo   - Right-click to Start/Stop/Restart
    echo.
) else (
    echo.
    echo [ERROR] Service installation failed!
)

REM Cleanup
del install-service.cjs

pause
