#!/bin/bash
# UserPromptSubmit — start/show the overlay if enabled
[[ -f "$HOME/.config/monkeytype/enabled" ]] || exit 0

MONKEY=$(command -v monkeytype 2>/dev/null) || exit 0

# Start Electron if the server isn't up yet
if ! curl -sf --max-time 1 http://localhost:3000/health > /dev/null 2>&1; then
  "$MONKEY" launch
  # Poll until ready (max 3s)
  for i in $(seq 1 12); do
    sleep 0.25
    curl -sf --max-time 0.5 http://localhost:3000/health > /dev/null 2>&1 && break
  done
fi

"$MONKEY" event start --session="${CLAUDE_SESSION_ID}"
exit 0
