"""timeline.json 에 맞춘 긴장감 배경음악 + 효과음 합성, 내레이션과 믹스 -> mix.wav
사용: python make_music.py <project_dir>
"""
import sys, json, numpy as np, wave
from scipy.signal import butter, sosfilt
SR = 48000
proj = sys.argv[1]
tl = json.load(open(f'{proj}/src/timeline.json', encoding='utf-8'))
D = tl['durationSec']; N = int(D * SR) + SR
rng = np.random.default_rng(7)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2))

def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def tt(d): return np.arange(int(d * SR)) / SR
def add(buf, t0, sig, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), len(buf) - i)
    if n <= 0: return
    if sig.ndim == 1:
        l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        buf[i:i + n, 0] += sig[:n] * gain * l * 1.414; buf[i:i + n, 1] += sig[:n] * gain * r * 1.414
    else: buf[i:i + n] += sig[:n] * gain
def saw(f, t, det=0.0): return 2 * ((f * (1 + det) * t + rng.random()) % 1) - 1
def fade(sig, a=0.01, r=0.05):
    n = len(sig); e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return sig * e

# ---------- 악기 ----------
def kick(f0=120, f1=45, tau=0.28, d=0.7):
    t = tt(d); f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)
    s[:200] += rng.standard_normal(200) * np.linspace(0.6, 0, 200)
    return s
def heartbeat():
    a = lp(kick(75, 38, 0.13, 0.5), 300); b = lp(kick(70, 36, 0.12, 0.5), 300) * 0.7
    out = np.zeros(int(0.8 * SR)); out[:len(a)] += a; k = int(0.2 * SR); out[k:k + len(b)] += b
    return out
def boom(d=3.0):
    t = tt(d); f = 26 + 70 * np.exp(-t / 0.12)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.0)
    s += lp(rng.standard_normal(len(t)), 180) * np.exp(-t / 0.7) * 0.9
    s[:300] += rng.standard_normal(300) * np.linspace(1, 0, 300)
    return s
def crash(d=2.4):
    t = tt(d); n = rng.standard_normal(len(t))
    return (hp(n, 4500) * 0.8 + bp(n, 2500, 9000) * 0.5) * np.exp(-t / 0.75) * (1 - np.exp(-t / 0.002))
def snare(a=1.0):
    t = tt(0.18); n = rng.standard_normal(len(t))
    return (bp(n, 1500, 7000) * np.exp(-t / 0.05) + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04) * 0.6) * a
def drumroll(d, a0=0.08, a1=1.0, r0=11, r1=26):
    out = np.zeros(int((d + 0.3) * SR)); t = 0.0
    while t < d:
        p = t / d; rate = r0 + (r1 - r0) * p ** 1.5; amp = a0 + (a1 - a0) * p ** 2
        s = snare(amp * (0.85 + 0.3 * rng.random())); i = int(t * SR); out[i:i + len(s)] += s[:len(out) - i]
        t += 1 / rate
    return out
def riser(d):
    t = tt(d); p = t / d
    f = 180 * (8 ** p)
    s = sum(np.sin(2 * np.pi * np.cumsum(f * m) / SR) / m for m in (1, 2, 3)) * 0.35
    n = rng.standard_normal(len(t)); nz = np.zeros_like(n)
    for k in range(8):  # 단계별로 열리는 필터
        a, b = int(len(t) * k / 8), int(len(t) * (k + 1) / 8)
        nz[a:b] = bp(n, 300 + 900 * k, 1200 + 1800 * k)[a:b]
    return (s + nz * 0.5) * p ** 2.2
def pluck(f, d=0.22, cut=1100):
    t = tt(d); s = saw(f, t) + saw(f, t, 0.006)
    return lp(s, cut) * np.exp(-t / 0.09) * 0.5
def pad(freqs, d, cut=1400, a=0.6, r=1.0):
    t = tt(d); s = sum(saw(f, t, dt) for f in freqs for dt in (-0.004, 0, 0.005)) / (3 * len(freqs))
    return fade(lp(s, cut), a, r)
def stab(freqs, d=1.6):
    t = tt(d); s = sum(saw(f, t, dt) for f in freqs for dt in (-0.003, 0.004)) / (2 * len(freqs))
    return lp(s, 3200) * (np.exp(-t / 0.55) * 0.9 + 0.1 * np.exp(-t / 0.08)) * (1 - np.exp(-t / 0.004))
