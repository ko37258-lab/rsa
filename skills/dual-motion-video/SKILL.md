---
name: dual-motion-video
description: 영상 파일 하나를 넣으면 모션그래픽을 입힌 16:9 유튜브 본편과 9:16 쇼츠를 한 번에 만드는 스킬. 음성 인식으로 말하는 타이밍에 맞춰 제목 인트로·챕터·정보카드·체크리스트·카운터·도장·전화 CTA·구독 애니메이션·효과음을 넣고, 쇼츠는 핵심 구간만 골라 큰 자막과 함께 세로로 재구성한다. 결과는 1080p 화질 보정과 -14 LUFS 음량 정규화를 거쳐 나오며, 유튜브 제목·설명·태그·챕터도 함께 준비한다. "영상에 모션그래픽 넣어줘", "이 영상 생동감 있게", "쇼츠도 같이", "16:9랑 9:16 두 개로", "매물 영상 편집", "유튜브 영상 꾸며줘", "dual motion" 같은 요청이나, 영상 파일을 주며 편집·효과·쇼츠를 원할 때 반드시 사용한다.
---

# 듀얼 모션 비디오 (16:9 본편 + 9:16 쇼츠)

원본 영상의 **말과 화면에 이미 있는 내용**을 시각화해 시청 지속시간을 높이는 것이 목표다. 렌더링은 스크립트가 하고, Claude는 **무엇을 언제 어디에 띄울지(plan.json)**를 설계하고 결과를 눈으로 검수한다.

```
원본.mp4 ─ transcribe.py ─▶ transcript.json (말 + 단어별 시각)
         └ contact_sheet.py ─▶ sheets/*.png (장면·기존 자막 위치 확인)
                     ▼ Claude가 plan.json 작성
render.py plan.json --preview ─▶ 미리보기 PNG 검수·수정 (반복)
render.py plan.json ─▶ output/{name}_16x9.mp4 + {name}_9x16_쇼츠.mp4 + youtube_chapters.txt
```

`SKILL_DIR`은 이 SKILL.md가 있는 폴더를 뜻한다. 명령은 `python`이 안 되면 `python3`로, Windows에서는 `py`로 실행한다.

## 0단계 — 준비 (처음 한 번)

```bash
python SKILL_DIR/scripts/setup_check.py --install
```
numpy, imageio-ffmpeg(ffmpeg 포함), playwright + Chromium, faster-whisper를 설치하고 점검한다. Python이 없으면 사용자에게 https://www.python.org/downloads/ 설치를 안내한다. Windows는 설치 화면에서 **"Add python.exe to PATH" 체크**가 필요하다.

## 1단계 — 작업 폴더와 권리 확인

- 사용자 영상 옆에 작업 폴더(예: `영상이름_작업/`)를 만들고 원본을 `original.mp4`로 복사한다. 원본은 절대 수정하지 않는다.
- **남의 채널 영상이면 사용 허락을 받았는지 한 번 확인**한다. 사진·지도를 추가로 넣는다면 출처가 확실한 것(CC 라이선스, 직접 촬영)만 쓰고 출처를 표기한다.

## 2단계 — 듣고 보기

```bash
python SKILL_DIR/scripts/transcribe.py 작업폴더/original.mp4          # 한국어, medium 모델
python SKILL_DIR/scripts/contact_sheet.py 작업폴더/original.mp4 --every 4
```
- `transcript.txt`를 읽어 영상의 흐름(인사 → 핵심 → 근거 → 결론/상담)을 파악한다. 세밀한 타이밍은 `transcript.json`의 `words`([단어, 시작, 끝])에서 찾는다.
- `sheets/sheet_XX.png`를 **반드시 열어 본다**(`index.txt`가 칸별 시각). 다음을 기록한다.
  - 장면 전환 시각
  - 원본에 **이미 박혀 있는 자막·그래픽·로고의 위치** (같은 정보를 겹쳐 넣지 않고, 비어 있는 쪽에 카드를 놓기 위해)
  - 진행자 얼굴 위치 (가리지 않기 위해)
  - 정지 배너·인트로 구간

## 3단계 — plan.json 설계

`reference/plan_schema.md`를 읽고 작성한다. 완성 예시는 `examples/samsong_plan.json`(부동산 매물 영상)이다. 비슷한 영상이면 이것을 복사해 고치는 것이 가장 빠르다.

