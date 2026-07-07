#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")"
OUT_DIR="$ROOT_DIR/frontend/public"
LATEST="$OUT_DIR/LinkKeep-extension.zip"
VERSIONED="$OUT_DIR/LinkKeep-extension-$VERSION.zip"

mkdir -p "$OUT_DIR"
rm -f "$LATEST" "$VERSIONED"
cd "$ROOT_DIR/extension"
zip -r -X "$LATEST" . -x '*.DS_Store'
cp "$LATEST" "$VERSIONED"
echo "Packaged $LATEST and $VERSIONED"
