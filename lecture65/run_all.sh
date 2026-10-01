#!/bin/bash
# usage: bash run_all.sh part1.mp3 part2.mp3 part3.mp3   (in order)
set -e
cd "$(dirname "$0")"
SP=/tmp/claude-0/-home-user-rsa/594c27d1-934f-5bfe-b623-6b998110640f/scratchpad
STT=$SP/stt
# 1) concat parts, 0.6s gap between parts, mono 48k
args=(); fl=""; n=0
for f in "$@"; do args+=(-i "$f"); fl+="[$n:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur=0.6[a$n];"; n=$((n+1)); done
cat=""; for ((i=0;i<n;i++)); do cat+="[a$i]"; done
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "${fl}${cat}concat=n=$n:v=0:a=1,silenceremove=start_periods=1:start_threshold=-45dB,adelay=600[o]" -map "[o]" -ac 1 -ar 48000 voice.wav
ffmpeg -loglevel error -y -i voice.wav -ac 1 -ar 16000 -f f32le $SP/lec65.f32
# 2) transcribe + align
cp stt.mjs $STT/stt.mjs && (cd $STT && STT=$STT node stt.mjs word $SP/lec65.f32 /home/user/rsa/lecture65/tr_word.json 2>&1 | grep -v -i warn | tail -1)
python3 align.py
# 3) data + audio
python3 gen.py
python3 mix.py
ffmpeg -loglevel error -y -i mix_raw.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 mix.wav
echo READY
