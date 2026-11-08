#!/bin/bash
# Remove Starr's hooks, stop the pet, and delete its data.
cd "$(dirname "$0")"

node scripts/hooks.js uninstall

if [ -f "$HOME/.claude-pet/pet.pid" ]; then
  kill "$(cat "$HOME/.claude-pet/pet.pid")" 2>/dev/null && echo "✅ Starr has clocked out"
fi
rm -f "$HOME/Library/LaunchAgents/com.local.claude-pet.plist"
rm -rf "$HOME/.claude-pet"
echo "✅ Uninstalled. You can delete this folder itself."
