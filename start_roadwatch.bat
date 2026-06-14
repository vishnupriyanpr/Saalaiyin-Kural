@echo off
REM ============================================================================
REM  Saalaiyin Kural - one-click launcher (default entry point for the whole project)
REM  Brings up: Docker (Postgres/Redis/n8n) -> Express API + WebSocket ->
REM  smart-routing worker -> ML server -> Next.js frontend.
REM
REM  Usage:
REM    start_roadwatch.bat            start everything
REM    start_roadwatch.bat -Seed      also re-seed the database
REM    start_roadwatch.bat -Migrate   also run knex migrations
REM ============================================================================

title Saalaiyin Kural - Starting All Services
cls

REM (The tricolour SAALAIYIN KURAL block banner is rendered by start_roadwatch.ps1.)

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start_roadwatch.ps1" %*
pause
