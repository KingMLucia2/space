#!/usr/bin/env bash
# 合成成片：按镜头顺序拼接 → 混音 → 烧录字幕；另出一版无字幕＋SRT。
# 用法：./assemble.sh ["clips 目录（可多个，按优先级，用空格隔开）"] [输出前缀]
set -euo pipefail
cd "$(dirname "$0")"
CLIPS=${1:-out/clips}; OUT=${2:-out/宣传片}
LIST=$(mktemp)
for i in $(seq -w 1 26); do
  f=""; for d in $CLIPS; do [ -f "$d/s$i.mp4" ] && { f="$PWD/$d/s$i.mp4"; break; }; done
  [ -n "$f" ] || { echo "缺少镜头 s$i"; exit 1; }
  echo "file '$f'" >> "$LIST"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy "${OUT}_无声.mp4"
# 渲染分辨率为 1280×720，这里放大到 1080p（lanczos + 轻微锐化），再烧录字幕。
# 胶片颗粒很耗码率，用两遍编码、固定 5.5Mbps，成片约 85MB。
SCALE="scale=1920:1080:flags=lanczos,unsharp=5:5:0.35:5:5:0"
enc() { # $1 滤镜 $2 输出
  ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" -vf "$1" -c:v libx264 -preset slow -tune film -b:v 5500k -maxrate 8000k -bufsize 11000k -pix_fmt yuv420p -pass 1 -passlogfile "${OUT}_pass" -an -f mp4 /dev/null
  ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" -i audio/build/mix.wav -map 0:v -map 1:a -vf "$1" -c:v libx264 -preset slow -tune film -b:v 5500k -maxrate 8000k -bufsize 11000k -pix_fmt yuv420p -pass 2 -passlogfile "${OUT}_pass" -c:a aac -b:a 192k -movflags +faststart -shortest "$2"
}
enc "${SCALE},ass=audio/build/subtitles.ass" "${OUT}.mp4"
enc "${SCALE}" "${OUT}_无字幕.mp4"
rm -f "${OUT}_pass"*
cp audio/build/subtitles.srt "${OUT}_字幕.srt"
cp audio/build/mix_no_voice.wav "${OUT}_无旁白音轨.wav"
rm -f "$LIST" "${OUT}_无声.mp4"
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact "${OUT}.mp4"
