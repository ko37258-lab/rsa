# 쇼츠 광고용 배경음악 합성 (저작권 걱정 없는 자체 제작 음원)
# 120 BPM, C - G - Am - F 진행, 킥/하이햇/베이스/패드/플럭 아르페지오
import numpy as np, wave, sys

SR = 44100
DUR = 27.6
BPM = 120
BEAT = 60 / BPM
N = int(SR * DUR)
t = np.arange(N) / SR
out = np.zeros((N, 2))

def midi(m): return 440 * 2 ** ((m - 69) / 12)
def env(n, a=0.01, r=0.3):
    x = np.arange(n) / SR
    return np.minimum(1, x / a) * np.exp(-x / r)
def add(buf, start, sig, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    buf[i:i + len(sig), 0] += sig * (1 - pan) ** 0.5
    buf[i:i + len(sig), 1] += sig * (1 + pan) ** 0.5
def lp(x, a=0.08):  # 1차 저역통과
    y = np.zeros_like(x); s = 0.0
    for i in range(len(x)):
        s += a * (x[i] - s); y[i] = s
    return y

chords = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]]  # C G Am F
roots = [36, 43, 45, 41]
bar = 4 * BEAT
rng = np.random.default_rng(1)

# 패드 (마디마다, 디튠 톱니 + 저역통과)
for b in range(int(DUR / bar) + 1):
    ch = chords[b % 4]; n = int(bar * SR * 1.05); x = np.arange(n) / SR
    pad = np.zeros(n)
    for m in ch:
        for d in (-0.08, 0.08):
            ph = (midi(m + d) * x) % 1.0
            pad += 2 * ph - 1
    pad = lp(pad / 8, 0.05) * np.minimum(1, x / 0.3) * np.minimum(1, (bar * 1.05 - x) / 0.2)
    add(out, b * bar, pad, 0, 0.22)

steps = int(DUR / (BEAT / 2))
for s in range(steps):
    st = s * BEAT / 2; b = int(st / bar) % 4
    beat_i = s // 2
    # 킥 (매 박)
    if s % 2 == 0 and st > 0.4:
        n = int(0.35 * SR); x = np.arange(n) / SR
        f = 50 + 90 * np.exp(-x * 30)
        add(out, st, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 9), 0, 0.55)
    # 클랩 (2, 4박)
    if s % 4 == 2 and st > 0.4:
        n = int(0.18 * SR); x = np.arange(n) / SR
        add(out, st, rng.standard_normal(n) * np.exp(-x * 22), 0.1, 0.12)
    # 하이햇 (엇박)
    if s % 2 == 1:
        n = int(0.06 * SR); x = np.arange(n) / SR
        hh = rng.standard_normal(n); hh = hh - lp(hh, 0.5)
        add(out, st, hh * np.exp(-x * 60), 0.3, 0.10)
    # 베이스 (8분음)
    n = int(BEAT / 2 * SR * 0.9); x = np.arange(n) / SR
    m = roots[b] + (12 if s % 4 == 3 else 0)
    bs = np.sin(2 * np.pi * midi(m) * x) + 0.3 * np.sin(4 * np.pi * midi(m) * x)
    add(out, st, bs * env(n, 0.005, 0.18), 0, 0.28)
    # 플럭 아르페지오
    ch = chords[b]; m = ch[[0, 2, 1, 3, 2, 1, 3, 2][s % 8]] + 12
    n = int(0.4 * SR); x = np.arange(n) / SR
    pl = np.sin(2 * np.pi * midi(m) * x + 0.6 * np.sin(2 * np.pi * midi(m) * 2 * x) * np.exp(-x * 8))
    add(out, st, pl * env(n, 0.003, 0.12), -0.3 if s % 2 else 0.3, 0.11)

# 시작 페이드인, 끝 2초 페이드아웃
out *= np.minimum(1, t / 0.3)[:, None]
out *= np.clip((DUR - t) / 2.0, 0, 1)[:, None]
out /= np.abs(out).max() * 1.12
pcm = (out * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'bgm.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
