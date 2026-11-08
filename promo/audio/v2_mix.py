# 第二版混音：只有配乐和音效（不要旁白、不要字幕），软限幅后输出 build/v2_mix.wav
import numpy as np, soundfile as sf
from dsp import SR

DUR = 120.0; N = int(DUR * SR)
music, _ = sf.read('build/v2_music.wav'); sfx, _ = sf.read('build/v2_sfx.wav')
mix = music[:N] * 0.7 + sfx[:N] * 0.78
mix[: int(0.3 * SR)] *= np.linspace(0, 1, int(0.3 * SR))[:, None]
mix[-int(1.2 * SR):] *= np.linspace(1, 0, int(1.2 * SR))[:, None]
mix = mix * (0.12 / np.sqrt(np.mean(mix ** 2)))
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= max(1.0, np.max(np.abs(mix)) / 0.97)
sf.write('build/v2_mix.wav', mix.astype(np.float32), SR)
print('mix rms %.3f peak %.3f' % (np.sqrt(np.mean(mix ** 2)), np.max(np.abs(mix))))
