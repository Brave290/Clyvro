#!/bin/sh
# Clyvro CLI — not an Alpine/apt package.
#   curl -fsSL https://clyvro.vercel.app/install.sh | sh
set -e
BASE="${CLYVRO_BASE:-https://clyvro.vercel.app}"
DEST="${CLYVRO_BIN:-$HOME/.local/bin}"

if ! command -v node >/dev/null 2>&1; then
  echo "Clyvro needs Node.js 18+."
  echo "There is no 'apk add clyvro' / 'apt install clyvro' package — install Node first, then re-run this script."
  exit 1
fi

mkdir -p "$DEST"
curl -fsSL "$BASE/cli/clyvro.mjs" -o "$DEST/clyvro"
chmod +x "$DEST/clyvro"

# If ~/.local/bin is not on PATH, try a system location so `clyvro` just works.
IN_PATH=0
case ":$PATH:" in
  *":$DEST:"*) IN_PATH=1 ;;
esac

if [ "$IN_PATH" -eq 0 ] && [ -w /usr/local/bin ]; then
  ln -sf "$DEST/clyvro" /usr/local/bin/clyvro 2>/dev/null || cp "$DEST/clyvro" /usr/local/bin/clyvro
  echo "Also linked /usr/local/bin/clyvro"
fi

echo "Installed $DEST/clyvro"
if command -v clyvro >/dev/null 2>&1; then
  echo "Ready. Run:  clyvro login"
else
  echo "Add this to your shell profile, then open a new terminal:"
  echo "  export PATH=\"$DEST:\$PATH\""
  echo "Or run now:"
  echo "  $DEST/clyvro login"
fi
echo
echo "This is not apk/apt. The command is the file above."
