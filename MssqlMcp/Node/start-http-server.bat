@echo off
REM Start script for MSSQL MCP HTTP Server (Streamable HTTP) on Windows

echo ============================================================
echo MSSQL MCP Server - HTTP Server
echo ============================================================
echo.

REM Check if .env file exists
if not exist ".env" (
    echo [WARNING] .env file not found!
    echo Please copy .env.example to .env and configure your settings.
    echo.
    pause
    exit /b 1
)

REM Check if dist folder exists
if not exist "dist" (
    echo [ERROR] dist folder not found!
    echo Please run install-windows.bat first.
    echo.
    pause
    exit /b 1
)

REM Start the server
echo Starting HTTP server...
echo Press Ctrl+C to stop the server
echo.
node dist/http-server.js

pause
