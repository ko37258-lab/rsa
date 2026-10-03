#!/usr/bin/env python3
"""Thumbnail sheets so Claude can SEE the video (scenes, burned-in captions/graphics, faces).
  python contact_sheet.py video.mp4 [--every 4]
Writes sheets/sheet_00.png ... (5x4 grid, left→right, top→bottom) and sheets/index.txt with each cell's time.
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import run, probe


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('video'); ap.add_argument('--every', type=float, default=4.0)
    A = ap.parse_args()
    d = os.path.join(os.path.dirname(os.path.abspath(A.video)), 'sheets'); os.makedirs(d, exist_ok=True)
    dur = probe(A.video)['dur']; per = 20
    run(['-i', A.video, '-vf', f'fps=1/{A.every},scale=384:-2,tile=5x4:padding=4:color=black', '-vsync', 'vfr',
         os.path.join(d, 'sheet_%02d.png')])
    n = int(dur // A.every) + 1
    with open(os.path.join(d, 'index.txt'), 'w', encoding='utf-8') as f:
        for k in range(-(-n // per)):
            cells = [f'{(k * per + i) * A.every:.0f}s' for i in range(per) if (k * per + i) < n]
            f.write(f'sheet_{k + 1:02d}.png: ' + ' | '.join(cells) + '\n')
    print(open(os.path.join(d, 'index.txt'), encoding='utf-8').read())


if __name__ == '__main__':
    main()
