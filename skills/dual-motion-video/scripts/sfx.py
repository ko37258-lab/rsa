"""Synthesised sound effects (no external audio files needed)."""
import numpy as np

SR = 48000


def render_sfx(events, dur, seed=9):
    """events: [[t, kind]], kind in pop|impact|whoosh|ding|click|ticks:<sec>"""
    N = int(SR * (dur + 1)); out = np.zeros(N); rs = np.random.RandomState(seed)

    def add(t, s, g=1.0):
        i = int(t * SR); j = min(N, i + len(s))
        if 0 <= i < N: out[i:j] += s[:j - i] * g

    def whoosh(t, d=.5, g=.35):
        n = int(d * SR); x = rs.randn(n); o = np.zeros(n); lp = 0.0; a = np.linspace(.02, .3, n)
        for q in range(n):
            lp += a[q] * (x[q] - lp); o[q] = lp
        add(t - d / 2, o * np.sin(np.pi * np.arange(n) / n) ** 2, g)

    def impact(t, g=.45):
        n = int(.7 * SR); ti = np.arange(n) / SR
        add(t, np.sin(2 * np.pi * (40 * ti + 6 * (1 - np.exp(-ti * 10)))) * np.exp(-ti * 5) + rs.randn(n) * np.exp(-ti * 35) * .3, g)
        add(t + .04, (np.sin(2 * np.pi * 2637 * ti) + np.sin(2 * np.pi * 3951 * ti)) * np.exp(-ti * 6) * .05)

    def pop(t, g=.15, f=850):
        n = int(.1 * SR); tp = np.arange(n) / SR
        add(t, np.sin(2 * np.pi * (f * tp - f * 2.5 * tp * tp)) * np.exp(-tp * 38), g)

    def ding(t, g=.18):
        n = int(1.0 * SR); tp = np.arange(n) / SR
        add(t, (np.sin(2 * np.pi * 1568 * tp) + .5 * np.sin(2 * np.pi * 2349 * tp)) * np.exp(-tp * 4), g)

    for t, k in events:
        if k == 'pop': pop(t)
        elif k == 'impact': impact(t)
        elif k == 'whoosh': whoosh(t)
        elif k == 'ding': ding(t)
        elif k == 'click': pop(t, .3, 1200); pop(t + .5, .2, 900)
        elif k.startswith('ticks:'):
            d = float(k.split(':')[1]); u = t
            while u < t + d:
                pop(u, .06, 1500); u += 0.06 + 0.12 * ((u - t) / max(d, .1))
    return np.clip(out, -1, 1)
