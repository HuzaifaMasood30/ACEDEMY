#!/usr/bin/env bash
# Runs on every codespace start: bring the dev server up in the background.
set -uo pipefail

cd "$(dirname "$0")/.."

# Nothing to do if the server is already listening.
if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
  echo "→ Dev server already running on :3000"
  exit 0
fi

echo "→ Starting Academy ERP on :3000"
nohup npm run dev > /tmp/academy-dev.log 2>&1 &
echo "   logging to /tmp/academy-dev.log"
