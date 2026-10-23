# clyvro

CLI and MCP server for [Clyvro](https://clyvro.vercel.app). Runs on Alpine, Arch, Debian, macOS, Windows, and WSL — anywhere Node.js 18+ exists.

## Install

```sh
# Linux / macOS / WSL / Termux
curl -fsSL https://clyvro.vercel.app/install.sh | sh

# Alpine
apk add --no-cache nodejs
wget -qO- https://clyvro.vercel.app/install.sh | sh

# Arch
sudo pacman -S --needed nodejs
curl -fsSL https://clyvro.vercel.app/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://clyvro.vercel.app/install.ps1 | iex
```

Any OS with npm:

```sh
npm i -g https://clyvro.vercel.app/cli/clyvro.tgz
```

Then:

```sh
clyvro help
clyvro login
```

## Commands

`clyvro help` prints the full list. Highlights:

```sh
clyvro scan https://your-site.com --consent
clyvro pentest https://your-site.com --consent
clyvro flow https://your-site.com --consent
clyvro review .
clyvro ssl https://your-site.com --consent
clyvro mcp
```

`--consent` means you own the site or have the owner's permission.

A TTY shows live progress. JSON still goes to stdout for pipes and agents.
