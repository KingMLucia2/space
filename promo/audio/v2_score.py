# 第二版配乐与音效（没有旁白、没有对讲机）：按第二版镜头的事件时间合成，输出 build/v2_music.wav 与 build/v2_sfx.wav
# 镜头起点（秒）：s01 0, s02 5, s03 9, s04 13, s05 17, s06 21, s07 26, s08 30, s09 34, s10 38, s11 42, s12 47, s13 51,
# s14 54, s15 60, s16 65, s17 68, s18 72, s19 76, s20 80, s21 84, s22 89, s23 93, s24 98, s25 106, s26 111
import numpy as np, soundfile as sf
from dsp import *

DUR = 120.0; N = int(DUR * SR)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2))
def add(buf, x, t0, gain=1.0, pan=0.0):
    x = stereo(x, pan) if x.ndim == 1 else x
    i = int(t0 * SR); j = min(N, i + len(x))
    if j > i: buf[i:j] += x[: j - i] * gain

BEAT = 0.6; BAR = 2.4
CH = {'Dm': [50, 53, 57, 62], 'Bb': [46, 50, 53, 58], 'F': [45, 48, 53, 57], 'C': [48, 52, 55, 60], 'Gm': [43, 50, 55, 58], 'D': [50, 54, 57, 62]}
BASS = {'Dm': 26, 'Bb': 22, 'F': 29, 'C': 24, 'Gm': 31, 'D': 26}

# 数字感的小音效
def blip(f=1800, d=0.06, vel=1.0): return sine(f, d) * env(int(d * SR), 0.002, 0.01, 0.7, 0.02) * vel * 0.22
def sweep(d=1.0, f0=400, f1=6000, vel=1.0):  # 高通噪声扫频（擦除转场、扫描带）
    t = T(d); n = noise(d); out = np.zeros_like(n); seg = int(0.01 * SR)
    for i in range(0, len(n), seg):
        k = i / len(n); fc = f0 * (f1 / f0) ** k; out[i:i + seg] = n[i:i + seg]
    y = bp(out, 1500, 9000) * np.sin(np.pi * t / d) ** 2
    return y * vel * 0.25
def shimmer(d=4.0, base=84):  # 开场线条生长：高频闪烁的音簇
    t = T(d); x = np.zeros_like(t)
    for k, m in enumerate([base, base + 3, base + 7, base + 10, base + 14]):
        x += np.sin(2 * np.pi * mtof(m) * t + k) * (0.5 + 0.5 * np.sin(2 * np.pi * (0.7 + 0.31 * k) * t + k))
    return x * env(len(t), 1.2, 0.2, 1.0, 1.5) * 0.04
def ticks(d=4.0, rate=14, seed=3):
    r = np.random.default_rng(seed); x = np.zeros(int(d * SR))
    for k in range(int(d * rate)):
        p = int((k + r.random() * 0.6) / rate * SR)
        if p + 400 < len(x): x[p:p + 400] += sine(2600 + 1400 * r.random(), 400 / SR) * np.exp(-np.arange(400) / 80) * r.random()
    return x * 0.25

# ———— 配乐 ————
# 0–13 灾难：低音持续音、不协和长音、零落的钢琴
add(music, pad([26, 38, 45], 14.0, a=4.0, r=3.0, cutoff=500), 0.0, 0.9)
add(music, pad([62, 63], 10.0, a=3.0, r=4.0, cutoff=1200), 2.0, 0.18)
for t0, m in [(2.2, 69), (4.0, 65), (5.6, 64), (7.6, 62), (10.4, 57)]: add(music, piano(m, 4.0, 0.7), t0, 0.55, pan=0.2)
# 13–26 基站启动：琶音脉冲＋和弦铺底
for k, c in enumerate(['Dm', 'Dm', 'Bb', 'Bb', 'F']):
    t0 = 13.2 + k * BAR; add(music, pad(CH[c], BAR + 1.2, a=0.6, r=1.0, cutoff=900 + 300 * k), t0, 0.55)
    notes = CH[c] + [CH[c][1] + 12]
    for s in range(16):
        m = notes[[0, 2, 1, 3, 4, 3, 1, 2][s % 8]] + 12
        x = saw(mtof(m), 0.14) * env(int(0.14 * SR), 0.003, 0.05, 0.3, 0.06); x = lp(x, 1200 + 260 * k)
        add(music, x, t0 + s * BEAT / 4, 0.09 + 0.01 * k, pan=0.35 * np.sin(s))
