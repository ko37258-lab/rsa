"""Shared helpers: ffmpeg location, probing, loudness."""
import json, os, re, shutil, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ffmpeg_exe():
    p = shutil.which('ffmpeg')
    if p:
        return p
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


FF = ffmpeg_exe()


def run(args, **kw):
    return subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y'] + args, check=True, **kw)


def probe(src):
    """-> dict(dur, w, h, audio)"""
    r = subprocess.run([FF, '-hide_banner', '-i', src], capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r)
    if not m:
        raise SystemExit(f'영상을 읽을 수 없습니다: {src}\n{r[-500:]}')
    dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    v = re.search(r'Video:[^\n]*?, (\d{2,5})x(\d{2,5})', r)
    w, h = (int(v[1]), int(v[2])) if v else (1920, 1080)
    rot = re.search(r'rotation of (-?\d+)', r) or re.search(r'rotate\s*:\s*(-?\d+)', r)
    if rot and abs(int(rot[1])) % 180 == 90:
        w, h = h, w
    return dict(dur=dur, w=w, h=h, audio='Audio:' in r)


def loudnorm(inp, out, I=-14.0):
    """Two-pass EBU R128 normalisation (YouTube ≈ -14 LUFS)."""
    base = f'loudnorm=I={I}:TP=-1.5:LRA=11'
    r = subprocess.run([FF, '-hide_banner', '-i', inp, '-af', base + ':print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
    j = json.loads(r[r.rfind('{'):r.rfind('}') + 1])
    af = (f"{base}:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
          f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,alimiter=limit=0.89")
    run(['-i', inp, '-af', af, '-ar', '48000', '-ac', '2', out])


def lufs(path):
    r = subprocess.run([FF, '-hide_banner', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r)
    return float(m[-1]) if m else None
