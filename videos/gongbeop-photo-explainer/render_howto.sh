#!/bin/bash
cd "$(dirname "$0")"
B=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
for C in HowTo169 HowTo916; do
  npx remotion render src/howto.tsx $C out_$C.mp4 --codec=h264 --crf=18 --concurrency=4 --timeout=120000 --browser-executable=$B > render_$C.log 2>&1
  echo "$C exit $?" >> render_howto.done
done
echo ALLDONE >> render_howto.done