add(music, tom(38, 1.0), 19.2, 0.8); add(music, boom(0.7), 19.25, 0.6)
# 26–54 抵达与搜寻：鼓组进入
prog2 = ['Dm', 'Bb', 'F', 'C'] * 3
for k, c in enumerate(prog2):
    t0 = 26.0 + k * BAR
    if t0 > 54: break
    add(music, pad(CH[c], BAR + 0.8, a=0.3, r=0.8, cutoff=1500, bright=0.2 * (k > 8)), t0, 0.5)
    bass = saw(mtof(BASS[c]), BAR * 0.95) * env(int(BAR * 0.95 * SR), 0.01, 0.3, 0.6, 0.2); add(music, lp(bass, 300), t0, 0.35)
    for b in range(4):
        tb = t0 + b * BEAT
        if b in (0, 2): add(music, kick(0.9), tb, 0.55)
        if b in (1, 3): add(music, snare(0.7), tb, 0.35)
        for h in range(2): add(music, hat(0.8), tb + h * BEAT / 2, 0.5, pan=0.3)
    if k % 4 == 3: [add(music, tom(45 - q * 3, 0.8), t0 + 1.2 + q * 0.3, 0.45) for q in range(4)]
    notes = CH[c] + [CH[c][2] + 12]
    for s in range(16):
        m = notes[[0, 2, 1, 3, 4, 3, 1, 2][s % 8]] + 12
        x = lp(saw(mtof(m), 0.12) * env(int(0.12 * SR), 0.002, 0.04, 0.3, 0.05), 2200)
        add(music, x, t0 + s * BEAT / 4, 0.07, pan=0.4 * np.sin(s * 1.3))
add(music, pad([74, 77, 81], 7.0, a=2.5, r=2.0, cutoff=5000), 47.8, 0.12)
# 54–65 升到上帝视角、进入指挥大厅：鼓停，悬浮铺底，心跳般的低频脉冲
add(music, pad(CH['Bb'] + [65], 6.0, a=1.0, r=2.0, cutoff=2200), 54.0, 0.5)
add(music, pad(CH['F'] + [69], 6.5, a=1.5, r=2.5, cutoff=2400), 59.0, 0.5)
for b in range(6): add(music, kick(0.5), 60.9 + b * 0.8, 0.3)
add(music, riser(2.6), 62.6, 0.45)
# 65–72 推回大屏与 GTA 式下降：低音铺底，把空间留给音效
add(music, pad([26, 38], 7.5, a=0.3, r=1.5, cutoff=400), 65.0, 0.6)
add(music, pad([50, 57, 62], 3.0, a=0.2, r=1.2, cutoff=1800), 65.2, 0.25)
# 72–80 结合返航：能量回升
for k, c in enumerate(['Bb', 'F', 'C']):
    t0 = 72.6 + k * BAR; add(music, pad(CH[c], BAR + 0.6, a=0.2, r=0.6, cutoff=1800), t0, 0.5)
    for b in range(4): add(music, kick(0.9), t0 + b * BEAT, 0.5 if b % 2 == 0 else 0.25)
    for h in range(8): add(music, hat(0.8), t0 + h * BEAT / 2, 0.45)
add(music, cymbal_swell(1.6), 78.4, 0.8)
# 80–93 高潮：救援出发、空中擦肩
for k, c in enumerate(['Dm', 'Bb', 'F', 'C', 'Dm']):
    t0 = 80.0 + k * BAR; add(music, pad(CH[c] + [CH[c][0] + 24], BAR + 0.8, a=0.15, r=0.8, cutoff=2600), t0, 0.55)
    bass = saw(mtof(BASS[c]), BAR * 0.95) * env(int(BAR * 0.95 * SR), 0.01, 0.3, 0.6, 0.2); add(music, lp(bass, 320), t0, 0.4)
    for b in range(4):
        tb = t0 + b * BEAT; add(music, kick(1.0), tb, 0.55); add(music, snare(0.9), tb + BEAT / 2, 0.3)
        for h in range(2): add(music, hat(1.0), tb + h * BEAT / 2, 0.5)
mel = [(80.0, 74, 1.2), (81.2, 72, 0.6), (81.8, 69, 0.6), (82.4, 70, 1.2), (83.6, 69, 0.6), (84.2, 65, 0.6), (84.8, 65, 1.2), (86.0, 67, 0.6), (86.6, 69, 1.8), (88.4, 72, 1.2), (89.6, 74, 2.4)]
for t0, m, d in mel:
    x = (saw(mtof(m), d + 0.3) * 0.5 + saw(mtof(m) * 1.003, d + 0.3) * 0.5) * env(int((d + 0.3) * SR), 0.06, 0.2, 0.8, 0.25); add(music, lp(x, 2800), t0, 0.14, pan=-0.1)