def bell(f, d=1.6):
    t = tt(d)
    return sum(np.sin(2 * np.pi * f * m * t) * np.exp(-t / (0.9 / m ** 0.7)) * g for m, g in ((1, 1), (2.76, 0.4), (5.4, 0.2), (8.9, 0.08))) * 0.35
def tick():
    t = tt(0.03); return hp(rng.standard_normal(len(t)), 6000) * np.exp(-t / 0.004) * 0.6
def clap():
    t = tt(0.25); n = rng.standard_normal(len(t)); e = np.exp(-t / 0.06)
    for k in (0.0, 0.011, 0.022): e += np.exp(-np.clip(t - k, 0, None) / 0.005) * (t >= k)
    return bp(n, 900, 5000) * e * 0.4
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

W = tl['winners']; I = tl['intro']
# ---------- 긴장 드론 (처음 ~ 총정리 전) ----------
tension_end = tl['outro']['start'] + 0.6
t = tt(tension_end + 1.0)
drone = (saw(55, t) + saw(55, t, 0.004) + 0.6 * saw(82.41, t, -0.003) + 0.5 * np.sin(2 * np.pi * 55 * t))
drone = lp(drone, 380) * (0.75 + 0.25 * np.sin(2 * np.pi * t / 7.0))
drone = fade(drone, 1.5, 1.2)
add(music, 0, drone, 0.22)
# 고음 불협 쉬머 (A5 + Bb5 트레몰로) - 서스펜스 구간에서만
def shimmer(d):
    t = tt(d); s = (np.sin(2 * np.pi * hz(81) * t) + np.sin(2 * np.pi * hz(82) * t) * 0.8) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t))
    return fade(s * (t / d) ** 1.5, 0.3, 0.05) * 0.12