설계 원칙:
1. **사실만 쓴다.** 숫자·가격·할인율·면적은 영상에서 말하거나 화면에 나온 것만 쓴다. 할인액이 안 나오면 "역대급 혜택"처럼 숫자 없이 쓴다. 법령·제도를 설명하는 영상이면 법령 도구나 공식 출처로 확인한다.
2. **인식 오타는 고친다.** 고유명사(단지명·지명·업체명)는 화면 글자를 기준으로 맞춘다. 고쳐 쓴 문구는 결과 보고 때 사용자에게 알린다.
3. **말하는 순간에 맞춘다.** 카드와 체크리스트 줄은 해당 단어가 들리는 시각(words의 시작 시각)에 등장시킨다.
4. **16:9 본편 배치**:
   - 원본 앞부분이 정지 배너이거나 인사말이면 `intro`로 바꾼다.
   - 주제 구간마다 `chapters`를 넣는다.
   - 숫자·목록·결론은 `card`/`rows`/`counter`/`quote`로 만든다.
   - 마지막 상담 안내에 `cta`와 `subscribe`를 넣는다.
   - 진행자 고정 샷에는 `zoom`(0.04~0.08)을 준다.
   - 원본이 이미 보여주는 정보는 다시 띄우지 않는다.
5. **쇼츠 구성**:
   - 45~75초 분량으로 만든다.
   - 순서는 ① 가장 센 훅, ② 숫자·희소성·핵심 근거, ③ 볼거리(뷰·내부), ④ 혜택, ⑤ 한 줄 결론, ⑥ 상담 CTA.
   - 구간은 문장 경계에서 자른다.
   - 자막은 쇼츠 전 구간에 붙이고 핵심어를 `<b>`로 강조한다.
6. **테마**: 고급 부동산은 `navy-gold`, 할인·이벤트는 `red`, 생활·인테리어는 `mint`, 강의·정보는 `blue`를 쓴다.

## 4단계 — 미리보기 검수 (반드시)

```bash
python SKILL_DIR/scripts/render.py 작업폴더/plan.json --preview
python SKILL_DIR/scripts/render.py 작업폴더/plan.json --preview --times 12.5,47,130   # 특정 시각만
```
`output/preview_16x9.png`와 `output/preview_9x16.png`(모아보기), 그리고 각 폴더의 장면별 PNG를 **직접 열어서** 아래를 확인한다.
- 카드가 원본 자막·로고·얼굴을 가리지 않는가
- 글자가 잘리거나 넘치지 않는가 (긴 문구는 줄이거나 `size`를 낮춘다)
- 오타와 사실관계
- 쇼츠 자막이 말과 맞는가

문제가 있으면 plan.json을 고치고 다시 미리보기를 돌린다. 문제가 없어질 때까지 반복한다.

## 5단계 — 렌더링

```bash
python SKILL_DIR/scripts/render.py 작업폴더/plan.json            # 둘 다
python SKILL_DIR/scripts/render.py 작업폴더/plan.json --only 9x16
```
- 5분짜리 영상 기준으로 일반 노트북에서 약 15~40분 걸린다. 진행 상황은 frame 번호로 출력된다. 오래 걸린다는 점을 사용자에게 먼저 알린다.
- `--workers`(기본: CPU 코어 수의 절반, 최대 4)를 줄이면 느려지지만 메모리 사용이 줄어든다.
- 결과물:
  - `{name}_16x9.mp4`: 1920×1080, 30fps
  - `{name}_9x16_쇼츠.mp4`: 1080×1920
  - `youtube_chapters.txt`
- 둘 다 오디오는 AAC 192k, 약 -14 LUFS로 맞춰진다.

## 6단계 — 최종 확인과 전달

- 완성된 두 영상에서 3~5개 시점의 프레임을 직접 보고 확인한다.
  ```bash
  python SKILL_DIR/scripts/grab.py 작업폴더/output/이름_16x9.mp4 30,95,200
  ```
- 업로드용 글을 `output/유튜브_업로드정보.md`에 작성한다.
  - 본편: 제목(핵심 키워드 + 숫자 + 감정 단어, 60자 이내), 설명(요약 3줄 + `youtube_chapters.txt` 목차 + 연락처), 태그 10개 안팎
  - 쇼츠: 제목(#shorts 포함), 설명 2줄, 해시태그 3개
- 사용자가 컴퓨터에 익숙하지 않을 수 있으므로 전문용어 없이 보고한다.
  - 무엇을 넣었는지
  - 어디에 파일이 있는지
  - 바로잡은 오타와 넣지 않은 정보(근거가 없어서 뺀 숫자 등)

## 문제 해결

| 증상 | 조치 |
|---|---|
| `playwright` 실행 오류 / 브라우저 없음 | `python -m playwright install chromium` |
| 회사 PC라 Chromium 다운로드가 막힘 | 설치된 Chrome 경로를 환경변수 `CHROMIUM_PATH`에 지정 |
| 음성 인식 모델 다운로드 실패 | 인터넷 연결을 확인한다. 느린 PC면 `--model small`을 쓴다 |
| 이모지가 네모로 보임 | Windows/Mac 기본 이모지 글꼴을 쓰므로 보통 정상이다. 리눅스는 `fonts-noto-color-emoji`를 설치한다 |
| 세로(9:16) 원본 | 본편은 흐린 배경 위에 원본을 맞춰 넣는다. 쇼츠는 가로 원본 기준으로 설계되어 있으니 미리보기로 배치를 꼭 확인한다 |
| 메모리 부족·멈춤 | `--workers 1` 또는 `2` |
