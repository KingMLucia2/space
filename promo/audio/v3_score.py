# 第三版配乐与音效：按第三版镜头（含片尾字幕，共 144 秒）的事件时间合成，输出 build/v3_music.wav 与 build/v3_sfx.wav
# 镜头起点（秒）：s01 0 粒子城市/地震, s02 7, s03 11, s04 14.5, s05 17.5 全息爆炸图, s06 21.5, s07 24.5, s08 28.5, s09 31.5, s10 35,
# s11 37.5 激光扫描, s12 41.5, s13 45.5, s14 49, s15 52, s16 58, s17 63, s18 66, s19 70, s20 73.5, s21 76.5 机场, s22 80.5 擦肩,
# s23 85.5 绞车救援, s24 89.5, s25 93, s26 97, s27 105, s28 110 片名, s29 118 片尾字幕
import numpy as np, soundfile as sf
from dsp import *

DUR = 146.4; N = int(DUR * SR)
SHIFT_AT, EXT = 89.3, 2.4  # 绞车救援镜头加长 2.4 秒：此后的事件整体顺延
music = np.zeros((N, 2)); sfx = np.zeros((N, 2))
def add(buf, x, t0, gain=1.0, pan=0.0, raw=False):
    if not raw and t0 >= SHIFT_AT: t0 += EXT
    x = stereo(x, pan) if x.ndim == 1 else x
    i = int(t0 * SR); j = min(N, i + len(x))
    if j > i: buf[i:j] += x[: j - i] * gain

BEAT = 0.6; BAR = 2.4
CH = {'Dm': [50, 53, 57, 62], 'Bb': [46, 50, 53, 58], 'F': [45, 48, 53, 57], 'C': [48, 52, 55, 60], 'Gm': [43, 50, 55, 58], 'D': [50, 54, 57, 62], 'Bm': [47, 50, 54, 59], 'G': [43, 47, 50, 55], 'A': [45, 49, 52, 57]}
BASS = {'Dm': 26, 'Bb': 22, 'F': 29, 'C': 24, 'Gm': 31, 'D': 26, 'Bm': 23, 'G': 31, 'A': 33}

def blip(f=1800, d=0.06, vel=1.0): return sine(f, d) * env(int(d * SR), 0.002, 0.01, 0.7, 0.02) * vel * 0.22
def sweep(d=1.0, vel=1.0):
    t = T(d); return bp(noise(d), 1500, 9000) * np.sin(np.pi * t / d) ** 2 * vel * 0.25
def shimmer(d=4.0, base=84, vel=1.0):
    t = T(d); x = np.zeros_like(t)
    for k, m in enumerate([base, base + 3, base + 7, base + 10, base + 14]): x += np.sin(2 * np.pi * mtof(m) * t + k) * (0.5 + 0.5 * np.sin(2 * np.pi * (0.7 + 0.31 * k) * t + k))
    return x * env(len(t), min(1.2, d * 0.3), 0.2, 1.0, min(1.5, d * 0.35)) * 0.04 * vel
def ticks(d=4.0, rate=14, seed=3):
    r = np.random.default_rng(seed); x = np.zeros(int(d * SR))
    for k in range(int(d * rate)):
        p = int((k + r.random() * 0.6) / rate * SR)
        if p + 400 < len(x): x[p:p + 400] += sine(2600 + 1400 * r.random(), 400 / SR) * np.exp(-np.arange(400) / 80) * r.random()
    return x * 0.25
def rumble(d=4.0):
    t = T(d); return (lp(noise(d), 90) * 1.4 + lp(noise(d), 300) * 0.3) * np.exp(-t * 0.6) * (1 - np.exp(-t * 30))
def zap(d=0.35, f0=900, f1=3200):  # 激光扫描的“滋”声
    t = T(d); f = f0 + (f1 - f0) * t / d; return (sine(f, d) * 0.3 + bp(noise(d), 2000, 7000) * 0.2) * np.sin(np.pi * t / d) * 0.35

