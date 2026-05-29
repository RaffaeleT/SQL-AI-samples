@echo off
REM Uninstall MSSQL MCP Server Windows service

SET SERVICE_NAME=MssqlMcpServer

echo Stopping %SERVICE_NAME%...
nssm stop %SERVICE_NAME%

echo Removing %SERVICE_NAME%...
nssm remove %SERVICE_NAME% confirm

echo Service removed.
