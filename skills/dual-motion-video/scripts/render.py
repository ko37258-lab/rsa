#!/usr/bin/env python3
"""Render a 16:9 main video and a 9:16 Short from one source video + plan.json.

  python render.py plan.json                 # both formats
  python render.py plan.json --only 9x16     # one format
  python render.py plan.json --preview       # still previews only (fast check)
"""
import argparse, json, os, pathlib, subprocess, sys, time, wave
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import FF, ROOT, run, probe, loudnorm, lufs
from sfx import render_sfx, SR

TPL = pathlib.Path(ROOT, 'templates', 'overlay.html').as_uri()
FPS = 30


# ---------------------------------------------------------------- page
def open_page(pw, fmt, plan, meta):
    exe = os.environ.get('CHROMIUM_PATH')
    b = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()
    W, H = (1920, 1080) if fmt == '16x9' else (1080, 1920)
    pg = b.new_page(viewport={'width': W, 'height': H})
    pg.on('console', lambda m: print('  [page]', m.text) if 'WARN' in m.text else None)
    pg.on('pageerror', lambda e: print('  [page error]', e))
    pg.add_init_script(f"window.PLAN={json.dumps(plan, ensure_ascii=False)};window.FMT='{fmt}';window.META={json.dumps(meta)};")
    pg.goto(TPL)
    pg.evaluate('document.fonts.ready.then(()=>1)')
    return b, pg


def page_info(fmt, plan, meta):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b, pg = open_page(pw, fmt, plan, meta)
        info = pg.evaluate('window.INFO'); b.close()
    return info


# ---------------------------------------------------------------- video filters
def vf16(T0, plan, src):
    L = plan.get('landscape', {}); I = L.get('intro'); tt = f'(t+{T0:.4f})'
    aspect = src['w'] / src['h']
    if abs(aspect - 16 / 9) > 0.02:
        f = ('fps=30,split[a][b];[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=30:3[bga];'
             '[b]scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos[fga];[bga][fga]overlay=(W-w)/2:(H-h)/2')
    else:
        f = 'fps=30,scale=1920:1080:flags=lanczos'
    if I and I.get('blur', True):
        f += f",boxblur=22:2:enable='lt({tt},{I.get('end', 15.8)})'"
    zs = L.get('zoom', [])
    if zs:
        Z = '1' + ''.join(f'+between({tt},{a},{b})*{amt}*min(1,({tt}-{a})/{max(.1, (b - a) * .9)})' for a, b, amt in zs)
        f += f",scale=w='trunc(1920*({Z})/2)*2':h='trunc(1080*({Z})/2)*2':eval=frame:flags=bicubic,crop=1920:1080:(iw-1920)/2:(ih-1080)/2"
    f += ',eq=contrast=1.05:saturation=1.12:gamma=1.02,unsharp=5:5:0.6,setsar=1'
    return f


