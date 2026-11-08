# 第三版旁白：沿用第一版文案，改用微软神经网络语音（云健，男声，语调自然），对讲机两句用晓晓和云希。
# 生成 48kHz 单声道 wav 与时长表 build/v3_narration.json；若某句超出时间槽，略微加快语速重试。
import asyncio, json, ssl, subprocess, numpy as np, soundfile as sf
import edge_tts, edge_tts.communicate as ec
ec._SSL_CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')  # 走代理时信任代理证书

NARR_VOICE = 'zh-CN-YunjianNeural'
# (开始时间, 显示文本, 送给语音合成的文本或 None, 最长可用时长)
NARRATION = [
    (4.4, "灾后的黄金72小时，每一分钟都关乎生命。", "灾后的黄金七十二小时，每一分钟都关乎生命。", 4.2),
    (8.8, "道路中断，救援难以抵达；废墟之下，生命难以发现。", None, 5.7),
    (14.9, "六合，接到任务，即刻出发。", None, 2.9),
    (18.0, "六足机器人与六轴无人机合为一体，飞越阻断的道路，直抵灾区。", None, 6.4),
    (31.8, "抵达灾区，空地分离。", None, 3.2),
    (35.2, "无人机升空侦察，掌握全局；", None, 3.6),
    (41.8, "六足机器人深入废墟，在碎石间稳步前行。", None, 4.0),
    (46.0, "生命探测系统启动，捕捉废墟下微弱的生命信号。", None, 5.6),
    (53.0, "每一个生命信号，都通过基站实时传回指挥中心。", None, 5.6),
    (59.4, "每一个红点，都是一个等待救援的人。", None, 3.4),
    (70.5, "搜寻完成，重新结合，返航。", None, 3.0),
    (81.6, "它们负责找到，救援队负责带回。", None, 3.7),
    (90.0, "回到基站，充电、防护，随时准备下一次出发。", None, 4.8),
    (111.7, "上天入地，不放弃每一个生命。", None, 4.5),
]
RADIO = [(77.0, "八处坐标已发送。", 'zh-CN-XiaoxiaoNeural'), (78.7, "收到，救援直升机起飞。", 'zh-CN-YunxiNeural')]

async def tts(text, voice, rate, path):
    c = edge_tts.Communicate(text, voice, rate=rate); await c.save(path + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path + '.mp3', '-ar', '48000', '-ac', '1', path], check=True)
    a, sr = sf.read(path); thr = 0.01 * np.max(np.abs(a)); idx = np.where(np.abs(a) > thr)[0]
    a = a[max(0, idx[0] - 480): idx[-1] + 3600]; sf.write(path, a.astype(np.float32), 48000); return len(a) / 48000

async def main():
    out = []
    for i, (start, text, t2, slot) in enumerate(NARRATION):
        for rate in ['-4%', '+0%', '+5%', '+10%', '+15%']:
            d = await tts(t2 or text, NARR_VOICE, rate, f'build/v3_narr_{i:02d}.wav')
            if d <= slot: break
        out.append({'i': i, 'start': start, 'text': text, 'dur': round(d, 2), 'slot': slot, 'rate': rate})
        print(f'{i:02d} {start:6.1f}s  {d:4.2f}s/{slot}s  {rate}  {text}')
    radio = []
    for j, (start, text, voice) in enumerate(RADIO):
        d = await tts(text, voice, '+5%', f'build/v3_radio_{j}.wav'); radio.append({'start': start, 'text': text, 'dur': round(d, 2)}); print('radio', start, d, text)
    json.dump({'narration': out, 'radio': radio}, open('build/v3_narration.json', 'w'), ensure_ascii=False, indent=1)

asyncio.run(main())