add(music, boom(1.0), 86.5, 0.7); add(music, cymbal_swell(2.0), 84.5, 0.9)
# 93–98 返回基站：落回 F 大调，温暖
add(music, pad(CH['F'] + [65, 69], 5.5, a=0.5, r=2.5, cutoff=2000), 92.6, 0.5)
for t0, m in [(93.4, 72), (94.6, 69), (95.8, 65), (97.0, 67)]: add(music, piano(m, 3.0, 0.7), t0, 0.55)
# 98–106 红点逐个变绿：钢琴与轻铺底，七声上行的钟声
GREEN = [98.8 + k * 0.85 for k in range(7)]
add(music, pad([38, 45, 50], 10.0, a=2.0, r=2.0, cutoff=900), 98.0, 0.38)
for k, m in enumerate([62, 64, 65, 67, 69, 70, 72]):
    add(music, piano(m - 12, 2.5, 0.5), GREEN[k], 0.38)
    add(sfx, bell(m + 12, 2.6, 0.9), GREEN[k], 0.5, pan=-0.3 + 0.1 * k)
# 106–109.5 推近最后一个红点：上升的张力，108.6 起静默，108.75 一声心跳；109.5 变绿
add(music, riser(2.6), 106.0, 0.45)
add(music, pad([50, 51, 57], 2.6, a=2.0, r=0.05, cutoff=1500), 106.0, 0.35)
add(sfx, heartbeat(1.0), 108.72, 0.95)
TURN = 109.5
fin = pad(CH['D'] + [66, 69, 74], 10.0, a=0.05, r=5.0, cutoff=3200); add(music, fin, TURN, 0.78)
for k, m in enumerate([62, 66, 69, 74]): add(music, piano(m, 6.0, 0.9), TURN + k * 0.02, 0.62)
add(music, boom(0.9, 5.0), TURN, 0.8); add(sfx, bell(86, 3.0, 0.8), TURN, 0.5)
add(music, boom(0.6, 4.0), 111.3, 0.5)
for t0, m in [(112.4, 74), (113.6, 73), (114.8, 69), (116.0, 74)]: add(music, piano(m, 4.0, 0.5), t0, 0.48)

