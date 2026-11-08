#!/bin/bash
# Double-click to wake Starr (it keeps running after this window closes).
cd "$(dirname "$0")"
if [ ! -x node_modules/.bin/electron ]; then
  echo "Not installed yet. Run this in Terminal first: bash install.sh"
  exit 1
fi
nohup ./node_modules/.bin/electron . >/dev/null 2>&1 &
disown
echo "Starr is awake (bottom-right of your screen). You can close this window."