# ———— 配乐 ————
# 0–3.5 粒子汇聚：高频闪烁音簇与上升的低音
add(music, shimmer(3.6, 81, 1.6), 0.0, 1.0); add(music, riser(3.4), 0.1, 0.35); add(music, pad([38, 45], 3.6, a=2.5, r=0.3, cutoff=500), 0.0, 0.5)
# 3.5 地震：一记重低音，随后灾难氛围（低音持续音、不协和长音、零落钢琴）
add(music, boom(1.2, 4.0), 3.5, 0.9)
add(music, pad([26, 38, 45], 11.5, a=2.0, r=3.0, cutoff=500), 3.3, 0.9)
add(music, pad([62, 63], 9.0, a=3.0, r=3.0, cutoff=1200), 5.0, 0.18)
for t0, m in [(6.2, 69), (8.0, 65), (9.6, 64), (11.6, 62), (13.4, 57)]: add(music, piano(m, 4.0, 0.7), t0, 0.5, pan=0.2)
# 14.5–21.5 基站启动、全息爆炸图：琶音脉冲＋闪烁，20.78 结合成一体时一记重音
for k, c in enumerate(['Dm', 'Dm', 'Bb']):
    t0 = 14.6 + k * BAR; add(music, pad(CH[c], BAR + 1.2, a=0.6, r=1.0, cutoff=900 + 300 * k), t0, 0.55)
    notes = CH[c] + [CH[c][1] + 12]
    for s in range(16):
        m = notes[[0, 2, 1, 3, 4, 3, 1, 2][s % 8]] + 12
        x = lp(saw(mtof(m), 0.14) * env(int(0.14 * SR), 0.003, 0.05, 0.3, 0.06), 1200 + 260 * k); add(music, x, t0 + s * BEAT / 4, 0.09 + 0.01 * k, pan=0.35 * np.sin(s))
add(music, shimmer(3.2, 88, 1.2), 17.6, 1.0)
add(music, tom(38, 1.0), 20.78, 0.8); add(music, boom(0.8), 20.8, 0.6)
# 21.5–28.5 起飞与飞越：和弦脉冲，22.9 起飞时进鼓
for k, c in enumerate(['Bb', 'F', 'C']):
    t0 = 21.5 + k * BAR; add(music, pad(CH[c], BAR + 0.8, a=0.4, r=0.8, cutoff=1500), t0, 0.5)
    bass = saw(mtof(BASS[c]), BAR * 0.95) * env(int(BAR * 0.95 * SR), 0.01, 0.3, 0.6, 0.2); add(music, lp(bass, 300), t0, 0.3)
    for b in range(4):
        tb = t0 + b * BEAT
        if tb >= 22.9 and b in (0, 2): add(music, kick(0.9), tb, 0.5)
        if tb >= 22.9: add(music, hat(0.8), tb + BEAT / 2, 0.45, pan=0.3)
# 28.5–52 抵达与搜寻：鼓组律动
for k, c in enumerate(['Dm', 'Bb', 'F', 'C'] * 3):
    t0 = 28.5 + k * BAR
    if t0 > 51.5: break
    add(music, pad(CH[c], BAR + 0.8, a=0.3, r=0.8, cutoff=1500, bright=0.2 * (k > 6)), t0, 0.5)
    bass = saw(mtof(BASS[c]), BAR * 0.95) * env(int(BAR * 0.95 * SR), 0.01, 0.3, 0.6, 0.2); add(music, lp(bass, 300), t0, 0.35)
    for b in range(4):
        tb = t0 + b * BEAT
        if b in (0, 2): add(music, kick(0.9), tb, 0.5)
        if b in (1, 3): add(music, snare(0.7), tb, 0.32)
        for h in range(2): add(music, hat(0.8), tb + h * BEAT / 2, 0.45, pan=0.3)
    notes = CH[c] + [CH[c][2] + 12]
    for s in range(16):
        m = notes[[0, 2, 1, 3, 4, 3, 1, 2][s % 8]] + 12
        add(music, lp(saw(mtof(m), 0.12) * env(int(0.12 * SR), 0.002, 0.04, 0.3, 0.05), 2200), t0 + s * BEAT / 4, 0.065, pan=0.4 * np.sin(s * 1.3))
