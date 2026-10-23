#!/bin/sh
# Clyvro CLI — download and run:  curl -fsSL https://clyvro.vercel.app/install.sh | sh
set -e
BASE="${CLYVRO_BASE:-https://clyvro.vercel.app}"
DEST="${CLYVRO_BIN:-$HOME/.local/bin}"
mkdir -p "$DEST"
curl -fsSL "$BASE/cli/clyvro.mjs" -o "$DEST/clyvro"
chmod +x "$DEST/clyvro"
echo "Installed $DEST/clyvro"
echo "Run:  clyvro login"
echo "If that is not found, add $DEST to your PATH."
