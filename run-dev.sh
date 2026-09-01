#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="/home/violes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

cd "$PROJECT_DIR"
exec "$NODE_BIN" node_modules/vite/bin/vite.js
