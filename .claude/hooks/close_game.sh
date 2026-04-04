#!/bin/bash
curl -s -X POST http://localhost:3000/stop \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"${CLAUDE_SESSION_ID}\"}" \
  > /dev/null 2>&1
exit 0
