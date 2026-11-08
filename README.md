# Starr · a Claude Code desktop pet

A little creature that floats on your desktop and reacts to your Claude Code sessions in real time:

| When Claude is… | Starr… |
|---|---|
| No sessions / idle for more than 10 minutes | Sleeps with eyes closed, floating Zzz |
| Session just opened / waiting for your next message | Stands by, breathing and blinking |
| Thinking (generating a reply) | Tilts its head, rubs its chin, shows a thought bubble |
| Using a tool | Types on a laptop and sweats; the bubble says what it's doing (running a command / writing code / reading files / browsing the web / sending a helper…) |
| **Needs you** (approve a permission / answer a question) | Jumps and waves with an exclamation mark; the bubble says what needs approval |
| Finished a turn | Bounces and cheers, with confetti |
| API error (rate limit, network, etc.) | Storm cloud and lightning overhead, looks dizzy |
| A tool failed but Claude keeps going | Frowns and sweats, recovers quickly |

With several sessions running, Starr shows the one that most needs your attention (needs you > error > done > working > thinking). The number in the top-right corner is how many sessions are busy; hover to see the list of all sessions.

![preview](preview.gif)

## Install (macOS)

Requires Node.js (`brew install node`). In Terminal:

```bash
cd path/to/claude-pet
bash install.sh
```

It will:
1. Copy `pet-hook.sh` to `~/.claude-pet/`
2. Add 12 hooks to `~/.claude/settings.json` (backs up the original first; your existing settings and hooks are left alone)
3. Download Electron (falls back to the npmmirror mirror if the official source fails)
4. Start Starr

After installing, **new** Claude Code sessions are picked up automatically; sessions that are already open need to be restarted once.

## Usage

- **Drag**: move it (the position is remembered)
- **Hover**: see the status of every session
- **Right-click**: preview animations, change size (Mini ≈ 57px / Small ≈ 79px / Medium ≈ 113px / Large ≈ 159px; bubble text always stays readable), toggle sound alerts, start at login, quit
- To start again later: double-click `start.command` (if an older Starr is still running, it is replaced automatically)

Clicking Starr does nothing — it never opens Claude or any other app.

## 8-point pixel star skin

Comes with an original 8-point pixel star skin, with its own frame-by-frame animation for every state (see `star-preview.gif`):

```bash
bash use-skin.sh star       # switch to the star
bash use-skin.sh default    # back to the default look
```

Whatever was in the skin folder is moved to an `_old-<date>` subfolder, never deleted.

## Custom skins (use your own images)

Put images in `~/.claude-pet/skin/`. **A single `idle.png` is enough** — every state uses it and animates it automatically:

| State | What the image does |
|---|---|
| Sleeping | Slow breathing, fades |
| Idle | Breathing |
| Thinking | Sways side to side |
| Working | Fast wobble + blue glow |
| Needs you | Orange glow + bouncing |
| Done | Green glow + somersault + confetti |
| Error | Greyed out + red glow + shaking |

The bubble, session list and count badge still show as usual. To give a state its own image, add another file named after the state (png / gif / webp; gifs animate):
`idle` `sleeping` `thinking` `working` `waiting` `done` `error` `oops`. Transparent-background PNGs look best.

```bash
cp ~/Downloads/your-image.png ~/.claude-pet/skin/idle.png
```

Changes take effect within 3 seconds, no restart needed. Delete the images in the skin folder to go back to the default look.

## Uninstall

```bash
bash uninstall.sh
```

Removes Starr's hooks from settings.json, stops the app, and deletes `~/.claude-pet`.

## How it works

Claude Code (the terminal CLI, IDE extensions, and the Code tab in the Claude desktop app) reads hooks from `~/.claude/settings.json`. On every event (prompt submitted, before/after a tool call, permission request, notification, stop, error…), `pet-hook.sh` writes that session's latest event to `~/.claude-pet/sessions/<session-id>.json` (takes about 30 ms, prints nothing, always exits 0, so it never gets in Claude's way). Starr reads these small files every 0.4 seconds and works out which expression to show.

Starr makes no network connections: it only reads and writes local files.

**What it can't see**: sessions that run in the cloud (for example Claude Code on claude.ai on the web, or Cowork cloud tasks) don't run on your machine, so the hooks never fire locally and Starr can't see them.

Known limitations: after you approve a permission, Starr stays in "needs you" until that tool finishes (Claude Code has no "approved" event). Pressing Esc to interrupt sends no stop event, so Starr recovers on the next event or after a timeout.
