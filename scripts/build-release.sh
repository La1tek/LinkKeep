#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")"
OUT_DIR="$ROOT_DIR/dist/release-$VERSION"

mkdir -p "$OUT_DIR"
"$ROOT_DIR/scripts/sync-version.py"
(cd "$ROOT_DIR/frontend" && npm ci && npm run build)
"$ROOT_DIR/scripts/package-extension.sh"

cp "$ROOT_DIR/frontend/public/LinkKeep-extension-$VERSION.zip" "$OUT_DIR/"
cp "$ROOT_DIR/docker-compose.yml" "$OUT_DIR/"
cp "$ROOT_DIR/.env.example" "$OUT_DIR/"
printf '%s\n' "$VERSION" > "$OUT_DIR/VERSION"
echo "Release assets written to $OUT_DIR"
