#!/usr/bin/env bash
# Clip: Couchfriends (phone-as-controller party games), https://couchfriends.com
# A montage of four Couchfriends games, from the game images on couchfriends.com/games.html: a 60fps
# pan and crossfade over each (scripts/screenshots-clip.sh), looping back to the first.
#
#   scripts/clips/couchfriends.sh [images/couchfriends.webp]
#
# The images have mixed aspect ratios, and screenshots-clip.sh expects 16:9, so each is centre-cropped
# to 16:9 and scaled to 1920x1080 first.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$here/../images/couchfriends.webp}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

GAMES=(
  asteroid-classic-browser-multiplayer.png
  breakout-browser-multiplayer.png
  drakonas-three-js-3d-shoot-em-up.png
  bombergirl.jpg
)
srcs=()
for i in "${!GAMES[@]}"; do
  curl -fsSL "https://couchfriends.com/src/images/games/${GAMES[$i]}" -o "$tmp/src-$i"
  ffmpeg -hide_banner -loglevel error -nostdin -y -i "$tmp/src-$i" \
    -vf "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=1920:1080:flags=lanczos" -frames:v 1 "$tmp/$i.png"
  srcs+=("$tmp/$i.png")
done
# 4 images x 1.5 s, 0.4 s crossfades: 4.4 s loop.
SEG=${SEG:-1.5} FADE=${FADE:-0.4} ZOOM=${ZOOM:-1.15} FOCUS_Y=${FOCUS_Y:-0.5} \
  "$here/screenshots-clip.sh" "$out" "${srcs[@]}"
