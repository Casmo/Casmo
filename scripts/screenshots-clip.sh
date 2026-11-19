#!/usr/bin/env bash
# Build a Clip (ADR 0001) from still screenshots: a slow 60fps pan over each image, crossfading
# into the next, and the last one crossfading back into the first (seamless loop). Encoded with
# scripts/encode-clip.sh.
#
#   scripts/screenshots-clip.sh <out.webp> <image|gh:OWNER/REPO/PATH> [more images...]
#
# A gh: source is downloaded with `gh api` (works for private repos the gh login can read), so the
# screenshots never have to be committed here. Example (Bonk!, from its game repo's steam/screenshots):
#   scripts/screenshots-clip.sh images/bonk.webp gh:OWNER/REPO/steam/screenshots/01.jpg \
#     gh:OWNER/REPO/steam/screenshots/03.jpg gh:OWNER/REPO/steam/screenshots/11.jpg
#
# Environment (all optional): SEG=2.0 seconds per image (incl. fades), FADE=0.5 crossfade seconds,
# ZOOM=1.3 (crop window = image / ZOOM, the pan moves it across the spare room), FOCUS_Y=0.35
# (vertical centre of the window, 0 = top, 1 = bottom), plus anything encode-clip.sh accepts.
set -euo pipefail
out=${1:?usage: screenshots-clip.sh <out.webp> <image...>}; shift
(( $# >= 2 )) || { echo "need at least 2 images" >&2; exit 1; }
SEG=${SEG:-2.0} FADE=${FADE:-0.5} ZOOM=${ZOOM:-1.3} FOCUS_Y=${FOCUS_Y:-0.35}
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

inputs=() i=0
for src in "$@"; do
  f=$src
  if [[ $src == gh:* ]]; then
    p=${src#gh:}; repo=${p%%/*}/$(cut -d/ -f2 <<<"$p"); path=$(cut -d/ -f3- <<<"$p")
    f="$tmp/src-$i.${path##*.}"
    gh api "repos/$repo/contents/$path" -H 'Accept: application/vnd.github.raw' > "$f"
  fi
  inputs+=(-loop 1 -framerate 60 -t "$SEG" -i "$f"); i=$((i + 1))
done
n=$#

# Each image: upscale 2x (sub-pixel smooth pan), crop a 1/ZOOM window at FOCUS_Y and pan it
# left-to-right or right-to-left (alternating) over the segment, back to 1920x1080.
graph=""
for ((k = 0; k < n; k++)); do
  if (( k % 2 )); then dir="(1-t/$SEG)"; else dir="(t/$SEG)"; fi
  graph+="[$k:v]scale=3840:2160,crop=w=iw/$ZOOM:h=ih/$ZOOM:x=(iw-ow)*$dir:y=(ih-oh)*$FOCUS_Y,scale=1920:1080,setsar=1,fps=60,format=yuv420p[s$k];"
done
prev="[s0]"
for ((k = 1; k < n; k++)); do
  off=$(awk "BEGIN { print $k * ($SEG - $FADE) }")
  graph+="${prev}[s$k]xfade=transition=fade:duration=$FADE:offset=$off[x$k];"; prev="[x$k]"
done
graph=${graph%;}; graph=${graph%"[x$((n - 1))]"}"[v]"
ffmpeg -hide_banner -loglevel error -nostdin -y "${inputs[@]}" -filter_complex "$graph" -map '[v]' \
  -c:v ffv1 "$tmp/slideshow.mkv"
# The last FADE seconds crossfade into the first ones, closing the loop.
XFADE_FRAMES=$(awk "BEGIN { print int($FADE * 60) }") "$here/encode-clip.sh" "$tmp/slideshow.mkv" "$out"
