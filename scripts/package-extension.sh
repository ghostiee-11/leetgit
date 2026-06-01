#!/usr/bin/env bash
# Package the extension into a zip ready for the Chrome Web Store.
# Usage: bash scripts/package-extension.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/extension"
DIST="$ROOT/dist"

VERSION="$(node -e "console.log(require('$EXT/manifest.json').version)")"
OUT="$DIST/leetgit-extension-v$VERSION.zip"

mkdir -p "$DIST"
rm -f "$OUT"

# Ship only the runtime files. Exclude dev/build scripts and docs.
cd "$EXT"
zip -r -q "$OUT" . \
  -x "icons/generate_icons.py" \
  -x "icons/preview_variants.py" \
  -x "icons/previews/*" \
  -x "*.md" \
  -x ".*"

echo "Packaged: $OUT"
unzip -Z1 "$OUT" | sed 's/^/  /'
