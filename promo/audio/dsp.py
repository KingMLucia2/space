# 合成用的小工具：振荡器、包络、滤波、混响、各类乐器与音效
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(7)

def T(d): return np.arange(int(d * SR)) / SR
def env(n, a=0.01, d=0.1, s=0.7, r=0.2, hold=None):
    a, d, r = int(a * SR), int(d * SR), int(r * SR); e = np.ones(n) * s
    e[:a] = np.linspace(0, 1, a, endpoint=False) if a else e[:a]
    e[a:a + d] = np.linspace(1, s, len(e[a:a + d]))
    if r: e[-r:] *= np.linspace(1, 0, len(e[-r:]))
    return e
def expdecay(n, tau): return np.exp(-np.arange(n) / (tau * SR))
def lp(x, fc, order=2): return sosfilt(butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos'), x, axis=0)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x, axis=0)
def bp(x, f1, f2, order=2): return sosfilt(butter(order, [f1, min(f2, SR * 0.45)], 'band', fs=SR, output='sos'), x, axis=0)
def noise(d): return rng.standard_normal(int(d * SR))
def saw(f, d, phase=0.0):
    t = T(d); ph = (f * t + phase) % 1.0 if np.isscalar(f) else (np.cumsum(f) / SR + phase) % 1.0
    return 2 * ph - 1
def sine(f, d, phase=0.0):
    if np.isscalar(f): return np.sin(2 * np.pi * (f * T(d) + phase))
    return np.sin(2 * np.pi * (np.cumsum(f) / SR + phase))
def stereo(x, pan=0.0):
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l, x * r], axis=1) if x.ndim == 1 else x
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)

def reverb(x, secs=2.6, wet=0.3, damp=4000, seed=3):
    r = np.random.default_rng(seed); n = int(secs * SR)
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)], 1) * np.exp(-np.arange(n) / (secs / 6.9 * SR))[:, None]
    ir = lp(ir, damp); ir /= np.sqrt(np.sum(ir ** 2, 0, keepdims=True)) + 1e-9
    xs = stereo(x) if x.ndim == 1 else x
    y = np.stack([fftconvolve(xs[:, k], ir[:, k])[:len(xs)] for k in range(2)], 1)
    return xs * (1 - wet) + y * wet

# —— 乐器 ——
def pad(notes, d, a=1.5, r=2.0, cutoff=1600, detune=0.12, bright=0.0):
    out = np.zeros((int(d * SR), 2))
    for m in notes:
        f = mtof(m)
        for k, (dt, pan) in enumerate([(-detune, -0.6), (0.0, 0.0), (detune, 0.6)]):
            x = saw(f * 2 ** (dt / 12), d, phase=k * 0.31) * 0.6 + sine(f * 0.5, d) * 0.25
            out += stereo(x, pan)
    out = lp(out, cutoff * (1 + bright)) * env(len(out), a, 0.5, 1.0, r)[:, None]
    return out / (len(notes) * 3)
def piano(m, d=3.5, vel=1.0):
    f = mtof(m); t = T(d); x = np.zeros_like(t)
    for n in range(1, 9):
        fn = f * n * np.sqrt(1 + 0.0004 * n * n)
        x += np.sin(2 * np.pi * fn * t) * (1 / n ** 1.4) * np.exp(-t * (0.9 + n * 0.55))
    x += lp(noise(d), 3000) * np.exp(-t * 60) * 0.05
    return x * vel * 0.35
def bell(m, d=3.0, vel=1.0):
    f = mtof(m); t = T(d); x = np.zeros_like(t)
    for ratio, amp, tau in [(1, 1, 1.6), (2.0, 0.55, 1.1), (2.76, 0.4, 0.8), (5.4, 0.25, 0.4), (8.93, 0.12, 0.25)]:
        x += np.sin(2 * np.pi * f * ratio * t) * amp * np.exp(-t / tau)
    return x * env(len(t), 0.002, 0.01, 1, 0.05) * vel * 0.3
def kick(vel=1.0):
    t = T(0.6); f = 45 + 95 * np.exp(-t * 30)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6) + lp(noise(0.6), 2500) * np.exp(-t * 90) * 0.3
    return np.tanh(x * 1.6) * vel * 0.8
def tom(m=43, vel=1.0):
    t = T(1.2); f = mtof(m) * (1 + 0.6 * np.exp(-t * 20))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.5) + bp(noise(1.2), 80, 600) * np.exp(-t * 18) * 0.4
    return np.tanh(x * 1.4) * vel * 0.7
def snare(vel=1.0):
    t = T(0.4); x = bp(noise(0.4), 900, 7000) * np.exp(-t * 18) * 0.7 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return x * vel * 0.5
def hat(vel=1.0):
    t = T(0.12); return hp(noise(0.12), 7000) * np.exp(-t * 60) * vel * 0.15
def boom(vel=1.0, d=3.5):
    t = T(d); f = 32 + 40 * np.exp(-t * 8)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.2) + lp(noise(d), 300) * np.exp(-t * 4) * 0.4
    return np.tanh(x * 2) * vel * 0.8
