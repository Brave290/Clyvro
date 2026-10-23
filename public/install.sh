#!/bin/sh
# Clyvro CLI — Linux (Alpine, Arch, Debian, …), macOS, WSL, Termux.
#   curl -fsSL https://clyvro.vercel.app/install.sh | sh
# Windows:  irm https://clyvro.vercel.app/install.ps1 | iex
set -e
BASE="${CLYVRO_BASE:-https://clyvro.vercel.app}"
DEST="${CLYVRO_BIN:-$HOME/.local/bin}"

node_bin() {
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  if command -v nodejs >/dev/null 2>&1; then command -v nodejs; return; fi
  return 1
}

if ! node_bin >/dev/null; then
  echo "Clyvro needs Node.js 18+ (the clyvro command is a Node script)."
  if [ -f /etc/alpine-release ]; then
    echo "Alpine:   su -c 'apk add --no-cache nodejs'"
  elif [ -f /etc/arch-release ]; then
    echo "Arch:     sudo pacman -S --needed nodejs npm"
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Debian:   sudo apt-get install -y nodejs"
  elif command -v dnf >/dev/null 2>&1; then
    echo "Fedora:   sudo dnf install -y nodejs"
  elif command -v brew >/dev/null 2>&1; then
    echo "macOS:    brew install node"
  elif command -v pacman >/dev/null 2>&1; then
    echo "Install nodejs with your package manager, then re-run."
  else
    echo "Install Node from https://nodejs.org then re-run this script."
  fi
  echo "Or, if you already have npm:  npm i -g $BASE/cli/clyvro.tgz"
  exit 1
fi

mkdir -p "$DEST"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$BASE/cli/clyvro.mjs" -o "$DEST/clyvro"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$DEST/clyvro" "$BASE/cli/clyvro.mjs"
else
  echo "Need curl or wget to download the CLI."
  exit 1
fi
chmod +x "$DEST/clyvro"

# Prefer a PATH dir we can write, so `clyvro` works in a new shell.
IN_PATH=0
case ":$PATH:" in
  *":$DEST:"*) IN_PATH=1 ;;
esac
if [ "$IN_PATH" -eq 0 ] && [ -w /usr/local/bin ]; then
  ln -sf "$DEST/clyvro" /usr/local/bin/clyvro 2>/dev/null || cp "$DEST/clyvro" /usr/local/bin/clyvro
  echo "Also linked /usr/local/bin/clyvro"
fi
if [ "$IN_PATH" -eq 0 ] && [ ! -w /usr/local/bin ] && [ -d /usr/bin ] && [ -w /usr/bin ]; then
  ln -sf "$DEST/clyvro" /usr/bin/clyvro 2>/dev/null || true
fi

NODE="$(node_bin)"
echo "Installed $DEST/clyvro  (Node $($NODE -v 2>/dev/null || echo 18+))"
if command -v clyvro >/dev/null 2>&1; then
  echo "Ready. Run:  clyvro help"
  echo "Then:        clyvro login"
else
  echo "Add this to your shell profile (~/.profile, ~/.bashrc, ~/.zshrc):"
  echo "  export PATH=\"$DEST:\$PATH\""
  echo "Then open a new terminal, or run now:"
  echo "  $DEST/clyvro help"
  echo "  $DEST/clyvro login"
fi
