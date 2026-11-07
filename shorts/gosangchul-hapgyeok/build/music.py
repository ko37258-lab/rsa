# 오리지널 비트 합성 (저작권 걱정 없는 자체 제작 음원) — 128.57 BPM, 30fps 기준 1박 = 14프레임
import numpy as np, sys, json
from scipy.signal import butter, sosfilt, fftconvolve
import wave

SR = 48000
BEAT = 14 / 30.0           # 0.466667 s
TOTAL_BEATS = 24
DUR = TOTAL_BEATS * BEAT    # 11.2 s
N = int(round(DUR * SR))
rng = np.random.default_rng(7)

def bs(b):  # beat -> sample
    return int(round(b * BEAT * SR))

def sos(kind, f, order=2):
    return butter(order, f, btype=kind, fs=SR, output='sos')

def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)

class Bus:
    def __init__(self):
        self.L = np.zeros(N + SR * 3); self.R = np.zeros(N + SR * 3)
    def add(self, x, at, gain=1.0, pan=0.0):
        if at < 0: x = x[-at:]; at = 0
        n = min(len(x), len(self.L) - at)
        if n <= 0: return
        l = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
        r = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        if x.ndim == 2:
            self.L[at:at+n] += x[0, :n] * l; self.R[at:at+n] += x[1, :n] * r
        else:
            self.L[at:at+n] += x[:n] * l; self.R[at:at+n] += x[:n] * r

def env(n, a=0.002, d=0.2, sustain=0.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * (sustain + (1 - sustain) * np.exp(-t / d))
    return e

# ---------- 악기 ----------
def kick(big=False):
    n = int(SR * (0.6 if big else 0.42)); t = np.arange(n) / SR
    f = 50 + 170 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * (4.5 if big else 7.5))
    click = sosfilt(sos('highpass', 2500), rng.standard_normal(n)) * np.exp(-t * 400) * 0.18
    return np.tanh((x + click) * 1.6) * 0.9

def clap():
    n = int(SR * 0.35); t = np.arange(n) / SR
    nz = sosfilt(sos('bandpass', [900, 4200]), rng.standard_normal(n))
    e = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR); e[i:] += np.exp(-(t[:n-i]) * 180) * (0.8 if k < 2 else 1)
    e += np.exp(-t * 14) * 0.35
    snare_body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return (nz * e * 0.5 + snare_body)

def hat(open_=False):
    n = int(SR * (0.22 if open_ else 0.05)); t = np.arange(n) / SR
    nz = sosfilt(sos('highpass', 7500), rng.standard_normal(n))
    return nz * np.exp(-t * (14 if open_ else 90)) * 0.19

def saw(f, n, detune=0.0, phase=0.0):
    t = np.arange(n) / SR
    ph = (f * (1 + detune) * t + phase) % 1.0
    return 2 * ph - 1

def supersaw(freqs, n, voices=7, spread=0.012):
    out = np.zeros((2, n))
    for f in freqs:
        for v in range(voices):
            d = (v - (voices - 1) / 2) / ((voices - 1) / 2) * spread
            s = saw(f, n, d, rng.random())
            pan = (v - (voices - 1) / 2) / ((voices - 1) / 2) * 0.8
            out[0] += s * np.cos((pan + 1) * np.pi / 4); out[1] += s * np.sin((pan + 1) * np.pi / 4)
    return out / (voices * len(freqs)) * 1.6

def stab(chord, dur=0.22, cutoff=3800):
    n = int(SR * (dur + 0.25))
    x = supersaw([mtof(m) for m in chord], n)
    x = np.stack([sosfilt(sos('lowpass', cutoff), c) for c in x])
    return x * env(n, 0.003, dur * 0.55)

def pluck(m, dur=0.3):
    n = int(SR * (dur + 0.2)); t = np.arange(n) / SR
    f = mtof(m)
    sq = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * 2 * t) * 0.3 + saw(f, n, 0.004) * 0.4
    sq = sosfilt(sos('lowpass', 5200), sq)
    return sq * env(n, 0.002, 0.11)

