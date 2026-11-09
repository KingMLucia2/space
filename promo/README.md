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

## 第二版（科技线稿风，`v2/`）

不用三维建模渲染，全部用代码画：Canvas 2D 自绘三维投影（近平面裁剪、画家算法、背面剔除），发光青色线框配白/橙色设备、点云瓦砾，没有旁白和字幕。

| 路径 | 内容 |
| --- | --- |
| `v2/src/core.js` | 投影、显示列表、发光层、合成；`setView` 把整幅画面缩放进大屏，`renderPass` 离屏渲染一遍 |
| `v2/src/models/` | 城区（倒塌楼体、点云瓦砾、烟柱、火点、地裂缝、地形网格、救援车）、无人机、六足机器人、基站、直升机、人物、手机、指挥大厅、机场 |
| `v2/src/shots.js` | 26 个镜头。全部用全片绝对时间计算；同一地点的相邻镜头共用连续相机路径，上帝视角与大屏之间逐像素无缝 |
| `audio/v2_score.py`、`audio/v2_mix.py` | 按第二版事件时间合成配乐与音效并混音 |

```bash
node v2/render.mjs --shots s14,s15 --still 0,90       # 检查帧 → out/v2/stills/
node v2/render.mjs --shots s01,s02 --encode           # 渲染镜头 → out/v2/clips/
(cd audio && .venv/bin/python v2_score.py && .venv/bin/python v2_mix.py)
v2/assemble.sh                                        # → out/宣传片_v2.mp4
```

## 第三版（粒子点阵、中文旁白、片尾字幕）

在第二版工程上继续：默认渲染风格改为粒子点阵（`core.js` 的 `STYLE.mode = 'dots'`，点按世界坐标固定在物体边上），镜头扩充到 29 个（含 26 秒片尾），共 146.4 秒。另有一个不进成片的 `cover` 镜头，用来出封面图。

| 路径 | 内容 |
| --- | --- |
| `v2/src/models/payloads.js` | 通用对接盘、履带机器人、潜水机器人、无人船（片尾模块化演示） |
| `v2/credits.local.json` | 片尾名单（本地文件，不提交；没有时显示占位） |
| `audio/v3_narration.py` | 旁白：第一版文案，微软神经网络语音（需要能访问 speech.platform.bing.com） |
| `audio/v3_score.py`、`audio/v3_mix.py` | 按 146.4 秒新时间轴合成配乐、音效并混音，另出 SRT |

```bash
node v2/render.mjs --shots s29 --range 0:260          # 长镜头可按帧段多进程渲染，最后再用 ffmpeg 编码
(cd audio && .venv/bin/python v3_narration.py && .venv/bin/python v3_score.py && .venv/bin/python v3_mix.py)
v2/assemble.sh                                        # → out/宣传片_v3.mp4
node v2/render.mjs --shots cover --still 0 --png      # 封面 → out/v2/stills/cover_0000.png（成品另存为 out/宣传片_v3_封面.png/.jpg）
```

封面构图参数在 `shots.js` 的 `COVER_VIEW`（机位、六足机器人与无人机的距离、悬停高度、红点位置等）。不指定 `--shots` 渲染全片时会跳过封面。

## 第四版（three.js 产品拆解仿真器风格，`v4/`）

用户要求用 three.js 重构整个项目，画风参考两段“产品拆解仿真器”视频：暖白棚拍、白色亮面外壳＋黑色机械件＋橙色点缀、拆解爆炸图配引线标注，整幅画面是一个任务仿真网页界面。沿用第三版的故事、旁白和时间轴（s01~s29，146.4 秒），片尾字幕之后接 6 秒封面镜头 s30，全片 152.4 秒。设计说明见 `v4/DESIGN.md`。

| 路径 | 内容 |
| --- | --- |
| `v4/src/engine.js` | 渲染器（物理材质、环境光照、太阳投影或接触阴影、移轴，可选 GTAO）、与第三版一致的相机接口、每帧对象池 |
| `v4/src/models/hexapod.js` | 六足机器人：黑色铝板桁架腿＋各关节 20 kg 舵机、白色机身、可翻起的生命探测雷达面板、逆运动学步态 |
| `v4/src/models/hexacopter.js` | 重载六旋翼：折叠臂与锁紧环、电调舱、带散热鳍片的电机、折叠桨、对接导向锥与锁扣、云台、起落架 |
| `v4/src/models/city.js`、`cityData.js` | 白模灾区沙盘（布局沿用第三版）：楼体生长、地震后隆起的瓦砾、透视抖动、火光烟柱、被困者标记 |
| `v4/src/models/props.js` | 基站、救援车、直升机、人物、担架、机场、瓦砾里的手机、被困者热成像点云、片尾的三种载荷 |
| `v4/src/ui.js` | 任务仿真仪表盘：顶栏、任务阶段标签、左右数据卡、任务日志与计时、鼠标 |
| `v4/src/shots.js` | 30 个镜头（s30 是封面镜头）和不进成片的 `cover` 镜头 |
| `audio/v4_score.py`、`audio/v4_mix.py` | 第三版配乐与混音延长到 152.4 秒，加上封面段的钟声与收束和弦；旁白沿用第三版 |

```bash
node v4/render.mjs --shots s14,s23 --still 0,45       # 检查帧 → out/v4/stills/
node v4/render.mjs --shots s01,s02 --encode           # 渲染镜头 → out/v4/frames/、out/v4/clips/
(cd audio && python3 v4_score.py && python3 v4_mix.py)   # → audio/build/v4_mix.wav、v4_subtitles.srt
v4/assemble.sh                                        # → out/宣传片_v4.mp4
node v4/render.mjs --shots cover --still 0 --png      # 封面 → out/v4/stills/cover_0000.png（成品另存为 out/宣传片_v4_封面.png/.jpg）
```

渲染走 SwiftShader 软件 WebGL：棚拍镜头约 1 秒/帧，城区远景 2~5 秒/帧，整片 4572 帧分 3 个进程并行约一小时。页面 URL 参数：`msaa`（多重采样数，默认 4）、`ao=1`（开 GTAO，每帧多约 1 秒）、`hf=1`（半浮点渲染目标，较慢）。

## 暂定内容

项目名称“六合”和口号“上天入地，不放弃每一个生命”是暂定的。改名称时，需要改 `audio/lines.py` 里的旁白、`src/fx/hud.js` 的片尾字幕，然后重新生成旁白并重渲 `s26`。第三版还要改 `v2/src/hud.js` 的 `titleCard`、`v2/src/shots.js` 片尾和封面里的文字，重渲 `s28`、`s29`、`cover`。第四版要改 `v4/src/ui.js` 顶栏和 `v4/src/shots.js` 里片名卡、片尾、封面的文字（无人机机身印字在 `v4/src/models/hexacopter.js`），重渲 `s28`~`s30` 和 `cover`。
