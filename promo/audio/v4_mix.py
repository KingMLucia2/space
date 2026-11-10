# 第四版混音（第三版旁白与对讲机，第四轮拆解镜头加长后全片 157.2 秒，末尾是封面镜头）：旁白（居中）、对讲机（带通滤波）、音效、配乐（旁白时自动压低），软限幅后输出 build/v4_mix.wav；另出 SRT 字幕文件备用（不烧进画面）
import json, numpy as np, soundfile as sf
from dsp import SR, lp, radio, stereo

DUR = 157.2; N = int(DUR * SR)
SHIFT_AT, EXT = 89.3, 2.4  # 绞车救援镜头加长后，之后的旁白整体顺延
meta = json.load(open('build/v3_narration.json'))
for it in meta['narration'] + meta['radio']:
    if it['start'] >= SHIFT_AT: it['start'] = round(it['start'] + EXT, 2)
    if it['start'] >= 17.9: it['start'] = round(it['start'] + 4.8, 2)  # 第四轮：拆解镜头加长 4.8 秒，“六足机器人与六轴无人机合为一体……”这句起整体顺延，“合为一体”仍落在部件合拢的那一下
music, _ = sf.read('build/v4_music.wav'); sfx, _ = sf.read('build/v4_sfx.wav')
voice = np.zeros(N); duck = np.zeros(N)
for it in meta['narration']:
    a, _ = sf.read(f"build/v3_narr_{it['i']:02d}.wav"); a = a / (np.max(np.abs(a)) + 1e-9) * 0.85
    i = int(it['start'] * SR); j = min(N, i + len(a)); voice[i:j] += a[: j - i]; duck[max(0, i - 4800): j + 9600] = 1
rad = np.zeros(N)
for j0, it in enumerate(meta['radio']):
    a, _ = sf.read(f"build/v3_radio_{j0}.wav"); a = radio(a / (np.max(np.abs(a)) + 1e-9)) * 0.9
    i = int(it['start'] * SR); j = min(N, i + len(a)); rad[i:j] += a[: j - i]; duck[max(0, i - 4800): j + 4800] = np.maximum(duck[max(0, i - 4800): j + 4800], 0.6)
duck = lp(duck, 3.0)
mgain = 0.66 * (1 - 0.5 * np.clip(duck, 0, 1)); sgain = 0.78 * (1 - 0.3 * np.clip(duck, 0, 1))
mix = music[:N] * mgain[:, None] + sfx[:N] * sgain[:, None] + stereo(voice * 1.05) + stereo(rad * 0.8, 0.1)
mix[: int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR))[:, None]
mix[-int(1.5 * SR):] *= np.linspace(1, 0, int(1.5 * SR))[:, None]
mix = mix * (0.12 / np.sqrt(np.mean(mix ** 2)))
mix = np.tanh(mix * 1.1) / np.tanh(1.1); mix /= max(1.0, np.max(np.abs(mix)) / 0.97)
sf.write('build/v4_mix.wav', mix.astype(np.float32), SR)
print('mix rms %.3f peak %.3f' % (np.sqrt(np.mean(mix ** 2)), np.max(np.abs(mix))))
def ts(t): h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60; return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"
subs = sorted([(it['start'], it['start'] + it['dur'] + 0.3, it['text']) for it in meta['narration']] + [(it['start'], it['start'] + it['dur'] + 0.3, '（对讲机）' + it['text']) for it in meta['radio']])
with open('build/v4_subtitles.srt', 'w') as f:
    for k, (a, b, txt) in enumerate(subs, 1): f.write(f"{k}\n{ts(a)} --> {ts(b)}\n{txt}\n\n")
print('srt', len(subs))
