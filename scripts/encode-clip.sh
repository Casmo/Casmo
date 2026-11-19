#!/usr/bin/env bash
# Encode a Clip (GLOSSARY.md, ADR 0001): animated WebP, 60fps, about 320px wide, under 2 MB.
#
#   scripts/encode-clip.sh <input> <output.webp>
#
# <input> is either a directory of frame-NNNNN.png files (from scripts/record-clip.mjs, already
# at $FPS) or any video/image ffmpeg can read (e.g. a Steam trailer; use START and DURATION).
#
# Environment (all optional):
#   FPS=60            output frame rate; WebP stores ms ints, so 60fps gives 16/17ms frames
#   WIDTH=320         output width (height keeps the aspect ratio, rounded to even)
#   START=0 DURATION= cut from a video input (seconds)
#   CROP=             ffmpeg crop before scaling, e.g. "880:550:40:50" (w:h:x:y)
#   XFADE_FRAMES=0    blend the last N frames into the first N for a near-seamless loop
#                     (the Clip ends up N frames shorter than the input)
#   PRE_FILTER=       extra ffmpeg filters before fps/scale, e.g. "minterpolate=fps=60" for 30fps video
#   QUALITY=80        start quality; lowered in steps of 8 until the file is under MAX_BYTES
#   MAX_BYTES=1900000 size budget (the check script allows < 2 MiB)
set -euo pipefail

in=${1:?usage: encode-clip.sh <frames-dir|video> <output.webp>}
out=${2:?usage: encode-clip.sh <frames-dir|video> <output.webp>}
FPS=${FPS:-60} WIDTH=${WIDTH:-320} XFADE_FRAMES=${XFADE_FRAMES:-0}
QUALITY=${QUALITY:-80} MAX_BYTES=${MAX_BYTES:-1900000}

if [[ -d $in ]]; then
  input=(-framerate "$FPS" -i "$in/frame-%05d.png")
else
  input=(-ss "${START:-0}" ${DURATION:+-t "$DURATION"} -i "$in")
fi

pre="${CROP:+crop=$CROP,}${PRE_FILTER:+$PRE_FILTER,}fps=$FPS,scale=$WIDTH:-2:flags=lanczos,setsar=1"
if (( XFADE_FRAMES > 0 )); then
  # Count frames after fps conversion, then: body = frames N..end, and its last N frames are
  # crossfaded with frames 0..N-1, so the last frame flows into the first one.
  total=$(ffmpeg -hide_banner -nostdin "${input[@]}" -vf "$pre" -f null - 2>&1 |
    grep -o 'frame= *[0-9]*' | tail -1 | grep -o '[0-9]*$')
  body=$((total - XFADE_FRAMES))
  offset=$(awk "BEGIN { print ($body - $XFADE_FRAMES) / $FPS }")
  dur=$(awk "BEGIN { print $XFADE_FRAMES / $FPS }")
  filter="[0:v]$pre,split[a][b];
    [a]trim=start_frame=$XFADE_FRAMES,setpts=PTS-STARTPTS[body];
    [b]trim=end_frame=$XFADE_FRAMES,setpts=PTS-STARTPTS[head];
    [body][head]xfade=transition=fade:duration=$dur:offset=$offset,format=yuva420p[v]"
else
  filter="[0:v]$pre,format=yuva420p[v]"
fi

q=$QUALITY
while :; do
  ffmpeg -hide_banner -loglevel error -nostdin -y "${input[@]}" -filter_complex "$filter" -map '[v]' \
    -c:v libwebp_anim -lossless 0 -quality "$q" -compression_level 6 -loop 0 -r "$FPS" "$out"
  size=$(stat -c %s "$out")
  echo "quality $q: $size bytes"
  (( size < MAX_BYTES || q <= 20 )) && break
  q=$((q - 8))
done
(( size < MAX_BYTES )) || { echo "still over $MAX_BYTES bytes at quality $q" >&2; exit 1; }
