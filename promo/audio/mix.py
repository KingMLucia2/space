# 混音：旁白（居中）、对讲机（滤波）、音效、配乐（旁白时自动压低），软限幅后输出 build/mix.wav；同时生成字幕 SRT/ASS
import json, numpy as np, soundfile as sf
from dsp import SR, lp, radio, stereo
from lines import NARRATION

DUR = 120.0; N = int(DUR * SR)
meta = json.load(open('build/narration.json'))
music, _ = sf.read('build/music.wav'); sfx, _ = sf.read('build/sfx.wav')
voice = np.zeros(N); duck = np.zeros(N)
for it in meta['narration']:
    a, _ = sf.read(f"build/narr_{it['i']:02d}.wav"); a = a / (np.max(np.abs(a)) + 1e-9) * 0.85
    i = int(it['start'] * SR); j = min(N, i + len(a)); voice[i:j] += a[: j - i]; duck[max(0, i - 4800): j + 9600] = 1
rad = np.zeros(N)
for j0, it in enumerate(meta['radio']):
    a, _ = sf.read(f"build/radio_{j0}.wav"); a = radio(a / (np.max(np.abs(a)) + 1e-9)) * 0.9
    i = int(it['start'] * SR); j = min(N, i + len(a)); rad[i:j] += a[: j - i]; duck[max(0, i - 4800): j + 4800] = np.maximum(duck[max(0, i - 4800): j + 4800], 0.6)
duck = lp(duck, 3.0)  # 平滑起落
mgain = 0.62 * (1 - 0.55 * np.clip(duck, 0, 1))
sgain = 0.75 * (1 - 0.3 * np.clip(duck, 0, 1))
mix = music * mgain[:, None] + sfx * sgain[:, None] + stereo(voice * 1.0) + stereo(rad * 0.8, 0.1)
# 首尾淡入淡出、软限幅
mix[: int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR))[:, None]
mix[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR))[:, None]
rms = np.sqrt(np.mean(mix ** 2)); mix = mix * (0.12 / rms)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= max(1.0, np.max(np.abs(mix)) / 0.97)
sf.write('build/mix.wav', mix.astype(np.float32), SR)
print('mix rms %.3f peak %.3f' % (np.sqrt(np.mean(mix ** 2)), np.max(np.abs(mix))))

# 字幕
def ts(t, sep=','): h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60; return f"{h:02d}:{m:02d}:{int(s):02d}{sep}{int(round((s % 1) * 1000)):03d}"
def ass_ts(t): h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60; return f"{h}:{m:02d}:{s:05.2f}"
subs = [(it['start'], it['start'] + it['dur'] + 0.35, it['text']) for it in meta['narration']]
subs += [(it['start'], it['start'] + it['dur'] + 0.3, '（对讲机）' + it['text']) for it in meta['radio']]
subs.sort()
with open('build/subtitles.srt', 'w') as f:
    for k, (a, b, txt) in enumerate(subs, 1): f.write(f"{k}\n{ts(a)} --> {ts(b)}\n{txt}\n\n")
hdr = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Narr,WenQuanYi Zen Hei,46,&H00F2F2F2,&H000000FF,&H00101010,&H64000000,0,0,0,0,100,100,2,0,1,2.2,1.2,2,80,80,128,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
with open('build/subtitles.ass', 'w') as f:
    f.write(hdr)
    for a, b, txt in subs: f.write(f"Dialogue: 0,{ass_ts(a)},{ass_ts(b)},Narr,,0,0,0,,{{\\fad(180,220)}}{txt}\n")
print('subtitles', len(subs))