def build_short_base(plan, src, work):
    """Cut highlight segments and lay them out 9:16 -> base_9x16.mkv (+ meta)."""
    segs = plan['shorts']['segments']; tail = (plan['shorts'].get('tail') or {}).get('dur', 1.8)
    vh = min(1100, int(round(1080 * src['h'] / src['w'] / 2) * 2)); vy = 600
    fc = ''
    for i, (a, b) in enumerate(segs):
        d = b - a
        fc += f'[0:v]trim={a}:{b},setpts=PTS-STARTPTS[v{i}];'
        fc += (f'[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st={d - .04:.3f}:d=0.04[a{i}];'
               if src['audio'] else f'anullsrc=r=48000:cl=stereo,atrim=0:{d}[a{i}];')
    fc += ''.join(f'[v{i}][a{i}]' for i in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=1[cv][ca];'
    fc += (f'[cv]fps=30,tpad=stop_mode=clone:stop_duration={tail},eq=contrast=1.05:saturation=1.12:gamma=1.02,split[x][y];'
           '[x]scale=-2:1920,crop=1080:1920,boxblur=30:3,eq=brightness=-0.12[bg];'
           f'[y]scale=1080:{vh}:flags=lanczos,unsharp=5:5:0.7[fg];[bg][fg]overlay=0:{vy},format=yuv420p,setsar=1[v];[ca]aresample=48000,apad=pad_dur={tail}[a]')
    out = os.path.join(work, 'base_9x16.mkv')
    run(['-i', plan['_src'], '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '14',
         '-preset', 'fast', '-c:a', 'pcm_s16le', out])
    return out, dict(vy=vy, vh=vh)


# ---------------------------------------------------------------- overlay workers
def worker(job):
    fmt, plan, meta, a, b, out, inp, vf, src_is_base = job
    from playwright.sync_api import sync_playwright
    T0 = a / FPS
    filt = (f'[0:v]{vf}[bg];' if vf else '[0:v]null[bg];') + '[1:v]format=rgba[ov];[bg][ov]overlay=0:0:format=auto,format=yuv420p[v]'
    ff = subprocess.Popen([FF, '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{T0:.4f}', '-i', inp,
                           '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'png', '-i', '-',
                           '-filter_complex', filt, '-map', '[v]', '-frames:v', str(b - a), '-an',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-r', str(FPS), out], stdin=subprocess.PIPE)
    with sync_playwright() as pw:
        br, pg = open_page(pw, fmt, plan, meta)
        for f in range(a, b):
            pg.evaluate(f'frame({f / FPS})')
            ff.stdin.write(pg.screenshot(type='png', omit_background=True))
            if (f - a) % 300 == 0:
                print(f'  [{fmt}] frame {f}/{b}', flush=True)
        br.close()
    ff.stdin.close(); ff.wait()
    return out


def render_overlay(fmt, plan, meta, inp, vf_fn, nframes, work, workers):
    q = -(-nframes // workers); jobs = []
    for i in range(workers):
        a, b = i * q, min(nframes, (i + 1) * q)
        if a < b:
            jobs.append((fmt, plan, meta, a, b, os.path.join(work, f'part_{fmt}_{i}.mp4'), inp, vf_fn(a / FPS) if vf_fn else None, False))
    with Pool(len(jobs)) as p:
        parts = p.map(worker, jobs)
    lst = os.path.join(work, f'parts_{fmt}.txt')
    with open(lst, 'w', encoding='utf-8') as f:
        f.writelines(f"file '{pathlib.Path(x).as_posix()}'\n" for x in parts)
    return lst


# ---------------------------------------------------------------- audio
def wav_read(p):
    w = wave.open(p); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32767
    return x.reshape(-1, w.getnchannels())


def wav_write(p, x):
    o = wave.open(p, 'wb'); o.setnchannels(x.shape[1]); o.setsampwidth(2); o.setframerate(SR)
    o.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()); o.close()


def make_audio(voice_src, events, dur, work, tag):
    raw = os.path.join(work, f'a_{tag}_raw.wav'); norm = os.path.join(work, f'a_{tag}_n.wav')
    if voice_src:
        run(['-i', voice_src, '-vn', '-ac', '2', '-ar', str(SR), '-t', f'{dur:.3f}', raw])
    else:
        run(['-f', 'lavfi', '-i', f'anullsrc=r={SR}:cl=stereo', '-t', f'{dur:.3f}', raw])
    try:
        loudnorm(raw, norm, -16)
    except Exception:
        norm = raw
    v = wav_read(norm); N = int(dur * SR)
    if len(v) < N: v = np.vstack([v, np.zeros((N - len(v), 2), np.float32)])
    v = v[:N]
    s = render_sfx(events, dur)[:N]
    mix = os.path.join(work, f'a_{tag}_mix.wav'); fin = os.path.join(work, f'a_{tag}.wav')
    wav_write(mix, v + s[:, None] * .5)
    loudnorm(mix, fin, -14)
    return fin


# ---------------------------------------------------------------- previews
def tile(pngs, cols, w, out):
    """Grid of equally sized images (works on Windows too: no glob patterns)."""
    n = len(pngs); args = []
    for p in pngs: args += ['-i', p]
    sc = ''.join(f'[{i}:v]scale={w}:-2[s{i}];' for i in range(n))
    if n == 1:
        run(args + ['-filter_complex', sc + '[s0]null', '-frames:v', '1', out]); return
    lay = '|'.join(f"{'+'.join(['w0'] * (i % cols)) or '0'}_{'+'.join(['h0'] * (i // cols)) or '0'}" for i in range(n))
    run(args + ['-filter_complex', sc + ''.join(f'[s{i}]' for i in range(n)) + f'xstack=inputs={n}:layout={lay}:fill=black',
                '-frames:v', '1', out])


def previews(fmt, plan, meta, info, inp, vf_fn, outdir, times=None):
    from playwright.sync_api import sync_playwright
    if not times:
        ev = [t + .7 for t, k in info['SFX'] if not k.startswith(('ticks', 'whoosh', 'ding'))]
        ev = sorted(set(round(t, 1) for t in ev if t < info['END']))
        n = 12 if fmt == '16x9' else 12
        times = [ev[int(i * (len(ev) - 1) / max(1, n - 1))] for i in range(min(n, len(ev)))] if ev else [1.0]
        times = sorted(set(times))
    d = os.path.join(outdir, f'preview_{fmt}'); os.makedirs(d, exist_ok=True)
    with sync_playwright() as pw:
        b, pg = open_page(pw, fmt, plan, meta)
        for i, t in enumerate(times):
            pg.evaluate(f'frame({t})'); ov = os.path.join(d, '_ov.png'); pg.screenshot(path=ov, omit_background=True)
            vf = vf_fn(t) if vf_fn else 'null'
            sc = 'scale=960:-2' if fmt == '16x9' else 'scale=540:-2'
            run(['-ss', f'{t:.3f}', '-i', inp, '-i', ov, '-filter_complex', f'[0:v]{vf}[bg];[bg][1:v]overlay,{sc}',
                 '-frames:v', '1', os.path.join(d, f'p{i:02d}_{t:06.1f}s.png')])
        b.close()
    os.remove(os.path.join(d, '_ov.png'))
    pngs = sorted(os.path.join(d, x) for x in os.listdir(d) if x.endswith('.png'))
    tile(pngs, 3 if fmt == '16x9' else 6, 640 if fmt == '16x9' else 320, os.path.join(outdir, f'preview_{fmt}.png'))
    print(f'  미리보기: {d}  (시간: {", ".join(f"{t:.1f}" for t in times)})')


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plan'); ap.add_argument('--only', choices=['16x9', '9x16'])
    ap.add_argument('--preview', action='store_true'); ap.add_argument('--times', help='미리보기 시간(초), 쉼표 구분')
    ap.add_argument('--workers', type=int, default=max(1, min(4, (os.cpu_count() or 2) // 2)))
    A = ap.parse_args()
    pdir = os.path.dirname(os.path.abspath(A.plan))
    plan = json.load(open(A.plan, encoding='utf-8'))
    plan['_src'] = os.path.join(pdir, plan['source']) if not os.path.isabs(plan['source']) else plan['source']
    outdir = os.path.join(pdir, plan.get('out_dir', 'output')); work = os.path.join(outdir, '_work')
    os.makedirs(work, exist_ok=True)
    src = probe(plan['_src']); name = plan.get('name', 'video')
    print(f"원본: {plan['_src']}  {src['w']}x{src['h']}  {src['dur']:.1f}s")
    fmts = [A.only] if A.only else [f for f in ('16x9', '9x16') if (f == '16x9' and 'landscape' in plan) or (f == '9x16' and 'shorts' in plan)]
    times = [float(x) for x in A.times.split(',')] if A.times else None
    t0 = time.time()
    for fmt in fmts:
        print(f'\n=== {fmt} ===')
        if fmt == '16x9':
            meta = dict(dur=src['dur']); inp = plan['_src']; vf_fn = lambda T: vf16(T, plan, src)
        else:
            inp, meta = build_short_base(plan, src, work); vf_fn = None
        info = page_info(fmt, plan, meta)
        if A.preview:
            previews(fmt, plan, meta, info, inp, vf_fn, outdir, times); continue
        dur = info['END']; nframes = int(dur * FPS)
        lst = render_overlay(fmt, plan, meta, inp, vf_fn, nframes, work, A.workers)
        aud = make_audio(inp if (fmt == '9x16' or src['audio']) else None, info['SFX'], dur, work, fmt)
        out = os.path.join(outdir, f"{name}_{'16x9' if fmt == '16x9' else '9x16_쇼츠'}.mp4")
        run(['-f', 'concat', '-safe', '0', '-i', lst, '-i', aud, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
             '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out])
        mb = os.path.getsize(out) / 1e6
        print(f'  완성: {out}  ({mb:.1f}MB, {dur:.1f}s, {lufs(out)} LUFS)')
        if fmt == '16x9' and plan.get('landscape', {}).get('chapters'):
            ch = plan['landscape']['chapters']; first = ch[0][0]
            lines = ([] if first < 1 else ['00:00 오프닝']) + [f'{int(a // 60):02d}:{int(a % 60):02d} {s}' for a, b, s in ch]
            open(os.path.join(outdir, 'youtube_chapters.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'\n완료 ({(time.time() - t0) / 60:.1f}분). 결과 폴더: {outdir}')


if __name__ == '__main__':
    main()
