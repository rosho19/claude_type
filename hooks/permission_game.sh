#!/bin/bash
# PermissionRequest — dim game and disable input
[[ -f "$HOME/.config/monkeytype/enabled" ]] || exit 0
MONKEY=$(command -v monkeytype 2>/dev/null) || exit 0
"$MONKEY" event permission
exit 0
