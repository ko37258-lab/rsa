# 사용법 영상 (모션그래픽 · 1920x1080 · 57초)

`motion-graphic-video-decor` 스킬 템플릿(Remotion 4.0.526)으로 만든 사용법 영상의 원본 설정입니다.

- 음성: ElevenLabs v4 · 상철오빠 보이스 · `../narration_take1.mp3`
- 카드 화면: `record-screen.js`로 실제 배포 사이트를 녹화 (해설 결과만 건축법 시행령 제118조 원문 기반 예시 데이터)
- `config.json` 단계 제목·클릭 강조·얼굴 PIP, `subs.json` 가라오케 자막(대본 그대로, 시점은 음성인식 실측), `script.txt` 확정 대본

## 다시 만들기
1. 스킬의 `assets/template`를 복사하고 `npm install`
2. `node record-screen.js <폴더>` → 화면 녹화 후 구간별로 내레이션 시간에 맞춰 `public/input.mp4` 생성
3. 이 폴더의 `config.json`, `subs.json`을 `src/`에, 음성을 `public/voice.mp3`에 넣기
4. `npx remotion render src/index.tsx Decor out.mp4 --codec=h264 --crf=18 --concurrency=4`
