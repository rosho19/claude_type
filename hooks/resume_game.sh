#!/bin/bash
# PreToolUse — Claude is working again after a permission gate; re-enable typing
[[ -f "$HOME/.config/monkeytype/enabled" ]] || exit 0
MONKEY=$(command -v monkeytype 2>/dev/null) || exit 0
"$MONKEY" event resume
exit 0