add(music, pad([74, 77, 81], 6.0, a=2.5, r=2.0, cutoff=5000), 46.0, 0.12)
# 52–63 升到上帝视角、进入大厅：悬浮铺底，心跳般的低频脉冲
add(music, pad(CH['Bb'] + [65], 6.2, a=1.0, r=2.0, cutoff=2200), 52.0, 0.5)
add(music, pad(CH['F'] + [69], 6.5, a=1.5, r=2.5, cutoff=2400), 57.0, 0.5)
for b in range(6): add(music, kick(0.5), 58.9 + b * 0.8, 0.28)
add(music, riser(2.6), 60.6, 0.4)
# 63–70 推回大屏与 GTA 式下降：低音铺底
add(music, pad([26, 38], 7.5, a=0.3, r=1.5, cutoff=400), 63.0, 0.6); add(music, pad([50, 57, 62], 3.0, a=0.2, r=1.2, cutoff=1800), 63.2, 0.25)
# 70–80.5 结合返航、机场：能量回升
for k, c in enumerate(['Bb', 'F', 'C', 'Gm']):
    t0 = 70.5 + k * BAR; add(music, pad(CH[c], BAR + 0.6, a=0.2, r=0.6, cutoff=1800), t0, 0.5)
    for b in range(4): add(music, kick(0.9), t0 + b * BEAT, 0.48 if b % 2 == 0 else 0.25)
    for h in range(8): add(music, hat(0.8), t0 + h * BEAT / 2, 0.42)
add(music, cymbal_swell(1.6), 78.9, 0.8)
# 80.5–89.5 高潮：擦肩而过、绞车救援
for k, c in enumerate(['Dm', 'Bb', 'F', 'C']):
    t0 = 80.5 + k * BAR; add(music, pad(CH[c] + [CH[c][0] + 24], BAR + 0.8, a=0.15, r=0.8, cutoff=2600), t0, 0.55)
    bass = saw(mtof(BASS[c]), BAR * 0.95) * env(int(BAR * 0.95 * SR), 0.01, 0.3, 0.6, 0.2); add(music, lp(bass, 320), t0, 0.4)
    for b in range(4):
        tb = t0 + b * BEAT; add(music, kick(1.0), tb, 0.52); add(music, snare(0.9), tb + BEAT / 2, 0.28)
        for h in range(2): add(music, hat(1.0), tb + h * BEAT / 2, 0.45)
mel = [(80.5, 74, 1.2), (81.7, 72, 0.6), (82.3, 69, 0.6), (82.9, 70, 1.2), (84.1, 69, 0.6), (84.7, 65, 0.6), (85.3, 65, 1.2), (86.5, 67, 0.6), (87.1, 69, 1.8), (88.0, 72, 1.0), (89.0, 74, 1.6)]
for t0, m, d in mel:
    x = (saw(mtof(m), d + 0.3) * 0.5 + saw(mtof(m) * 1.003, d + 0.3) * 0.5) * env(int((d + 0.3) * SR), 0.06, 0.2, 0.8, 0.25); add(music, lp(x, 2800), t0, 0.13, pan=-0.1)
add(music, boom(1.0), 84.0, 0.6); add(music, cymbal_swell(2.0), 82.0, 0.8)
# 绞车把担架吊上直升机：高潮段多一小节，旋律升到高处再落下
add(music, pad(CH['Dm'] + [CH['Dm'][0] + 24], BAR + 1.2, a=0.15, r=1.2, cutoff=2600), 90.1, 0.5, raw=True)
add(music, lp(saw(mtof(BASS['Dm']), BAR * 0.95) * env(int(BAR * 0.95 * SR), 0.01, 0.3, 0.6, 0.2), 320), 90.1, 0.35, raw=True)
for b in range(4): add(music, kick(0.8), 90.1 + b * BEAT, 0.42, raw=True); add(music, hat(0.8), 90.1 + b * BEAT + BEAT / 2, 0.38, raw=True)
add(music, pad(CH['F'] + [72, 77], 3.4, a=0.4, r=1.6, cutoff=3000), 87.4, 0.35)
for t0, m, d in [(90.1, 77, 1.0), (91.0, 76, 1.4)]: add(music, lp((saw(mtof(m), d + 0.3) * 0.5 + saw(mtof(m) * 1.003, d + 0.3) * 0.5) * env(int((d + 0.3) * SR), 0.06, 0.2, 0.8, 0.25), 2800), t0, 0.12, pan=-0.1, raw=True)
# 89.5–97 返回基站：落回 F 大调，温暖
add(music, pad(CH['F'] + [65, 69], 7.0, a=0.5, r=2.5, cutoff=2000), 89.4, 0.5)
for t0, m in [(90.2, 72), (91.4, 69), (92.6, 65), (93.8, 67), (95.0, 69)]: add(music, piano(m, 3.0, 0.7), t0, 0.5)
# 97–108.5 红点逐个变绿（六声钟）→ 推近最后一个红点（上升、静默、心跳）→ 108.5 变绿
GREEN = [97.9 + k * 1.0 for k in range(6)]
add(music, pad([38, 45, 50], 9.5, a=2.0, r=2.0, cutoff=900), 97.0, 0.38)
for k, m in enumerate([62, 64, 65, 67, 69, 70]):
    add(music, piano(m - 12, 2.5, 0.5), GREEN[k], 0.38); add(sfx, bell(m + 12, 2.6, 0.9), GREEN[k], 0.5, pan=-0.3 + 0.1 * k)