# ———— 音效 ————
# 开场：风声、远处警笛，线条生长时的数字闪烁
add(sfx, wind(13.0, 450), 0.0, 0.5); add(sfx, siren(12.0) * np.linspace(0.3, 0.6, int(12 * SR)), 1.0, 0.12, pan=-0.5)
add(sfx, shimmer(4.6), 0.2, 1.0); add(sfx, ticks(4.0) * np.linspace(0.2, 1.0, int(4.0 * SR)), 0.4, 0.6, pan=0.15)
add(sfx, debris(1.8, 1), 3.4, 0.45, pan=0.4)
# s02 被截断的公路：警笛、低频轰鸣、碎石
add(sfx, lp(siren(4.4, period=1.1), 2500), 5.0, 0.35, pan=0.2); add(sfx, lp(noise(4.0), 120) * 0.4, 5.0, 0.5); add(sfx, debris(1.5, 2), 6.5, 0.4)
# s03 瓦砾里的手机：灰尘簌簌、手机振动、微弱敲击
add(sfx, lp(noise(4.0), 3000) * 0.04, 9.0, 1.0)
for t0 in [9.6, 10.05, 11.2, 11.65, 12.8]: add(sfx, buzz(0.36), t0, 0.55, pan=0.1)
for t0 in [10.6, 10.95, 12.2, 12.55]: add(sfx, knock(1.0), t0, 0.55, pan=-0.2)
# s04 擦除转场、基站亮灯、开舱
add(sfx, sweep(0.9), 12.95, 0.7, pan=-0.3)
add(sfx, beep(1320, 0.1), 13.5, 0.6); add(sfx, beep(1760, 0.14), 13.65, 0.6)
add(sfx, lp(noise(2.6), 900) * env(int(2.6 * SR), 0.3, 0.2, 0.8, 0.5) * 0.25, 14.0, 0.6)
# s05 平台升起、旋翼启动、起飞
add(sfx, servo(2.4, 180, 260), 16.4, 0.6)
spd = np.clip((T(4.0) - 0.3) / 1.8, 0, 1); add(sfx, rotor(4.0, 118, spd), 17.0, 1.0)
add(sfx, whoosh(1.6, vel=0.8), 19.2, 0.7)
# s06 低空飞越车队，飞入烟尘
add(sfx, rotor(5.0, 118) + wind(5.0, 900) * 0.6, 21.0, 0.9, pan=-0.1); add(sfx, lp(siren(5.0, period=1.1), 1500), 21.0, 0.12, pan=0.5)
add(sfx, lp(noise(1.5), 600) * np.linspace(0, 0.5, int(1.5 * SR)), 24.5, 0.8)
# s07 从烟尘中飞出、降落
add(sfx, rotor(4.0, 118) * np.linspace(0.5, 1.2, int(4 * SR)) + lp(noise(4.0), 700) * np.linspace(0.1, 0.5, int(4 * SR)), 26.0, 0.9)
add(sfx, clunk(0.6), 29.9, 0.6)
# s08 落地展开：旋翼减速、舵机、锁扣
spd = np.clip(1 - T(4.0) / 3.0, 0.3, 1); add(sfx, rotor(4.0, 118, spd), 30.0, 0.9)
for t0 in [30.2, 30.5, 30.8, 31.1, 31.4]: add(sfx, servo(0.28, 600, 900), t0, 0.5, pan=np.sin(t0 * 7) * 0.5)
add(sfx, click(1.0), 31.9, 0.8); add(sfx, clunk(0.5), 31.95, 0.5); add(sfx, beep(2000, 0.08), 32.05, 0.5)
add(sfx, servo(1.0, 420, 300), 32.5, 0.4)
# s09 无人机升空
spd = np.clip(0.35 + T(4.0) / 0.5, 0, 1); add(sfx, rotor(4.0, 118, spd) * np.linspace(1.0, 0.5, int(4 * SR)), 34.0, 0.9); add(sfx, whoosh(2.0, vel=0.6), 35.0, 0.5)
# s10 无人机视角：画面刷新、测绘扫描、发现可疑区域、规划路线
add(sfx, sweep(0.5, 800, 9000), 37.95, 0.6); add(sfx, blip(2400, 0.05), 38.3, 0.8); add(sfx, blip(3000, 0.05), 38.38, 0.8)
add(sfx, sine(220, 4.0) * 0.02 + bp(noise(4.0), 2000, 4000) * 0.01, 38.0, 1.0)
add(sfx, sweep(3.2, 300, 3000) * 0.6, 38.2, 0.6, pan=0.2)
add(sfx, beep(1500, 0.12), 39.7, 0.8); add(sfx, beep(1100, 0.16), 39.85, 0.8)
for k in range(10): add(sfx, blip(1200 + 120 * k, 0.04, 0.8), 40.2 + k * 0.12, 0.6, pan=0.3)
# s11 画面切回、机械足步（每秒 4 次落足）
add(sfx, sweep(0.5, 800, 9000), 41.95, 0.5)
for k in range(24):
    t0 = 42.05 + k * 0.25; add(sfx, servo(0.12, 700, 820), t0 - 0.06, 0.7, pan=(-1) ** k * 0.3)
    add(sfx, lp(noise(0.06), 1800) * expdecay(int(0.06 * SR), 0.012) * 0.5, t0, 1.3, pan=(-1) ** k * 0.3)
# s12 停下、展开探测模块、扫描波纹
add(sfx, servo(1.2, 300, 520), 48.0, 0.7)
add(sfx, sine(95, 2.6) * 0.15 * env(int(2.6 * SR), 0.4, 0.1, 1, 0.3), 48.6, 0.8)
for t0 in [48.8, 49.9, 51.0]: add(sfx, sine(1250, 1.2) * expdecay(int(1.2 * SR), 0.25) * 0.25, t0, 0.6)
# s13 发现生命体征：心跳、提示音
for t0 in [51.6, 52.4, 53.2]: add(sfx, heartbeat(1.0), t0, 0.8)
add(sfx, beep(1900, 0.09), 51.9, 0.7); add(sfx, beep(1900, 0.09), 52.05, 0.7)
# s14 升起：长呼啸；各处红点依次亮起
add(sfx, whoosh(4.0, vel=0.7), 55.0, 0.6)
for k in range(7): add(sfx, blip(1400 + 110 * k, 0.07, 0.9), 59.02 + k * 0.12, 0.7, pan=-0.4 + 0.12 * k)
add(sfx, sweep(1.0, 400, 5000), 58.9, 0.35)
# s15 指挥大厅：快速后拉、机房低频嗡声、零星提示音
add(sfx, whoosh(1.0, vel=0.8), 59.9, 0.5)
add(sfx, lp(noise(8.0), 200) * 0.15 + sine(100, 8.0) * 0.01, 60.0, 0.6)
for t0 in [61.6, 62.9, 64.1]: add(sfx, blip(2200, 0.05, 0.6), t0, 0.5, pan=0.4)
# s16 推回大屏、选中六足机器人
add(sfx, whoosh(1.6, vel=0.9) + hp(noise(1.6), 3000) * np.sin(np.pi * T(1.6) / 1.6) * 0.06, 65.0, 0.75)
add(sfx, blip(1600, 0.06), 65.9, 0.8); add(sfx, blip(2400, 0.08), 66.0, 0.8)
# s17 分三段下降
for a, b in [(0.1, 0.55), (0.85, 1.3), (1.6, 2.3)]:
    add(sfx, whoosh(b - a + 0.3, vel=1.0), 68.0 + a - 0.15, 0.9); add(sfx, boom(0.8, 2.0), 68.0 + b - 0.05, 0.55)
