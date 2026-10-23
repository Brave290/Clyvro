# Clyvro CLI for Windows (PowerShell 5+).
#   irm https://clyvro.vercel.app/install.ps1 | iex
$ErrorActionPreference = "Stop"
$Base = if ($env:CLYVRO_BASE) { $env:CLYVRO_BASE.TrimEnd("/") } else { "https://clyvro.vercel.app" }
$Dest = if ($env:CLYVRO_BIN) { $env:CLYVRO_BIN } else { Join-Path $env:LOCALAPPDATA "Clyvro" }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Clyvro needs Node.js 18+."
  Write-Host "Install it from https://nodejs.org (LTS), reopen this window, then re-run:"
  Write-Host "  irm $Base/install.ps1 | iex"
  Write-Host "Or with npm:  npm i -g $Base/cli/clyvro.tgz"
  exit 1
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$mjs = Join-Path $Dest "clyvro.mjs"
$cmd = Join-Path $Dest "clyvro.cmd"
Invoke-WebRequest -UseBasicParsing -Uri "$Base/cli/clyvro.mjs" -OutFile $mjs
@"
@echo off
node "$mjs" %*
"@ | Set-Content -Encoding ASCII $cmd

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
if ($userPath -notlike "*$Dest*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$Dest", "User")
  $env:Path = "$Dest;$env:Path"
  Write-Host "Added $Dest to your user PATH."
}

Write-Host "Installed $cmd"
Write-Host "Open a new terminal, then:  clyvro help"
Write-Host "Then:  clyvro login"
