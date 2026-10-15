#!/usr/bin/env bash
# Buka tunnel ngrok ke localhost:3000, dilindungi basic auth dari .env (NGROK_BASIC_AUTH=user:password).
# App belum punya login PIN (Fase 5), jadi jangan pernah jalanin tunnel tanpa auth.
set -euo pipefail
cd "$(dirname "$0")/.."
auth=$(grep -E '^NGROK_BASIC_AUTH=' .env | head -1 | cut -d= -f2-)
[ -n "$auth" ] || { echo "NGROK_BASIC_AUTH belum ada di .env" >&2; exit 1; }
exec ngrok http 3000 --basic-auth "$auth" --log stdout --log-format logfmt
