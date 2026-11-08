# 用 Piper（华燕女声）合成旁白与对讲机台词；按时间槽自动调整语速，输出 48kHz 单声道 wav 和时长表
import json, numpy as np, soundfile as sf
from scipy.signal import resample_poly
from piper import PiperVoice
from piper.config import SynthesisConfig
from lines import NARRATION, SLOTS, RADIO

voice = PiperVoice.load("models/zh_CN-huayan-medium.onnx")
def synth(text, length_scale=1.0):
    cfg = SynthesisConfig(length_scale=length_scale, noise_scale=0.6, noise_w_scale=0.75)
    chunks = list(voice.synthesize(text, syn_config=cfg))
    a = np.concatenate([c.audio_float_array for c in chunks]).astype(np.float32)
    sr = chunks[0].sample_rate
    a = resample_poly(a, 160, 147 * 160 // 147 if False else 1) if False else resample_poly(a, 320, 147)  # 22050 → 48000
    # 去掉首尾静音
    thr = 0.01 * np.max(np.abs(a)); idx = np.where(np.abs(a) > thr)[0]
    return a[max(0, idx[0] - 400): idx[-1] + 2400]

out = []
for i, ((start, text, tts), slot) in enumerate(zip(NARRATION, SLOTS)):
    ls = 1.22  # 宣传片旁白放慢、更沉稳
    a = synth(tts or text, ls)
    while len(a) / 48000 > slot * 0.95 and ls > 0.8:
        ls -= 0.04; a = synth(tts or text, ls)
    sf.write(f"build/narr_{i:02d}.wav", a, 48000)
    out.append({"i": i, "start": start, "text": text, "dur": round(len(a) / 48000, 2), "slot": slot, "length_scale": round(ls, 2)})
    print(f"{i:02d} {start:6.1f}s dur {len(a)/48000:4.2f}s / slot {slot}s  ls={ls:.2f}  {text}")
radio = []
for j, (start, text) in enumerate(RADIO):
    a = synth(text, 0.95); sf.write(f"build/radio_{j}.wav", a, 48000)
    radio.append({"start": start, "text": text, "dur": round(len(a) / 48000, 2)}); print("radio", start, len(a) / 48000, text)
json.dump({"narration": out, "radio": radio}, open("build/narration.json", "w"), ensure_ascii=False, indent=1)
