# 宣传片制作工程

六足机器人 × 六轴无人机空地协同搜救系统的 120 秒宣传片。画面用 three.js 程序化建模、在无头 Chromium 里逐帧渲染，声音用 Python 合成，最后用 ffmpeg 合成成片。

分镜脚本见 Claude Docs 文档：https://claude.ai/artifact/D4zFFer7kXuBdzSTBVbcf9

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/assets/` | 无人机、六足机器人、基站、灾区城区、直升机、机场、指挥中心、瓦砾缝隙等模型与场景 |
| `src/fx/` | 调色、大气雾与体积光、粒子、扫描特效、界面叠加层 |
| `src/shots.js` | 26 个镜头的镜头运动与动画，每个镜头是时间的纯函数 |
| `render.mjs` | 逐帧渲染脚本 |
| `audio/` | 旁白（Piper 中文语音）、配乐与音效合成、混音、字幕 |
| `assemble.sh` | 拼接镜头、混入声音、烧录字幕 |

## 渲染

```bash
npm install                                   # three.js 与中文字体
node render.mjs --shots s01,s02 --still 48     # 某一帧的检查图 → out/stills/
node render.mjs --shots s01 --encode 1         # 渲染整个镜头 → out/frames/、out/clips/
node render.mjs --w 640 --h 360 --step 2 --encode 1 --tag prev   # 低清预览
```

## 声音

```bash
cd audio
python3 -m venv .venv && .venv/bin/pip install piper-tts unicode-rbnf numpy scipy soundfile
# 下载 zh_CN-huayan-medium.onnx 与 .onnx.json 到 audio/models/
.venv/bin/python narration.py   # 旁白与对讲机
.venv/bin/python score.py       # 配乐与音效
.venv/bin/python mix.py         # 混音 + 字幕
```

## 成片

```bash
./assemble.sh out/clips out/宣传片
```

输出 `out/宣传片.mp4`（烧录字幕）、`out/宣传片_无字幕.mp4` 和 `out/宣传片_字幕.srt`。

## 暂定内容

项目名称“六合”和口号“上天入地，不放弃每一个生命”是暂定的。改名称时，需要改 `audio/lines.py` 里的旁白、`src/fx/hud.js` 的片尾字幕，然后重新生成旁白并重渲 `s26`。