def bass(m, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    f = mtof(m)
    x = saw(f, n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.8
    x = sosfilt(sos('lowpass', 900), x)
    e = np.minimum(1, t / 0.004) * np.minimum(1, (dur - t) / 0.02)
    return np.tanh(x * e * 1.4) * 0.7

def crash(len_s=1.8):
    n = int(SR * len_s); t = np.arange(n) / SR
    nz = np.stack([sosfilt(sos('highpass', 4200), rng.standard_normal(n)) for _ in range(2)])
    return nz * np.exp(-t * 2.6) * 0.17

def riser(len_s):
    n = int(SR * len_s); t = np.arange(n) / SR; p = t / len_s
    nz = rng.standard_normal(n)
    out = np.zeros(n)
    # 밴드패스 스윕 (블록 단위)
    blk = 1024
    for i in range(0, n, blk):
        fc = 400 + (9000 - 400) * (p[i] ** 2)
        s = sos('bandpass', [fc * 0.7, min(fc * 1.4, 20000)])
        out[i:i+blk] = sosfilt(s, nz[i:i+blk])
    f = 180 * 2 ** (p * 3)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (out * 0.55 + tone) * (p ** 1.6)

def impact():
    n = int(SR * 1.4); t = np.arange(n) / SR
    f = 38 + 90 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    nz = sosfilt(sos('lowpass', 1800), rng.standard_normal(n)) * np.exp(-t * 18) * 0.5
    return np.tanh((boom + nz) * 1.8) * 0.85

def pop(pitch=1.0):
    n = int(SR * 0.09); t = np.arange(n) / SR
    f = (520 + 900 * (t / 0.09)) * pitch
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 38) * 0.6

def stamp():
    n = int(SR * 0.9); t = np.arange(n) / SR
    thud = np.sin(2 * np.pi * np.cumsum(70 + 60 * np.exp(-t * 40)) / SR) * np.exp(-t * 9)
    knock = sosfilt(sos('bandpass', [300, 2600]), rng.standard_normal(n)) * np.exp(-t * 55) * 0.9
    return np.tanh((thud * 1.2 + knock) * 2.0) * 0.9

def snare_roll(b0, b1, bus):
    # 16분음표 → 32분음표로 가속하는 스네어 롤
    t = b0
    while t < b1 - 1e-6:
        prog = (t - b0) / (b1 - b0)
        step = 0.25 if prog < 0.5 else 0.125
        bus.add(clap(), bs(t), 0.18 + 0.55 * prog, pan=0.05)
        t += step

def load_wav(path):
    w = wave.open(path); sr = w.getframerate(); ch = w.getnchannels(); sw = w.getsampwidth()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16 if sw == 2 else np.int32).astype(np.float64)
    a /= 32768.0 if sw == 2 else 2147483648.0
    a = a.reshape(-1, ch).T
    if sr != SR:
        idx = np.arange(0, a.shape[1], sr / SR)
        a = np.stack([np.interp(idx, np.arange(a.shape[1]), c) for c in a])
    if a.shape[0] == 1: a = np.vstack([a, a])
    return a

# ---------- 편곡 ----------
drums, music, verb_send, sfx = Bus(), Bus(), Bus(), Bus()
# 코드: Am F C G | Am  F-G | (b22 C 히트)
CH = {'Am': [57, 60, 64, 69], 'F': [53, 57, 60, 65], 'C': [55, 60, 64, 67], 'G': [55, 59, 62, 67]}
ROOT = {'Am': 33, 'F': 29, 'C': 36, 'G': 31}
bar_chords = ['Am', 'F', 'C', 'G', 'Am', 'F']
ARP = {'Am': [69, 72, 76, 72, 81, 76, 72, 76], 'F': [69, 72, 77, 72, 81, 77, 72, 77],
       'C': [67, 72, 76, 72, 79, 76, 72, 76], 'G': [67, 71, 74, 71, 79, 74, 71, 74]}
kick_beats = []

for bar in range(6):
    ch = bar_chords[bar]
    for beat in range(4):
        b = bar * 4 + beat
        if b >= 22: break
        chord = ch if not (bar == 5 and beat >= 2) else 'G'
        brk = b in (14, 15)
        if not brk:
            drums.add(kick(big=(b in (0, 8, 16))), bs(b), 1.0); kick_beats.append(b)
            if beat in (1, 3):
                c = clap(); drums.add(c, bs(b), 0.75); verb_send.add(c, bs(b), 0.25)
            # 하이햇: 16분 클로즈 + 엇박 오픈
            for s in range(4):
                if s == 2: drums.add(hat(True), bs(b + 0.5), 0.55, pan=0.25)
                else: drums.add(hat(), bs(b + s * 0.25), [0.5, 0.25, 0, 0.32][s], pan=-0.2)
            # 엇박 베이스
            music.add(bass(ROOT[chord], BEAT * 0.42), bs(b + 0.5), 0.95)
            music.add(bass(ROOT[chord], BEAT * 0.18), bs(b + 0.0), 0.35)
        # 아르페지오 리드 (8분)
        arp = ARP[chord]
        lv = 0.30 if bar < 2 else 0.46
        for e in range(2):
            m = arp[(beat * 2 + e) % 8]
            p = pluck(m, 0.22)
            music.add(p, bs(b + e * 0.5), lv * (0.6 if brk else 1), pan=(-0.3 if e == 0 else 0.3))
            verb_send.add(p, bs(b + e * 0.5), lv * 0.5)
    # 싱코페이션 코드 스탭 (16분 스텝)
    for st in [0, 3, 6, 8, 11, 14]:
        b = bar * 4 + st / 4
        if b >= 22: continue
        chord = ch if not (bar == 5 and st >= 8) else 'G'
        if 14 <= b < 16:
            continue
        s = stab(CH[chord], 0.2, 3000 if bar < 2 else 4800)
        music.add(s, bs(b), 0.78 if bar >= 2 else 0.6); verb_send.add(s, bs(b), 0.18)