add(music, riser(2.6), 105.0, 0.45); add(music, pad([50, 51, 57], 2.6, a=2.0, r=0.05, cutoff=1500), 105.0, 0.35)
add(sfx, heartbeat(1.0), 107.72, 0.95)
TURN = 108.5
add(music, pad(CH['D'] + [66, 69, 74], 10.5, a=0.05, r=4.0, cutoff=3200), TURN, 0.78)
for k, m in enumerate([62, 66, 69, 74]): add(music, piano(m, 6.0, 0.9), TURN + k * 0.02, 0.62)
add(music, boom(0.9, 5.0), TURN, 0.8); add(sfx, bell(86, 3.0, 0.8), TURN, 0.5); add(music, boom(0.6, 4.0), 110.3, 0.5)
for t0, m in [(111.4, 74), (112.6, 73), (113.8, 69), (115.0, 74), (116.4, 71)]: add(music, piano(m, 4.0, 0.5), t0, 0.46)
# 118–144 片尾：D 大调的温暖律动，钢琴旋律，最后和弦收束淡出
OUT = ['D', 'Bm', 'G', 'A'] * 3
for k, c in enumerate(OUT):
    t0 = 119.4 + k * BAR * 0.9
    if t0 > 140.5: break
    d = BAR * 0.9; add(music, pad(CH[c] + [CH[c][2] + 12], d + 0.8, a=0.4, r=0.8, cutoff=2200), t0, 0.42)
    add(music, lp(saw(mtof(BASS[c]), d * 0.95) * env(int(d * 0.95 * SR), 0.01, 0.3, 0.6, 0.2), 300), t0, 0.3)
    for b in range(4):
        tb = t0 + b * d / 4
        if b in (0, 2): add(music, kick(0.7), tb, 0.36)
        if b == 2: add(music, snare(0.5), tb, 0.18)
        add(music, hat(0.6), tb + d / 8, 0.32, pan=0.3)
omel = [(119.6, 74, 1.0), (120.7, 76, 0.5), (121.2, 78, 1.4), (123.9, 76, 1.0), (125.0, 74, 1.6), (128.2, 71, 1.0), (129.3, 74, 1.2), (132.5, 73, 1.0), (133.6, 76, 1.6), (136.8, 78, 1.0), (137.9, 81, 2.0)]
for t0, m, d in omel: add(music, piano(m, d + 2.0, 0.6), t0, 0.5, pan=0.1)
add(music, pad(CH['D'] + [66, 69, 74], 4.5, a=0.3, r=3.5, cutoff=2800), 139.6, 0.6); add(music, piano(62, 4.0, 0.7), 139.6, 0.5); add(music, piano(74, 4.0, 0.6), 139.62, 0.4)