def cymbal_swell(d=2.0):
    t = T(d); return hp(noise(d), 4000) * (t / d) ** 3 * 0.25

# —— 音效 ——
def wind(d, base=500, depth=0.6, seed=1):
    r = np.random.default_rng(seed); n = int(d * SR)
    g = lp(r.standard_normal(n // 4800 + 3), 0.5 * 10) if False else None
    x = lp(noise(d), base)
    gust = 0.6 + depth * 0.4 * np.sin(2 * np.pi * T(d) * 0.13 + seed) * np.sin(2 * np.pi * T(d) * 0.071)
    return x * gust * 0.5
def siren(d, hi=960, lo=770, period=1.3):
    t = T(d); f = np.where((t % period) < period / 2, hi, lo).astype(float)
    f = lp(f, 8)  # 平滑过渡
    x = sine(f, d) * 0.6 + sine(f * 2, d) * 0.25 + sine(f * 3, d) * 0.1
    return x * 0.3
def rotor(d, f0=118, speed=None, seed=2):
    t = T(d); s = np.ones_like(t) if speed is None else speed
    f = f0 * (0.25 + 0.75 * s)
    x = sum(sine(f * k, d, phase=0.1 * k) / k ** 1.2 for k in range(1, 7))
    x += bp(noise(d), 200, 3000) * 0.35
    am = 1 + 0.12 * np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR)
    return x * am * s * 0.18
def heli(d, rate=21.0):
    t = T(d); ph = (t * rate) % 1.0
    slap = bp(noise(d), 60, 500) * np.exp(-ph * 9) * 1.4
    turbine = sine(2350 + 30 * np.sin(t * 0.7), d) * 0.04 + sine(4700, d) * 0.015
    return (slap + turbine + lp(noise(d), 900) * 0.15) * 0.45
def servo(d, f0=520, f1=780):
    t = T(d); f = np.linspace(f0, f1, len(t)) + 25 * np.sin(2 * np.pi * 9 * t)
    x = np.sign(sine(f, d)) * 0.15 + sine(f * 2, d) * 0.1 + bp(noise(d), 1500, 6000) * 0.05
    return lp(x, 4000) * env(len(t), 0.03, 0.05, 0.9, 0.06) * 0.35
def click(vel=1.0):
    t = T(0.08); return (hp(noise(0.08), 2000) * np.exp(-t * 150) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 80) * 0.5) * vel * 0.5
def clunk(vel=1.0):
    t = T(0.5); return (np.sin(2 * np.pi * 160 * t) * np.exp(-t * 14) + bp(noise(0.5), 300, 2500) * np.exp(-t * 30) * 0.6) * vel * 0.7
def beep(f=1600, d=0.12, vel=1.0):
    return sine(f, d) * env(int(d * SR), 0.005, 0.02, 0.8, 0.03) * vel * 0.2
def heartbeat(vel=1.0):
    def thump(a):
        t = T(0.35); return np.sin(2 * np.pi * (48 + 30 * np.exp(-t * 25)) * t) * np.exp(-t * 11) * a
    x = np.zeros(int(0.8 * SR)); x[:len(thump(1))] += thump(1.0); o = int(0.27 * SR); x[o:o + len(thump(1))] += thump(0.7)
    return np.tanh(x * 1.5) * vel * 0.8
def knock(vel=1.0):
    t = T(0.25); return lp(np.sin(2 * np.pi * 135 * t) * np.exp(-t * 28) + noise(0.25) * np.exp(-t * 60) * 0.5, 900) * vel * 0.6
def buzz(d=0.35):
    t = T(d); x = np.sign(np.sin(2 * np.pi * 175 * t)) * 0.3 * (0.6 + 0.4 * np.sin(2 * np.pi * 31 * t))
    return lp(x, 900) * env(len(t), 0.01, 0.02, 1, 0.03) * 0.25
def whoosh(d=1.0, f0=300, f1=4000, vel=1.0):
    t = T(d); n = noise(d); out = np.zeros_like(n)
    seg = int(0.02 * SR)
    for i in range(0, len(n), seg):
        k = i / len(n); fc = f0 * (f1 / f0) ** k
        out[i:i + seg] = n[i:i + seg]
    out = bp(out, 150, 6000)
    shape = np.sin(np.pi * t / d) ** 2
    return lp(out, 2500) * shape * vel * 0.5
def riser(d=2.0):
    t = T(d); f = 200 * (8 ** (t / d)); return (sine(f, d) * 0.2 + hp(noise(d), 1500) * 0.3) * (t / d) ** 2 * 0.5
def debris(d=1.2, seed=0):
    r = np.random.default_rng(seed); x = np.zeros(int(d * SR))
    for _ in range(40):
        p = int(r.random() * (len(x) - 4000)); g = lp(r.standard_normal(3000), 1200 + r.random() * 2000) * np.exp(-np.arange(3000) / 500) * r.random()
        x[p:p + 3000] += g
    return x * np.exp(-T(d) * 1.5) * 0.6
def radio(x):
    y = bp(x, 350, 3000, 4); y = np.tanh(y * 3) * 0.5; y += bp(noise(len(y) / SR), 500, 4000) * 0.02
    return y
