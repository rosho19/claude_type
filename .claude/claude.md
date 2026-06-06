# monkeytype-overlay

## what this is
A typing game that opens in a browser while Claude Code is running.
Controlled via a local Express server on port 3000.
Claude Code hooks POST to the server to open/close/update the game.

## architecture
- game.html        — standalone typing game, connects via WebSocket
- server.js        — Express + ws server, manages game state
- .claude/hooks/   — shell scripts that curl the server
- .claude/settings.json — hook configuration

## game rules
- no timer — stats only start on first keypress
- 2-second idle resets stats and word line silently
- game never auto-closes — user controls close via button
- "claude done" banner appears on Stop event, stays until dismissed

## tech stack
- vanilla JS only, no build step, single game.html file
- Node/Express for the server, ws package for WebSocket
- shell scripts for hooks (bash + curl, no dependencies)

## code style
- no typescript, no frameworks, no bundlers
- comments only where logic is non-obvious
- all server endpoints return JSON
```

This file gets read on every session start and saves you dozens of tokens re-explaining architecture on each prompt.

---

## The prompts themselves, phase by phase

Write these as separate Claude Code sessions with `/clear` between each one. Each prompt is one self-contained unit of work.

**Phase 1 — game.html**
```
Build game.html: a self-contained Monkeytype clone.
- Dark bg #323437, JetBrains Mono font loaded from Google Fonts
- 200 common words pool, randomized 50-word line on load and on reset
- Correct chars: #e2b714, wrong chars: #ca4754 with underline, upcoming: #646669
- Stats (wpm, accuracy, word count) rendered below words — hidden until first keypress
- WPM = (correct chars / 5) / elapsed minutes since first keypress
- 2-second idle timer: if no keypress for 2000ms, silently reset stats to zero and
  generate a new word line. No animation on reset.
- WebSocket client: connects to ws://localhost:3000. Listens for messages:
  { type: "status", value: "working" | "done" | "permission" | "resume" }
  Renders a status banner at top based on value. Done banner has
  "keep typing" (dismiss) and "close" (window.close()) buttons.
  Permission banner dims the word area (opacity 0.3) and disables input.
- No close button visible unless status is "done"
- Close button calls window.close()
```

**Phase 2 — server.js**
```
Build server.js: Express + ws server on port 3000.

Endpoints:
POST /start     — if no WS client connected, open browser to game.html
                  (use 'open' package). Track session_id from request body.
                  Broadcast { type: "status", value: "working" }
POST /stop      — broadcast { type: "status", value: "done" }
                  do NOT close the browser. Update internal state only.
POST /activity  — debounced 500ms, broadcast { type: "activity", tool: req.body.tool }
POST /permission — broadcast { type: "status", value: "permission" }
POST /resume    — broadcast { type: "status", value: "working" }
POST /shutdown  — process.exit(0)
GET  /health    — return { ok: true }

WebSocket: track single client connection. On disconnect, clear client ref.
Only honor /stop from the session_id that sent the most recent /start.
Minimum display guard: if /stop arrives within 3s of /start, delay broadcast by
(3000 - elapsed)ms.

Dependencies: express, ws, open
```

**Phase 3 — hooks**
```
Create four shell scripts in .claude/hooks/ and the settings.json.

open_game.sh — curl POST /start with session_id=$CLAUDE_SESSION_ID
notify_tool.sh — read stdin JSON, extract tool_name, curl POST /activity
close_game.sh — curl POST /stop with session_id=$CLAUDE_SESSION_ID  
permission_game.sh — curl POST /permission
resume_game.sh — curl POST /resume
kill_server.sh — curl POST /shutdown

All scripts: silent (redirect output to /dev/null), exit 0 always.

settings.json hooks:
- UserPromptSubmit → open_game.sh
- PostToolUse (matcher: ".*") → notify_tool.sh (async: true)
- Stop → close_game.sh
- PermissionRequest → permission_game.sh
- PreToolUse (matcher: ".*") → resume_game.sh
- SessionEnd → kill_server.sh
```

**Phase 4 — startup script**
```
Create start.sh: checks if server is running (curl /health),
starts it in background if not (node server.js &), 
waits 500ms, then execs claude "$@"

Make it executable. Add a note in README: alias cc='bash start.sh'