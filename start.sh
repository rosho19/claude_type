#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start server if not already running
if ! curl -s --max-time 1 http://localhost:3000/health > /dev/null 2>&1; then
  node "$SCRIPT_DIR/server.js" &
  sleep 0.5
fi

exec claude "$@"
