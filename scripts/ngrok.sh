#!/usr/bin/env bash
# Buka tunnel ngrok ke app, dilindungi basic auth dari .env (NGROK_BASIC_AUTH=user:password).
# Default ke app production (auto-start) di 3999; dev server: bash scripts/ngrok.sh 3000
# App sudah punya login PIN (Fase 5); basic auth tetap lapis tambahan, jangan jalanin tunnel tanpa auth.
set -euo pipefail
cd "$(dirname "$0")/.."
port="${1:-3999}"
auth=$(grep -E '^NGROK_BASIC_AUTH=' .env | head -1 | cut -d= -f2-)
[ -n "$auth" ] || { echo "NGROK_BASIC_AUTH belum ada di .env" >&2; exit 1; }
exec ngrok http "127.0.0.1:$port" --basic-auth "$auth" --log stdout --log-format logfmt
