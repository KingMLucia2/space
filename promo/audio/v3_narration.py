# 第三版旁白：沿用第一版文案，用微软神经网络女声“晓晓”；对讲机：调度员“晓伊”（女）、飞行员“云希”（男）。
# 送给语音合成的文本里处理多音字和断句（字幕仍显示原文）：
#   “六合”是专名，合成时写成“六和”，避免读成南京地名的 lù；“空地分离”写成“空、地分离”，避免读成 kòng dì（空地）；
#   长句在自然停顿处补逗号。另记录逐词时间，用于检查关键字的读音。
import asyncio, json, ssl, subprocess, numpy as np, soundfile as sf
import edge_tts, edge_tts.communicate as ec
ec._SSL_CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')  # 走代理时信任代理证书

NARR_VOICE = 'zh-CN-XiaoxiaoNeural'
# (开始时间, 显示文本, 合成文本, 最长可用时长)
NARRATION = [
    (4.4, "灾后的黄金72小时，每一分钟都关乎生命。", "灾后的黄金七十二小时，每一分钟，都关乎生命。", 4.3),
    (8.8, "道路中断，救援难以抵达；废墟之下，生命难以发现。", "道路中断，救援难以抵达；废墟之下，生命难以发现。", 5.9),
    (14.9, "六合，接到任务，即刻出发。", "六和，接到任务，即刻出发。", 3.0),
    (18.0, "六足机器人与六轴无人机合为一体，飞越阻断的道路，直抵灾区。", "六足机器人，与六轴无人机合为一体，飞越阻断的道路，直抵灾区。", 6.6),
    (31.8, "抵达灾区，空地分离。", "抵达灾区，空、地分离。", 3.3),
    (35.2, "无人机升空侦察，掌握全局；", "无人机升空侦察，掌握全局。", 3.7),
    (41.8, "六足机器人深入废墟，在碎石间稳步前行。", "六足机器人深入废墟，在碎石间，稳步前行。", 4.1),
    (46.0, "生命探测系统启动，捕捉废墟下微弱的生命信号。", "生命探测系统启动，捕捉废墟下，微弱的生命信号。", 5.8),
    (53.0, "每一个生命信号，都通过基站实时传回指挥中心。", "每一个生命信号，都通过基站，实时传回指挥中心。", 5.8),
    (59.4, "每一个红点，都是一个等待救援的人。", "每一个红点，都是一个，等待救援的人。", 3.5),
    (70.5, "搜寻完成，重新结合，返航。", "搜寻完成，重新结合，返航。", 3.1),
    (81.6, "它们负责找到，救援队负责带回。", "它们负责找到，救援队，负责带回。", 3.8),
    (90.0, "回到基站，充电、防护，随时准备下一次出发。", "回到基站，充电、防护，随时准备，下一次出发。", 5.0),
    (111.7, "上天入地，不放弃每一个生命。", "上天入地，不放弃每一个生命。", 4.6),
]
RADIO = [(77.0, "八处坐标已发送。", 'zh-CN-XiaoyiNeural'), (78.7, "收到，救援直升机起飞。", 'zh-CN-YunxiNeural')]

async def tts(text, voice, rate, path, words=None):
    c = edge_tts.Communicate(text, voice, rate=rate, boundary='WordBoundary'); audio = bytearray()
    async for m in c.stream():
        if m['type'] == 'audio': audio += m['data']
        elif m['type'] == 'WordBoundary' and words is not None: words.append({'text': m['text'], 't0': m['offset'] / 1e7, 'dur': m['duration'] / 1e7})
    open(path + '.mp3', 'wb').write(bytes(audio))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path + '.mp3', '-ar', '48000', '-ac', '1', path], check=True)
    a, sr = sf.read(path); thr = 0.01 * np.max(np.abs(a)); idx = np.where(np.abs(a) > thr)[0]; cut = max(0, idx[0] - 480)
    a = a[cut: idx[-1] + 3600]; sf.write(path, a.astype(np.float32), 48000)
    if words is not None:
        for w in words: w['t0'] = round(w['t0'] - cut / 48000, 3)
    return len(a) / 48000

async def main():
    out = []
    for i, (start, text, t2, slot) in enumerate(NARRATION):
        for rate in ['-6%', '-3%', '+0%', '+5%', '+10%']:
            words = []; d = await tts(t2, NARR_VOICE, rate, f'build/v3_narr_{i:02d}.wav', words)
            if d <= slot: break
        out.append({'i': i, 'start': start, 'text': text, 'tts': t2, 'dur': round(d, 2), 'slot': slot, 'rate': rate, 'words': words})
        print(f'{i:02d} {start:6.1f}s  {d:4.2f}s/{slot}s  {rate}  {t2}')
    radio = []
    for j, (start, text, voice) in enumerate(RADIO):
        d = await tts(text, voice, '+3%', f'build/v3_radio_{j}.wav'); radio.append({'start': start, 'text': text, 'dur': round(d, 2)}); print('radio', start, round(d, 2), voice, text)
    json.dump({'narration': out, 'radio': radio}, open('build/v3_narration.json', 'w'), ensure_ascii=False, indent=1)

asyncio.run(main())
