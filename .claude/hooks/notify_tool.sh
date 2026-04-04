#!/bin/bash
input=$(cat)
tool=$(echo "$input" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -X POST http://localhost:3000/activity \
  -H 'Content-Type: application/json' \
  -d "{\"tool\":\"${tool}\"}" \
  > /dev/null 2>&1
exit 0
