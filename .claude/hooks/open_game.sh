#!/bin/bash
GAME_DIR="/Users/rushi/Desktop/cli_monkeytype"

# Start server if not already running
if ! curl -s --max-time 1 http://localhost:3000/health > /dev/null 2>&1; then
  node "$GAME_DIR/server.js" > /dev/null 2>&1 &
  sleep 0.6
fi

curl -s -X POST http://localhost:3000/start \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"${CLAUDE_SESSION_ID}\"}" \
  > /dev/null 2>&1
exit 0
