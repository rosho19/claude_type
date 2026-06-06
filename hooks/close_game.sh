#!/bin/bash
# Stop — show done banner
[[ -f "$HOME/.config/monkeytype/enabled" ]] || exit 0
MONKEY=$(command -v monkeytype 2>/dev/null) || exit 0
"$MONKEY" event stop --session="${CLAUDE_CODE_SESSION_ID:-$CLAUDE_SESSION_ID}"
exit 0
