#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
HOST="http://localhost:${PORT}/api/chat"

echo "=== 1. Testing simple Hi/Hello message ==="
curl -N -X POST "${HOST}" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, introduce yourself briefly."}'

echo -e "\n\n=== 2. Testing tool calling (Genset Recommendation) ==="
curl -N -X POST "${HOST}" \
  -H "Content-Type: application/json" \
  -d '{"message": "We need an emergency backup generator of 250 kVA for a private clinic."}'
echo -e "\n"
