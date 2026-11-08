#!/bin/bash
# Switch the pet's look.
#   bash use-skin.sh star      → the 8-point pixel star
#   bash use-skin.sh default   → back to the built-in default look
# Whatever was in ~/.claude-pet/skin is moved to a dated _old-* folder, never deleted.
cd "$(dirname "$0")"
NAME="${1:-star}"
DEST="$HOME/.claude-pet/skin"
mkdir -p "$DEST"

if [ "$NAME" != "default" ] && [ ! -d "skins/$NAME" ]; then
  echo "❌ No such skin: $NAME (available: $(ls skins | tr '\n' ' ')default)"
  exit 1
fi

shopt -s nullglob
old=()
for f in "$DEST"/*; do [ -f "$f" ] && old+=("$f"); done
if [ ${#old[@]} -gt 0 ]; then
  bak="$DEST/_old-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$bak"
  mv "${old[@]}" "$bak/"
  echo "   Previous skin images moved to $bak"
fi

if [ "$NAME" = "default" ]; then
  echo "✅ Switched back to the default look"
else
  cp "skins/$NAME"/* "$DEST/"
  echo "✅ Switched to the \"$NAME\" skin (takes effect within 3 seconds)"
fi