# ———— 音效 ————
# s01 粒子汇聚、地震、坍塌
add(sfx, ticks(3.4, 18) * np.linspace(0.2, 1.0, int(3.4 * SR)), 0.0, 0.7, pan=0.1); add(sfx, whoosh(3.0, vel=0.5), 0.4, 0.5)
add(sfx, rumble(5.0), 3.45, 1.3); add(sfx, boom(1.0, 3.0), 3.5, 0.7)
for k, t0 in enumerate([3.9, 4.3, 4.7, 5.2, 5.8, 6.3]): add(sfx, debris(1.4, k + 3), t0, 0.5, pan=-0.6 + 0.24 * k)
add(sfx, wind(8.0, 450), 6.0, 0.45)
# 粒子转场
for t0, d in [(7.0, 0.8), (14.5, 0.7), (17.5, 0.6), (76.5, 0.8), (85.5, 0.7), (89.5, 0.7)]: add(sfx, sweep(d + 0.2, 0.9) + whoosh(d + 0.2, vel=0.4), t0 - 0.05, 0.6)
# s02 被截断的公路
add(sfx, lp(siren(4.4, period=1.1), 2500), 7.0, 0.32, pan=0.2); add(sfx, lp(noise(4.0), 120) * 0.4, 7.0, 0.45); add(sfx, debris(1.5, 2), 8.6, 0.35)
# s03 瓦砾里的手机：灰尘簌簌、振动、敲击
add(sfx, lp(noise(3.6), 3000) * 0.04, 11.0, 1.0)
for t0 in [11.2, 11.65, 12.8, 13.25]: add(sfx, buzz(0.36), t0, 0.55, pan=0.1)
for t0 in [12.25, 12.55, 13.9]: add(sfx, knock(1.0), t0, 0.5, pan=-0.2)
# s04 基站亮灯、开舱
add(sfx, beep(1320, 0.1), 14.8, 0.6); add(sfx, beep(1760, 0.14), 14.95, 0.6)
add(sfx, lp(noise(2.2), 900) * env(int(2.2 * SR), 0.3, 0.2, 0.8, 0.5) * 0.25, 15.2, 0.6)
# s05 全息爆炸图：嗡鸣、部件分离、标注提示、结合
add(sfx, sine(110, 4.0) * 0.03 + bp(noise(4.0), 3000, 8000) * 0.01, 17.5, 1.0)
for k in range(6): add(sfx, servo(0.25, 500 + 60 * k, 800 + 60 * k), 17.85 + k * 0.18, 0.35, pan=-0.5 + 0.2 * k)
for k in range(5): add(sfx, blip(1800 + 150 * k, 0.05, 0.8), 19.15 + k * 0.08, 0.5, pan=0.3)
add(sfx, whoosh(0.6, vel=0.8), 20.2, 0.5); add(sfx, clunk(1.0), 20.78, 0.9); add(sfx, click(1.0), 20.82, 0.7)
# s06 平台升起、旋翼启动、起飞
add(sfx, servo(1.4, 180, 260), 21.5, 0.55)
spd = np.clip((T(3.0) - 0.15) / 1.2, 0, 1); add(sfx, rotor(3.0, 118, spd), 21.5, 1.0); add(sfx, whoosh(1.6, vel=0.8), 22.9, 0.65)
# s07 低空飞越车队，飞入烟尘
add(sfx, rotor(4.0, 118) + wind(4.0, 900) * 0.6, 24.5, 0.9, pan=-0.1); add(sfx, lp(siren(4.0, period=1.1), 1500), 24.5, 0.12, pan=0.5)
add(sfx, lp(noise(1.2), 600) * np.linspace(0, 0.5, int(1.2 * SR)), 27.4, 0.8)
# s08 飞出烟尘、降落
add(sfx, rotor(3.0, 118) * np.linspace(0.5, 1.2, int(3 * SR)) + lp(noise(3.0), 700) * np.linspace(0.1, 0.5, int(3 * SR)), 28.5, 0.9); add(sfx, clunk(0.6), 31.4, 0.6)
# s09 展开分离
spd = np.clip(1 - T(3.5) / 2.5, 0.3, 1); add(sfx, rotor(3.5, 118, spd), 31.5, 0.9)
for t0 in [31.7, 31.95, 32.2, 32.45, 32.7]: add(sfx, servo(0.26, 600, 900), t0, 0.5, pan=np.sin(t0 * 7) * 0.5)
add(sfx, click(1.0), 32.85, 0.8); add(sfx, clunk(0.5), 32.9, 0.5); add(sfx, beep(2000, 0.08), 33.0, 0.5); add(sfx, servo(1.0, 420, 300), 33.5, 0.4)
# s10 无人机升空
spd = np.clip(0.35 + T(2.5) / 0.5, 0, 1); add(sfx, rotor(2.5, 118, spd) * np.linspace(1.0, 0.6, int(2.5 * SR)), 35.0, 0.9); add(sfx, whoosh(1.6, vel=0.6), 35.6, 0.5)
# s11 激光雷达扫描：周期性的扫描声、数据提示、发现可疑区域、规划路线
add(sfx, rotor(4.0, 118) * 0.5, 37.5, 0.7)
for k in range(4): add(sfx, zap(0.4), 37.5 + k / 0.9, 0.7, pan=-0.3 + 0.2 * k)
add(sfx, ticks(4.0, 10, 9) * 0.6, 37.6, 0.6, pan=0.3)
add(sfx, beep(1500, 0.12), 39.55, 0.8); add(sfx, beep(1100, 0.16), 39.7, 0.8)
for k in range(10): add(sfx, blip(1200 + 120 * k, 0.04, 0.8), 39.9 + k * 0.12, 0.55, pan=0.3)
# s12~s13 机械足步（每秒 4 次落足），停下展开探测模块、扫描声
for k in range(21):
    t0 = 40.55 + k * 0.25; add(sfx, servo(0.12, 700, 820), t0 - 0.06, 0.65, pan=(-1) ** k * 0.3)
    add(sfx, lp(noise(0.06), 1800) * expdecay(int(0.06 * SR), 0.012) * 0.5, t0, 1.2, pan=(-1) ** k * 0.3)
