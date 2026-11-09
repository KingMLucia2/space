#!/usr/bin/env bash
# 第四版成片：按镜头顺序拼接 s01~s30（s30 是片尾封面镜头）→ 混入声音 → 两遍编码，1080p 30fps。
# 用法：v4/assemble.sh [clips 目录] [输出前缀] [音轨] [镜头数]（在 promo/ 目录下运行）
set -euo pipefail
cd "$(dirname "$0")/.."
CLIPS=${1:-out/v4/clips}; OUT=${2:-out/宣传片_v4}; AUDIO=${3:-audio/build/v4_mix.wav}; COUNT=${4:-30}
LIST=$(mktemp)
for i in $(seq -w 1 $COUNT); do f="$PWD/$CLIPS/s$i.mp4"; [ -f "$f" ] || { echo "缺少镜头 s$i"; exit 1; }; echo "file '$f'" >> "$LIST"; done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy "${OUT}_无声.mp4"
# 浅色 PBR 画面细节多（还有一层胶片颗粒），码率给到 8 Mbps；两遍编码，成片约 160MB
V="-c:v libx264 -preset slow -b:v 8000k -maxrate 12000k -bufsize 16000k -pix_fmt yuv420p"
ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" $V -pass 1 -passlogfile "${OUT}_pass" -an -f mp4 /dev/null
ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" -i "$AUDIO" -map 0:v -map 1:a $V -pass 2 -passlogfile "${OUT}_pass" -c:a aac -b:a 192k -movflags +faststart -shortest "${OUT}.mp4"
rm -f "${OUT}_pass"* "$LIST" "${OUT}_无声.mp4"
ffprobe -v error -show_entries format=duration,size:stream=width,height,r_frame_rate -of compact "${OUT}.mp4"
