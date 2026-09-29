"""voice.wav + sfx.json -> mix.wav (self-made BGM with ducking + SFX)."""
import numpy as np, wave, json
SR = 48000
D = json.load(open('sfx_s.json'))
w = wave.open('voice_short.wav'); v = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32767
DUR = max(D['end'], len(v) / SR + 1.5); N = int(DUR * SR)
voice = np.zeros(N); voice[:len(v)] = v
rs = np.random.RandomState(3); tt = np.arange(N) / SR

def add(buf, sig, t, g=1.0):
    i = int(t * SR); j = min(len(buf), i + len(sig))
    if 0 <= i < len(buf): buf[i:j] += sig[:j - i] * g

# ---- BGM: 96 bpm lo-fi study groove (kick, hat, soft bass, electric-piano chords)
mus = np.zeros(N); beat = 60 / 96
kn = int(.3 * SR); tk = np.arange(kn) / SR
kick = np.sin(2 * np.pi * (48 * tk + 2.6 * (1 - np.exp(-tk * 22)))) * np.exp(-tk * 10)
hn = int(.05 * SR); hat = np.diff(rs.randn(hn + 1)) * np.exp(-np.arange(hn) / SR * 80) * .25
chords = [[220, 261.63, 329.63, 392], [174.61, 220, 261.63, 329.63], [196, 246.94, 293.66, 349.23], [164.81, 207.65, 246.94, 293.66]]
roots = [110, 87.31, 98, 82.41]
t = 0; b = 0
while t < DUR:
    bar = (b // 4) % 4
    if b % 4 in (0, 2): add(mus, kick, t, .7)
    add(mus, hat, t + beat / 2, .5)
    if b % 4 == 0:
        n = int(4 * beat * SR); ts = np.arange(n) / SR
        env = np.minimum(1, ts / .05) * np.exp(-ts * .6)
        for f in chords[bar]:
            add(mus, (np.sin(2 * np.pi * f * ts) + .25 * np.sin(4 * np.pi * f * ts)) * env * .035, t)
        add(mus, np.sin(2 * np.pi * roots[bar] * ts) * np.minimum(1, ts / .02) * np.exp(-ts * .8) * .14, t)
    t += beat; b += 1
mus *= np.minimum(1, tt / 1.0) * np.clip((DUR - tt) / 2.5, 0, 1)
e = np.abs(voice); k = int(.15 * SR); e = np.convolve(e, np.ones(k) / k, 'same'); e /= e.max() + 1e-9
mus *= 1 - 0.6 * np.clip(e * 4, 0, 1)

# ---- SFX
sfx = np.zeros(N)
def whoosh(t, d=.5, g=.45):
    n = int(d * SR); x = rs.randn(n); out = np.zeros(n); lp = 0; a = np.linspace(.03, .3, n)
    for q in range(n): lp += a[q] * (x[q] - lp); out[q] = lp
    add(sfx, out * np.sin(np.pi * np.arange(n) / n) ** 2 * g, t - d / 2)
def impact(t, g=.5):
    n = int(.6 * SR); ti = np.arange(n) / SR
    add(sfx, (np.sin(2 * np.pi * (40 * ti + 7 * (1 - np.exp(-ti * 12)))) * np.exp(-ti * 5) + rs.randn(n) * np.exp(-ti * 40) * .35) * g, t)
    sp = int(.5 * SR); ts = np.arange(sp) / SR  # sparkle
    add(sfx, (np.sin(2 * np.pi * 2400 * ts) + np.sin(2 * np.pi * 3600 * ts)) * np.exp(-ts * 9) * .05, t + .05)
def pop(t, g=.16, f=720):
    n = int(.1 * SR); tp = np.arange(n) / SR
    add(sfx, np.sin(2 * np.pi * (f * tp - f * 2.5 * tp * tp)) * np.exp(-tp * 38) * g, t)
def ding(t, g=.12):
    n = int(.7 * SR); tp = np.arange(n) / SR
    add(sfx, (np.sin(2 * np.pi * 1318 * tp) + .5 * np.sin(2 * np.pi * 1976 * tp)) * np.exp(-tp * 6) * g, t)
for t, kind in D['sfx']:
    if kind == 'whoosh': whoosh(t)
    elif kind == 'impact': impact(t)
    elif kind == 'ding': ding(t)
    elif kind == 'tick': pop(t, .12, 1100)
    else: pop(t)
for s in D['scenes'][1:]: whoosh(s['t0'], .55, .35)

mix = voice + mus * .28 + sfx * .5
mix = mix / np.abs(mix).max() * .95
st = np.clip(np.stack([mix + mus * .02, mix - mus * .02], 1), -1, 1)
o = wave.open('mix_s_raw.wav', 'wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR)
o.writeframes((st * 32767).astype('<i2').tobytes()); o.close()
print('mix', round(DUR, 1), 's')