add(sfx, servo(1.1, 300, 520), 46.4, 0.7); add(sfx, sine(95, 2.6) * 0.15 * env(int(2.6 * SR), 0.4, 0.1, 1, 0.3), 46.9, 0.8)
for t0 in [47.0, 48.1]: add(sfx, sine(1250, 1.2) * expdecay(int(1.2 * SR), 0.25) * 0.25, t0, 0.6)
# s14 发现生命体征
for t0 in [49.6, 50.4, 51.2]: add(sfx, heartbeat(1.0), t0, 0.8)
add(sfx, beep(1900, 0.09), 49.9, 0.7); add(sfx, beep(1900, 0.09), 50.05, 0.7)
# s15 升起：长呼啸、数据上传、各处红点亮起
add(sfx, whoosh(4.0, vel=0.7), 53.0, 0.55)
for k in range(14): add(sfx, blip(2600 + 200 * (k % 4), 0.035, 0.7), 52.7 + k * 0.3, 0.35, pan=0.4 * np.sin(k))
for k in range(7): add(sfx, blip(1400 + 110 * k, 0.07, 0.9), 57.02 + k * 0.12, 0.7, pan=-0.4 + 0.12 * k)
add(sfx, sweep(1.0), 56.9, 0.35)
# s16 指挥大厅
add(sfx, whoosh(1.0, vel=0.8), 57.9, 0.5); add(sfx, lp(noise(8.0), 200) * 0.15 + sine(100, 8.0) * 0.01, 58.0, 0.6)
for t0 in [59.6, 60.9, 62.1]: add(sfx, blip(2200, 0.05, 0.6), t0, 0.5, pan=0.4)
# s17 推回大屏、选中六足机器人
add(sfx, whoosh(1.6, vel=0.9) + hp(noise(1.6), 3000) * np.sin(np.pi * T(1.6) / 1.6) * 0.06, 63.0, 0.75)
add(sfx, blip(1600, 0.06), 63.9, 0.8); add(sfx, blip(2400, 0.08), 64.0, 0.8)
# s18 分三段下降
for a, b in [(0.1, 0.55), (0.85, 1.3), (1.6, 2.3)]:
    add(sfx, whoosh(b - a + 0.3, vel=1.0), 66.0 + a - 0.15, 0.9); add(sfx, boom(0.8, 2.0), 66.0 + b - 0.05, 0.55)
