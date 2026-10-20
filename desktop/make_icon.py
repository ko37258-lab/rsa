"""exe 아이콘(.ico) 만들기: python make_icon.py build/icon.ico"""

import sys
from pathlib import Path

from mrk_typeless.tray import make_icon

out = Path(sys.argv[1] if len(sys.argv) > 1 else "build/icon.ico")
out.parent.mkdir(parents=True, exist_ok=True)
make_icon("idle", 256).save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(f"아이콘: {out}")
