#!/usr/bin/env python3
"""Grab still frames from a finished video for a final visual check.
  python grab.py output/name_16x9.mp4 30,95,200   -> output/name_16x9_check.png (가로로 이어 붙인 한 장)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import run
from render import tile

v, ts = sys.argv[1], [float(x) for x in sys.argv[2].split(',')]
base = os.path.splitext(v)[0]; outs = []
for i, t in enumerate(ts):
    o = f'{base}_g{i}.png'; run(['-ss', str(t), '-i', v, '-frames:v', '1', o]); outs.append(o)
tile(outs, len(outs), 480, base + '_check.png')
for o in outs: os.remove(o)
print(base + '_check.png')