add(sfx, rotor(2.8, 118) * np.linspace(0, 1, int(2.8 * SR)), 67.2, 0.8)
# s19 结合
add(sfx, rotor(3.5, 118), 70.0, 0.8); add(sfx, clunk(1.0), 71.65, 0.8); add(sfx, click(1.0), 71.85, 0.8); add(sfx, bell(84, 1.2, 0.6), 72.05, 0.4)
for t0 in [72.1, 72.5, 72.9]: add(sfx, servo(0.35, 700, 520), t0, 0.45)
# s20 结合体升空离开
add(sfx, rotor(3.0, 118) * np.linspace(1.0, 0.2, int(3 * SR)), 73.5, 0.9); add(sfx, whoosh(2.2, vel=0.7), 74.6, 0.6)
# s21 机场：直升机、队员奔跑、舱门关闭、起飞
add(sfx, heli(4.2), 76.5, 1.7)
for k in range(10): add(sfx, lp(noise(0.05), 1200) * expdecay(int(0.05 * SR), 0.01) * 0.6, 76.6 + k * 0.17, 0.8, pan=-0.4)
add(sfx, servo(0.35, 300, 200) + clunk(0.7)[:int(0.35 * SR)], 78.65, 0.6); add(sfx, whoosh(1.6, vel=0.6), 79.1, 0.5)
# s22 擦肩：跟拍直升机（一直很响），结合体在 84.0 秒从镜头右侧掠过
tt = T(5.0); g = np.exp(-((tt - 3.54) / 0.6) ** 2)
add(sfx, heli(5.0) * 0.85, 80.5, 1.0, pan=0.1)
r = rotor(5.0, 118) * (0.1 + 1.1 * g); pan = np.clip((tt - 3.54) / 0.8, -0.2, 0.9) * 0.9
add(sfx, np.stack([r * np.cos((pan + 1) * np.pi / 4), r * np.sin((pan + 1) * np.pi / 4)], 1), 80.5, 0.9)
add(sfx, whoosh(1.2, vel=1.0), 83.45, 0.85)
# s23 绞车救援（6.4 秒）：悬停的直升机、担架离地（变绿提示）、绞车收缆、直升机带着担架离开
add(sfx, heli(6.4) * 0.8, 85.5, 1.3, raw=True)
add(sfx, clunk(0.5), 87.1, 0.5, raw=True); add(sfx, servo(3.7, 240, 340) * 0.8, 87.1, 0.6, raw=True)
add(sfx, bell(83, 1.6, 0.8), 87.4, 0.45, raw=True); add(sfx, bell(90, 1.6, 0.6), 87.5, 0.35, raw=True)
add(sfx, clunk(0.6), 90.8, 0.5, raw=True); add(sfx, whoosh(1.4, vel=0.7), 90.9, 0.5, raw=True)
# s24 降落基站、平台下降
add(sfx, rotor(3.5, 118, np.clip(1.6 - T(3.5) / 2.2, 0.0, 1)), 89.5, 0.9); add(sfx, clunk(0.9), 91.9, 0.7); add(sfx, servo(1.0, 200, 150), 92.1, 0.6)
# s25 平台下降、舱盖合拢、充电
add(sfx, servo(1.4, 200, 140), 93.0, 0.6); add(sfx, lp(noise(2.2), 1000) * env(int(2.2 * SR), 0.3, 0.2, 0.8, 0.4) * 0.3, 94.0, 0.6); add(sfx, clunk(1.0), 96.2, 0.8)
for k, m in enumerate([76, 79, 84]): add(sfx, bell(m, 1.4, 0.5), 95.6 + k * 0.16, 0.35)
# s26~s27 大厅嗡声、推近时的风声
add(sfx, lp(noise(11.0), 180) * 0.12, 97.0, 0.6); add(sfx, whoosh(0.6, vel=0.8), 108.1, 0.6)
# s29 片尾：绿色碎成粒子、面板出现、六次对接
add(sfx, shimmer(2.0, 90, 1.4) + sweep(2.0, 0.6), 118.1, 0.9); add(sfx, whoosh(1.6, vel=0.6), 118.3, 0.5)
for k in range(3): add(sfx, blip(1700 + 300 * k, 0.05, 0.7), 119.4 + k * 0.12, 0.5, pan=-0.4 + 0.4 * k)
for k in range(6):
    t0 = 120.0 + 4 * k
    add(sfx, shimmer(0.7, 93, 1.0), t0, 0.6, pan=0.5); add(sfx, servo(1.0, 420, 300) * 0.6, t0 + 0.65, 0.4, pan=0.5)
    add(sfx, clunk(0.8), t0 + 1.85, 0.6, pan=0.5); add(sfx, click(0.9), t0 + 1.9, 0.6, pan=0.5); add(sfx, blip(2400, 0.06, 0.6), t0 + 2.0, 0.4, pan=0.5)
    add(sfx, sweep(0.6, 0.5), t0 + 3.4, 0.4, pan=0.5)

music = reverb(music, 2.8, 0.32); sfx = reverb(sfx, 1.6, 0.18, seed=5)
for name, buf in [('v3_music', music), ('v3_sfx', sfx)]:
    buf /= max(1e-9, np.max(np.abs(buf))) / 0.9
    sf.write(f'build/{name}.wav', buf.astype(np.float32), SR); print('wrote', name, buf.shape)