add(sfx, rotor(2.8, 118) * np.linspace(0, 1, int(2.8 * SR)), 69.2, 0.8)
# s18 结合：锁扣扣合、收腿
add(sfx, rotor(4.0, 118), 72.0, 0.8); add(sfx, clunk(1.0), 73.95, 0.8); add(sfx, click(1.0), 74.15, 0.8); add(sfx, bell(84, 1.2, 0.6), 74.35, 0.4)
for t0 in [74.4, 74.8, 75.2]: add(sfx, servo(0.35, 700, 520), t0, 0.45)
# s19 结合体升空离开
add(sfx, rotor(4.0, 118) * np.linspace(1.0, 0.2, int(4 * SR)), 76.0, 0.9); add(sfx, whoosh(2.5, vel=0.7), 77.4, 0.6)
# s20 机场：擦除转场、直升机、队员奔跑
add(sfx, sweep(0.9), 79.95, 0.7, pan=-0.3)
add(sfx, heli(4.2), 80.0, 1.8)
for k in range(10): add(sfx, lp(noise(0.05), 1200) * expdecay(int(0.05 * SR), 0.01) * 0.6, 80.1 + k * 0.17, 0.8, pan=-0.4)
add(sfx, whoosh(2.0, vel=0.6), 81.9, 0.5)
# s21 擦肩而过：直升机由右到左，结合体由左到右，交汇在 86.5 秒
tt = T(5.0); g = np.exp(-((tt - 2.5) / 1.1) ** 2)
h = heli(5.0) * (0.25 + 0.95 * g); pan = np.clip((2.5 - tt) / 1.6, -0.9, 0.9)
add(sfx, np.stack([h * np.cos((pan + 1) * np.pi / 4), h * np.sin((pan + 1) * np.pi / 4)], 1), 84.0, 0.9)
r = rotor(5.0, 118) * (0.2 + 0.9 * g); add(sfx, np.stack([r * np.cos((-pan + 1) * np.pi / 4), r * np.sin((-pan + 1) * np.pi / 4)], 1), 84.0, 0.9)
add(sfx, whoosh(1.4, vel=1.0), 85.8, 0.8)
# s22 擦除转场、降落基站、平台下降
add(sfx, sweep(0.9), 88.95, 0.7, pan=-0.3)
add(sfx, rotor(4.0, 118, np.clip(1.6 - T(4.0) / 2.5, 0.0, 1)), 89.0, 0.9); add(sfx, clunk(0.9), 91.8, 0.7); add(sfx, servo(1.2, 200, 150), 92.0, 0.6)
# s23 平台下降、舱盖合拢、充电
add(sfx, servo(1.8, 200, 140), 93.0, 0.6); add(sfx, lp(noise(2.6), 1000) * env(int(2.6 * SR), 0.3, 0.2, 0.8, 0.4) * 0.3, 94.4, 0.6); add(sfx, clunk(1.0), 97.0, 0.8)
for k, m in enumerate([76, 79, 84]): add(sfx, bell(m, 1.4, 0.5), 96.45 + k * 0.16, 0.35)
# s24~s25 大厅：低频嗡声，推近时的风声
add(sfx, lp(noise(11.0), 180) * 0.12, 98.0, 0.6)
add(sfx, whoosh(0.6, vel=0.8), 109.1, 0.6)

music = reverb(music, 2.8, 0.32); sfx = reverb(sfx, 1.6, 0.18, seed=5)
for name, buf in [('v2_music', music), ('v2_sfx', sfx)]:
    buf /= max(1e-9, np.max(np.abs(buf))) / 0.9
    sf.write(f'build/{name}.wav', buf.astype(np.float32), SR); print('wrote', name, buf.shape)
