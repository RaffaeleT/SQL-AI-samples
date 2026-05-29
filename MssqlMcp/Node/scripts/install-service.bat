@echo off
REM Install MSSQL MCP Server as a Windows service using NSSM
REM Prerequisites: NSSM must be installed and in PATH (https://nssm.cc/)
REM
REM IMPORTANT: For Windows Integrated Auth, configure the service to run
REM under a domain account with SQL Server access (not LocalSystem).
REM Use: nssm set MssqlMcpServer ObjectName DOMAIN\User Password

SET SERVICE_NAME=MssqlMcpServer
SET NODE_PATH=node
SET APP_PATH=%~dp0..\dist\http-server.js

echo Installing %SERVICE_NAME%...

nssm install %SERVICE_NAME% "%NODE_PATH%" "%APP_PATH%"
nssm set %SERVICE_NAME% AppDirectory %~dp0..
nssm set %SERVICE_NAME% Description "MSSQL MCP Server - HTTP/SSE transport for network access"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START

REM Create logs directory
if not exist "%~dp0..\logs" mkdir "%~dp0..\logs"
nssm set %SERVICE_NAME% AppStdout %~dp0..\logs\service.log
nssm set %SERVICE_NAME% AppStderr %~dp0..\logs\error.log
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateBytes 1048576

echo.
echo Service installed. Configure environment variables in .env file before starting.
echo Start with: nssm start %SERVICE_NAME%
echo.
echo Don't forget to open the firewall port:
echo   netsh advfirewall firewall add rule name="MCP SSE Server" dir=in action=allow protocol=tcp localport=3000
