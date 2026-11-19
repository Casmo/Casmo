#!/usr/bin/env bash
# Download a game's Steam store trailer (video only, 720p H.264) to an mp4, for scripts/encode-clip.sh.
#
#   scripts/fetch-steam-trailer.sh <appid> <out.mp4> [movie-index]
#
# Reads the movie list from the public store API (https://store.steampowered.com/api/appdetails)
# and pulls the DASH H.264 stream (Steam's DASH renditions are 60fps; the HLS ones are 30fps).
# movie-index picks a trailer from the list (default 0 = the highlighted/first one).
set -euo pipefail
appid=${1:?usage: fetch-steam-trailer.sh <appid> <out.mp4> [movie-index]}
out=${2:?usage: fetch-steam-trailer.sh <appid> <out.mp4> [movie-index]}
idx=${3:-0}
mpd=$(curl -fsSL "https://store.steampowered.com/api/appdetails?appids=$appid" |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=Object.values(JSON.parse(s))[0].data.movies;
    if(!m||!m[$idx]){console.error('no trailer #$idx');process.exit(1)}console.log(m[$idx].dash_h264)})")
echo "trailer: $mpd" >&2
# Stream 1 of Steam's DASH manifest is the 1280x720 video representation (0 = 1080p, 4 = audio).
ffmpeg -hide_banner -loglevel error -nostdin -y -i "$mpd" -map 0:1 -c copy -an "$out"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -of csv=p=0 "$out" >&2
