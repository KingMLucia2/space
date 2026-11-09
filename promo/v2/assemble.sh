#!/usr/bin/env bash
# 成片：按镜头顺序拼接 → 混入声音 → 两遍编码，1080p 30fps。默认出第三版（粒子点阵、中文旁白、片尾字幕）。
# 用法：v2/assemble.sh [clips 目录] [输出前缀] [音轨] [镜头数]（在 promo/ 目录下运行）
set -euo pipefail
cd "$(dirname "$0")/.."
# 第三版片尾加了 6 秒封面镜头 s30（共 152.4 秒）；音轨用第四版的混音：v4_mix 就是第三版混音加上封面段的钟声与收束和弦（时间点一致）
CLIPS=${1:-out/v2/clips}; OUT=${2:-out/宣传片_v3}; AUDIO=${3:-audio/build/v4_mix.wav}; COUNT=${4:-30}
LIST=$(mktemp)
for i in $(seq -w 1 $COUNT); do f="$PWD/$CLIPS/s$i.mp4"; [ -f "$f" ] || { echo "缺少镜头 s$i"; exit 1; }; echo "file '$f'" >> "$LIST"; done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy "${OUT}_无声.mp4"
# 线稿画面是暗底上的细亮线，用 animation 调校；两遍编码固定码率，成片约 90MB
V="-c:v libx264 -preset slow -tune animation -b:v 6000k -maxrate 9000k -bufsize 12000k -pix_fmt yuv420p"
ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" $V -pass 1 -passlogfile "${OUT}_pass" -an -f mp4 /dev/null
ffmpeg -y -loglevel error -i "${OUT}_无声.mp4" -i "$AUDIO" -map 0:v -map 1:a $V -pass 2 -passlogfile "${OUT}_pass" -c:a aac -b:a 192k -movflags +faststart -shortest "${OUT}.mp4"
rm -f "${OUT}_pass"* "$LIST" "${OUT}_无声.mp4"
ffprobe -v error -show_entries format=duration,size:stream=width,height,r_frame_rate -of compact "${OUT}.mp4"
