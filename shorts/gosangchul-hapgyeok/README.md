# 고상철의 공인중개사 합격 가져가! — 쇼츠 편집본

- 결과물: `고상철_공인중개사_합격가져가_쇼츠.mp4` (1080×1920 세로, 30fps, 11.2초, H.264 + AAC, -13 LUFS)
- 참고 영상: 권루트 챌린지 "L을 가져가" 리믹스 쇼츠의 구성(책 들기 + 가리키는 동작)을 패러디했습니다.
- 음악: 원곡을 쓰지 않고 `build/music.py`로 직접 합성한 128.57BPM 비트입니다. 업로드할 때 원곡 저작권 문제가 생기지 않습니다.
- 원본 소리: 클립에 있던 웃음소리와 현장음을 음악 밑에 작게 깔았습니다. 약 -25 LUFS로 음악보다 12LU쯤 작고, 웃음이 많은 두 번째 클립은 +3dB 올렸습니다. 엔딩 카드에서는 빠집니다.

## 타임라인 (1박 = 14프레임)

| 구간 | 화면 | 키네틱 단어 |
|---|---|---|
| 0.00–3.73초 | 클립 1 (KakaoTalk_…120939658, 0.5초부터) | 상단 고정 타이틀 "고상철의 공인중개사 / 합격 가져가!"가 쾅 하고 등장 → 공인중개사 → 합격하고 싶어? → 그냥 가져가~! |
| 3.73–7.47초 | 클립 2 (KakaoTalk_…120941196, 1.4초부터) | 흰 플래시로 전환 → 공법의 신 → 28년 적중 노하우 → ~~L~~ 말고 → 합격 가져가! (집중선과 반짝이) |
| 7.47–11.2초 | 엔딩 카드 (정점 장면 정지화면) | 고상철의 공인중개사 / 합격 · 가져가! / #공법의신 #28년강의 #공인중개사 → 10.27초에 빨간 '합격' 도장 |

## 다시 렌더링하기

```bash
npm install
python3 build/music.py public/mix_raw.wav '[2,4,6,9,10,12,14,16.5,17,18,19,19.25,19.5]' public/whoosh.wav
ffmpeg -i public/mix_raw.wav -af loudnorm=I=-13:TP=-1.0:LRA=9 -ar 48000 public/mix.wav
npx remotion render src/short.tsx Short out.mp4 --codec=h264 --crf=17
# 원본 현장음 깔기 (클립1 0.5~4.23초, 클립2 1.4~5.13초 → 압축 후 음악 아래에 섞기)
ffmpeg -i clipA.mp4 -i clipB.mp4 -filter_complex "[0:a]atrim=0.5:4.233333,asetpts=PTS-STARTPTS[a];[1:a]atrim=1.4:5.133333,asetpts=PTS-STARTPTS,afade=t=out:st=3.58:d=0.153[b];[a][b]concat=n=2:v=0:a=1,aresample=48000,highpass=f=140,lowpass=f=9000,apad=whole_dur=11.2,acompressor=threshold=-26dB:ratio=4:attack=5:release=150[o]" -map "[o]" -ac 2 amb.wav
ffmpeg -i public/mix.wav -i amb.wav -filter_complex "[1:a]volume=1.2dB,volume='if(between(t,3.733,7.5),1.41,1)':eval=frame[b];[0:a][b]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89:level=false[o]" -map "[o]" mix2.wav
ffmpeg -i out.mp4 -i mix2.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest final.mp4
```

`public/` 폴더에는 다음 파일이 필요합니다.
- `a.mp4`, `b.mp4`: 원본 클립을 112프레임씩 자른 무음 H.264 파일
- `freeze.png`: 클립 2의 141번째 프레임
- `mix.wav`: 위에서 만든 음악
- `whoosh.wav`, `fonts/Pretendard-*.otf`: motion-graphic-video-decor 템플릿에 들어 있는 파일
