# 당첨자 발표 영상 (모션그래픽)

어두운 긴장 무대에서 당첨자를 한 명씩 슬롯 릴로 공개하고, 마지막에 밝은 종이 배경으로 10명을 총정리하는 1920×1080 영상입니다.
모션그래픽 영상꾸미기 스킬의 Remotion 템플릿과 키네틱 타이포 규칙(Pretendard, 초록 `#1fcf62`, 흐림→자간 모임 등장)을 그대로 씁니다.

## 구성 (약 1분 46초)
| 구간 | 내용 |
|---|---|
| 인트로 | "당첨자 발표" 타이틀 → "35명 중 단 10명" → "행운의 주인공은?" → 왼쪽 명단 보드 등장 |
| 1~10번 | "N번째 당첨자는..." 드럼롤·심장박동·화면 흔들림 → 이름 3글자 슬롯 릴이 차례로 멈춤 → 섬광·충격파·꽃가루·당첨 도장 |
| 중간 멘트 | 5명 뒤 "절반 통과 / 남은 자리 5", 8명 뒤 붉은 "2" (딱 두 자리) |
| 10번 | 붉은 "LAST" 연출 + 4.4초 긴 서스펜스 |
| 총정리 | 밝은 배경으로 전환, 2열×5행 당첨자 카드 + 가라오케 자막 |

## 파일
- `narration/narration_sangcheol_v4.mp3` — ElevenLabs eleven_v4, '상철오빠' 클론 목소리 내레이션 원본
- `narration/narration_words.json` — 음성인식 단어 시점
- `tools/build_timeline.py` — 이름 직전 무음을 늘려 서스펜스를 만들고 `src/timeline.json`, `src/subs.json`, `work/voice.wav` 생성
- `tools/make_music.py` — 타임라인에 맞춰 긴장 배경음악·효과음을 합성하고 목소리와 믹스(목소리 나올 때 자동으로 음악 낮춤) → `work/mix.wav`
- `src/index.tsx` — Remotion 컴포지션 `Winner`

## 다시 만들기
```bash
cd winner_announcement
npm install
mkdir -p public/fonts   # Pretendard-{Medium,SemiBold,Bold,ExtraBold,Black}.otf 를 넣는다 (스킬 템플릿 public/fonts 와 동일)
pip install numpy scipy
python tools/build_timeline.py narration/narration_sangcheol_v4.mp3 narration/narration_words.json .
python tools/make_music.py .
npx remotion render src/index.tsx Winner work/video.mp4 --codec=h264 --crf=18 --muted
ffmpeg -i work/video.mp4 -i work/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -af loudnorm=I=-14:TP=-1.5:LRA=11 -shortest out.mp4
```

## 다음 추첨에 쓰려면
1. 새 내레이션을 같은 구조(인사 → "N번째 당첨자는... [pause] 이름 님!" × 인원 → 마무리)로 ElevenLabs에서 생성
2. `faster-whisper`로 단어 시점(`narration_words.json`)을 뽑고, `build_timeline.py` 안의 `NAMES`, 단어 인덱스(`ord_idx`, `name_idx`)를 새 대본에 맞게 고친다
3. 위 "다시 만들기" 순서대로 실행
