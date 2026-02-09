@echo off
REM Uninstall MSSQL MCP HTTP Server Windows Service

echo ============================================================
echo MSSQL MCP Server - Windows Service Uninstallation
echo ============================================================
echo.
echo This script will uninstall the MCP server Windows service.
echo.
pause

REM Check if running as administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] This script must be run as Administrator!
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Create service uninstallation script
echo [INFO] Creating uninstallation script...
(
echo const Service = require('node-windows'^).Service;
echo const path = require('path'^);
echo.
echo // Create a new service object
echo const svc = new Service({
echo   name: 'MSSQL MCP HTTP Server',
echo   script: path.join(__dirname, 'dist', 'http-server.js'^)
echo }^);
echo.
echo // Listen for the "uninstall" event
echo svc.on('uninstall', function(^) {
echo   console.log('Service uninstalled successfully!'^);
echo }^);
echo.
echo // Uninstall the service
echo svc.uninstall(^);
) > uninstall-service.js

REM Run the uninstallation script
echo [INFO] Uninstalling service...
node uninstall-service.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo Service uninstalled successfully!
    echo ============================================================
    echo.
) else (
    echo.
    echo [ERROR] Service uninstallation failed!
)

REM Cleanup
del uninstall-service.js

pause