# ---------- 오스티나토 (16분음표 저음현) ----------
BPM = 100; s16 = 60 / BPM / 4
def ostinato(t0, t1, gain=0.5, notes=(45, 45, 45, 46)):
    k = 0; t = t0
    while t < t1:
        m = notes[(k // 4) % len(notes)] if k % 4 == 0 else 45
        acc = 1.0 if k % 4 == 0 else 0.55
        add(music, t, pluck(hz(m)), gain * acc, pan=-0.2 if k % 2 else 0.2); t += s16; k += 1

# 인트로
add(sfx, 0.15, boom(), 0.55); add(sfx, 0.15, crash(), 0.18)
ostinato(I['title'] - 0.2, I['end'] - 0.6, 0.35)
add(sfx, I['ten'], boom(2.0), 0.45); add(music, I['ten'], stab([hz(45), hz(52), hz(57), hz(60)]), 0.25)
add(music, I['reveal'] - 0.4, riser(I['end'] - I['reveal'] + 0.4), 0.25)
add(sfx, I['end'] - 0.05, boom(2.0), 0.4)

# 당첨자별
for i, w in enumerate(W):
    last = (i == 9)
    t0, tn = w['ordAt'] - 0.2, w['nameAt']
    sus = tn - t0
    # 드럼롤 + 라이저 + 쉬머 + 심장박동 + 시계 틱
    add(sfx, t0, drumroll(sus, 0.06, 1.0 if not last else 1.15, 10 if not last else 7, 26 if not last else 30), 0.42 if not last else 0.5)
    add(music, tn - min(sus, 2.4), riser(min(sus, 2.4)), 0.28)
    add(music, t0, shimmer(sus), 1.0)
    hb = t0; gap = 0.95 if not last else 1.0
    while hb < tn - 0.35:
        add(music, hb, heartbeat(), 0.55); hb += gap; gap = max(0.42, gap * (0.9 if last else 0.94))
    tk = t0
    while tk < tn - 0.1:
        add(sfx, tk, tick(), 0.35); tk += 0.5 if (tn - tk) > 1.2 else 0.25
    # 공개 순간: 정적 0.12초 뒤 임팩트
    add(sfx, tn - 0.02, boom(), 0.62 if not last else 0.75)
    add(music, tn - 0.02, crash(), 0.3 if not last else 0.4)
    chord = [hz(57), hz(61), hz(64), hz(69)] if i % 2 == 0 else [hz(55), hz(59), hz(62), hz(67)]
    if last: chord = [hz(45), hz(57), hz(61), hz(64), hz(69), hz(73)]
    add(music, tn, stab(chord, 2.2 if last else 1.6), 0.34 if not last else 0.42)
    for k, m in enumerate([81, 85, 88, 93] if not last else [81, 85, 88, 93, 97, 100]):
        add(music, tn + 0.08 + k * 0.075, bell(hz(m)), 0.26, pan=-0.5 + k * 0.3)
    # 여운: 오스티나토 다시 (다음 장면 직전까지)
    ostinato(w['nameEnd'] + 0.1, w['end'] + 0.25, 0.22)
# 중간 멘트(절반/두 자리)
for seg, g in ((tl['half'], 0.3), (tl['two'], 0.38)):
    hb = seg['start'] + 0.2
    while hb < seg['end'] - 0.4: add(music, hb, heartbeat(), g * 1.6); hb += 0.85
    add(sfx, seg['start'] + 0.15, boom(2.0), 0.35)
add(music, tl['last']['start'], stab([hz(46), hz(53), hz(58)], 2.5), 0.35)  # LAST 불길한 화음

# ---------- 총정리: 밝은 축하 루프 (A - E - F#m - D) ----------
o0 = tl['outro']['start'] + 0.3; o1 = D
bpm = 112; beat = 60 / bpm; bar = beat * 4
prog = [[57, 61, 64], [52, 56, 59], [54, 57, 61], [50, 54, 57]]
add(sfx, o0 - 0.05, crash(3.0), 0.22)
t = o0; b = 0
while t < o1 - 0.2:
    ch = prog[b % 4]; L = min(bar, o1 - t)
    add(music, t, pad([hz(m) for m in ch] + [hz(ch[0] - 12)], L + 0.4, 2200, 0.05, 0.4), 0.42)
    for q in range(8):  # 8분음표 아르페지오
        tq = t + q * beat / 2
        if tq < o1 - 0.1: add(music, tq, pluck(hz(ch[q % 3] + 12 + (12 if q in (3, 7) else 0)), 0.3, 3000), 0.22, pan=-0.4 if q % 2 else 0.4)
    for q in range(4):
        tq = t + q * beat
        if tq < o1 - 0.1:
            add(music, tq, lp(kick(110, 48, 0.2, 0.4), 900), 0.38)
            if q % 2: add(music, tq, clap(), 0.35)
    t += bar; b += 1
add(music, o1 - 2.6, bell(hz(81), 2.5), 0.25)

# ---------- 믹스: 목소리 들어오면 음악 낮추기 ----------
wf = wave.open(f'{proj}/work/voice.wav'); v = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float64) / 32768; wf.close()
voice = np.zeros(N); voice[:len(v)] = v
hop = 480; env = np.sqrt(np.convolve(voice ** 2, np.ones(hop * 4) / (hop * 4), 'same'))
act = np.clip(env / 0.03, 0, 1)
# attack 30ms / release 350ms 스무딩
g = np.zeros(N); a_c, r_c = np.exp(-1 / (0.03 * SR)), np.exp(-1 / (0.35 * SR)); cur = 0.0
step = 48  # 1ms 단위로 계산 후 보간
idx = np.arange(0, N, step); gs = np.zeros(len(idx))
for k, i in enumerate(idx):
    tgt = act[i]; c = a_c ** step if tgt > cur else r_c ** step
    cur = tgt + (cur - tgt) * c; gs[k] = cur
duck = 1 - 0.74 * np.interp(np.arange(N), idx, gs)
mix = music * duck[:, None] * 0.9 + sfx * (1 - 0.45 * np.interp(np.arange(N), idx, gs))[:, None] * 0.9
# 음악 버스 가벼운 리미팅
pk = np.max(np.abs(mix)); mix = np.tanh(mix / max(pk, 1e-9) * 1.6) / np.tanh(1.6) * 0.36
final = mix + voice[:, None] * 1.0
final = final[:int(D * SR)]
final /= max(1.0, np.max(np.abs(final)) / 0.97)
for name, arr in (('mix.wav', final), ('music_only.wav', mix[:int(D * SR)])):
    with wave.open(f'{proj}/work/{name}', 'wb') as o:
        o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR)
        o.writeframes((np.clip(arr, -1, 1) * 32767).astype(np.int16).tobytes())
print('ok', D)
