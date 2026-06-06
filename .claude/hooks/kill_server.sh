#!/bin/bash
# SessionEnd — shut down the overlay
[[ -f "$HOME/.config/monkeytype/enabled" ]] || exit 0
MONKEY=$(command -v monkeytype 2>/dev/null) || exit 0
"$MONKEY" event shutdown
exit 0
