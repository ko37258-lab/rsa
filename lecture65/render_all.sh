#!/bin/bash
# renders video in 4 workers and muxes with mix.wav -> $1
cd "$(dirname "$0")"; OUT=${1:-lecture64.mp4}; SP=/tmp/claude-0/-home-user-rsa/594c27d1-934f-5bfe-b623-6b998110640f/scratchpad
END=$(node -e "eval(require('fs').readFileSync('render/data.js','utf8').replace(/const /g,'global.'));console.log(Math.ceil(END*30))")
W=4; for ((i=0;i<W;i++)); do node render/rend.js $((i*END/W)) $(((i+1)*END/W)) $SP/lp65_part$i.mp4 & done; wait
printf "file $SP/lp65_part0.mp4\nfile $SP/lp65_part1.mp4\nfile $SP/lp65_part2.mp4\nfile $SP/lp65_part3.mp4\n" > $SP/lp65_list.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i $SP/lp65_list.txt -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $OUT
ffmpeg -i $OUT 2>&1 | grep -E "Duration"