# 브레이크(b14~16): 스네어 롤 + 라이저, 필터 걸린 코드 길게
snare_roll(14, 16, drums)
pad = stab(CH['G'], 0.9, 1400); music.add(pad, bs(14), 0.35); verb_send.add(pad, bs(14), 0.3)
r = riser(BEAT * 2); sfx.add(r, bs(14), 0.5)
# 전환 전 라이저 (b6~8)
r = riser(BEAT * 2); sfx.add(r, bs(6), 0.32)
snare_roll(7, 8, drums)
# 크래시
for b in (0, 8, 16):
    c = crash(); drums.add(c, bs(b), 0.9)
# 임팩트
sfx.add(impact(), bs(1), 0.6)       # 타이틀 '합격 가져가!' 쾅
sfx.add(impact(), bs(16), 0.85)     # 엔딩 드롭
# 마지막 b22: C 메이저 히트 + 도장
hit = stab([48, 55, 60, 64, 67, 72], 1.6, 5200); music.add(hit, bs(22), 0.55); verb_send.add(hit, bs(22), 0.5)
drums.add(kick(True), bs(22), 1.0); drums.add(crash(2.5), bs(22), 1.0)
sfx.add(stamp(), bs(22), 0.95); sfx.add(impact(), bs(22), 0.55)

# 단어 팝 효과음 / 휘익
pops = json.loads(sys.argv[2]) if len(sys.argv) > 2 else []
for i, p in enumerate(pops):
    sfx.add(pop(1.0 + 0.12 * (i % 3)), bs(p), 0.32)
wh = load_wav(sys.argv[3]) if len(sys.argv) > 3 else None
if wh is not None:
    for b in (8, 16):
        sfx.add(wh, bs(b) - int(0.13 * SR), 0.45)

# 사이드체인 (킥에 맞춰 음악 버스 덕킹)
duck = np.ones(len(music.L))
for b in kick_beats + [22]:
    i = bs(b); n = int(0.28 * SR); t = np.arange(n) / SR
    d = 1 - 0.65 * np.exp(-t / 0.09)
    duck[i:i+n] = np.minimum(duck[i:i+n], d[:len(duck[i:i+n])])
music.L *= duck; music.R *= duck

# 리버브 (지수감쇠 노이즈 IR)
irn = int(SR * 1.3); ti = np.arange(irn) / SR
irL = rng.standard_normal(irn) * np.exp(-ti * 4.2); irR = rng.standard_normal(irn) * np.exp(-ti * 4.2)
irL = sosfilt(sos('lowpass', 6000), irL); irR = sosfilt(sos('lowpass', 6000), irR)
irL /= np.sqrt(np.sum(irL ** 2)); irR /= np.sqrt(np.sum(irR ** 2))
vL = fftconvolve(verb_send.L, irL)[:len(verb_send.L)] * 0.6
vR = fftconvolve(verb_send.R, irR)[:len(verb_send.R)] * 0.6

L = drums.L + music.L + vL + sfx.L
R = drums.R + music.R + vR + sfx.R
# 마지막: 영상 끝(11.2s)에서 짧게 페이드 아웃
L = L[:N]; R = R[:N]
fade = int(0.12 * SR); L[-fade:] *= np.linspace(1, 0, fade); R[-fade:] *= np.linspace(1, 0, fade)
mix = np.stack([L, R])
mix = sosfilt(sos('highpass', 28), mix)
mix = np.tanh(mix * 0.9) 
mix /= np.max(np.abs(mix)) / 0.89
out = (mix.T * 32767).astype(np.int16)
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes()); w.close()
print('ok', DUR, 's')
