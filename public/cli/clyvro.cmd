@echo off
REM Windows launcher — put this next to clyvro.mjs, or install with:
REM   irm https://clyvro.vercel.app/install.ps1 | iex
setlocal
set "HERE=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Clyvro needs Node.js 18+. Install LTS from https://nodejs.org
  exit /b 1
)
node "%HERE%clyvro.mjs" %*
