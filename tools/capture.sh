#!/bin/bash
# Renders the link-preview + email card images for one client invite.
#   tools/capture.sh <slug>
# Needs the local preview running: npx http-server on port 8860 from the repo root
# (Claude starts it as the "zaproszenia" preview). Re-run after any change to
# the photo, seal or text, then commit <slug>/img/.
set -e
cd "$(dirname "$0")/.."
SLUG="$1"; [ -n "$SLUG" ] && [ -f "$SLUG/invite.json" ] || { echo "usage: tools/capture.sh <slug>"; exit 1; }
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="${BASE:-http://localhost:8860}/$SLUG/"
curl -sf "$BASE" >/dev/null || { echo "✗ local preview not running at $BASE"; exit 1; }
mkdir -p "$SLUG/img"
LANGS=$(node -e 'const j=require("./'"$SLUG"'/invite.json");console.log((j.languages&&j.languages.length?j.languages:["pl","en"]).join(" "))')
FIRST=${LANGS%% *}
shot() { # name width height query
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=6000 --window-size="$2,$3" --screenshot="$SLUG/img/$1.png" "$BASE?$4" >/dev/null 2>&1
}
shot og 1200 630 "capture=og&lang=$FIRST"
shot card-front 640 1070 "capture=front&lang=$FIRST"
for L in pl en; do
  # the email function asks for card-back-<guest's language>; single-language invites get the same image twice
  if [[ " $LANGS " == *" $L "* ]]; then shot "card-back-$L" 640 1070 "capture=back&lang=$L"; else shot "card-back-$L" 640 1070 "capture=back&lang=$FIRST"; fi
done
for f in "$SLUG"/img/*.png; do sips -s format jpeg -s formatOptions 82 "$f" --out "${f%.png}.jpg" >/dev/null && rm "$f"; done
ls "$SLUG/img"
