#!/usr/bin/env bash
# 合成成片：按镜头顺序拼接 → 混音 → 烧录字幕；另出一版无字幕＋SRT。
# 用法：./assemble.sh [clips 目录] [输出前缀]
set -euo pipefail
cd "$(dirname "$0")"
CLIPS=${1:-out/clips}; OUT=${2:-out/宣传片}
LIST=$(mktemp); for i in $(seq -w 1 26); do echo "file '$PWD/$CLIPS/s$i.mp4'" >> "$LIST"; done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy "${OUT}_无声.mp4"
ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" -i audio/build/mix.wav -map 0:v -map 1:a -vf "ass=audio/build/subtitles.ass" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -shortest "${OUT}.mp4"
ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" -i audio/build/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest "${OUT}_无字幕.mp4"
cp audio/build/subtitles.srt "${OUT}_字幕.srt"
rm -f "$LIST" "${OUT}_无声.mp4"
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact "${OUT}.mp4"
