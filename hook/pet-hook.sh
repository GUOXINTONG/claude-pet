#!/bin/bash
# Starr (Claude Pet) hook
# Records the latest Claude Code event of each session into ~/.claude-pet/sessions/<id>.json
# so the desktop pet can react. It must never get in Claude Code's way:
# it prints nothing and always exits 0.

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
EVENT="${1:-}"
DIR="$HOME/.claude-pet/sessions"
# The fields we need sit at the start of the JSON; skip scanning huge tool outputs.
payload="$(head -c 65536 2>/dev/null)"
cat >/dev/null 2>&1

# Extract a top-level string field from the JSON payload (first occurrence).
field() {
  printf '%s' "$payload" \
    | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" 2>/dev/null \
    | head -n 1 \
    | sed -E 's/^"[^"]*"[[:space:]]*:[[:space:]]*"//; s/"$//; s/\\+$//'
}

[ -z "$EVENT" ] && EVENT="$(field hook_event_name)"
SID="$(field session_id | tr -cd 'A-Za-z0-9_.-')"
[ -z "$SID" ] && exit 0
mkdir -p "$DIR" 2>/dev/null || exit 0
FILE="$DIR/$SID.json"
NT=""

case "$EVENT" in
  SessionEnd)
    rm -f "$FILE" 2>/dev/null
    exit 0
    ;;
  Notification)
    NT="$(field notification_type | tr -cd 'a-z_')"
    if [ -z "$NT" ]; then
      MSG="$(field message)"
      case "$MSG" in
        *ermission*) NT="permission_prompt" ;;
        *aiting*)    NT="idle_prompt" ;;
      esac
    fi
    case "$NT" in
      permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input)
        EVENT="NeedsInput" ;;
      idle_prompt)
        # Don't let "idle" hide a pending permission request.
        if grep -q '"event":"\(PermissionRequest\|NeedsInput\)"' "$FILE" 2>/dev/null; then exit 0; fi
        EVENT="Idle" ;;
      *)
        exit 0 ;;
    esac
    ;;
esac

TOOL="$(field tool_name | tr -cd 'A-Za-z0-9_.:-')"
CWD="$(field cwd)"
ERR="$(field error_type)"
[ -z "$ERR" ] && ERR="$(field error)"
ERR="$(printf '%s' "$ERR" | tr -cd 'A-Za-z0-9_ -' | cut -c1-40)"
TS="$(date +%s)"

TMP="$FILE.$$.tmp"
printf '{"event":"%s","tool":"%s","cwd":"%s","ntype":"%s","err":"%s","ts":%s}\n' \
  "$EVENT" "$TOOL" "$CWD" "$NT" "$ERR" "$TS" > "$TMP" 2>/dev/null \
  && mv -f "$TMP" "$FILE" 2>/dev/null
rm -f "$TMP" 2>/dev/null
exit 0
