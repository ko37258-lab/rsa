# k-shorts 터널 켜기 (Windows)

`https://k-shorts.mrkzip.com` 에 **Cloudflare 1033 / 530** 오류가 날 때 쓰는 도구입니다.
1033은 "PC의 cloudflared 터널이 Cloudflare에 연결돼 있지 않다"는 뜻입니다.

## 사용법

1. 이 폴더(`k-shorts-tunnel.ps1`, `k-shorts-tunnel-start.bat`)를 **k-shorts가 돌아가는 PC**에 받습니다.
2. `k-shorts-tunnel-start.bat` 을 **더블클릭**합니다.
   - "Windows의 PC 보호" 창이 뜨면 → **추가 정보** → **실행**
   - 관리자 권한 확인 창이 뜨면 → **예**
3. 창에 나오는 결과를 확인합니다. 마지막 결과 칸에 이렇게 나오면 끝난 것입니다.

```
  접속              : 정상 - 열립니다
  터널 서비스        : 켜져 있음
  PC 켤 때 자동 시작 : 켜짐 (PC를 켜면 터널이 자동으로 연결됩니다)
```

## 스크립트가 하는 일

| 단계 | 내용 |
|---|---|
| 1 | 지금 주소가 열리는지 확인 |
| 2 | cloudflared 찾기 (없으면 winget으로 설치, 1년 넘은 버전이면 업데이트) |
| 3 | 터널 설정 찾기: `%USERPROFILE%\.cloudflared\*.yml`, 실행 중인 cloudflared 의 토큰 |
| 4 | Windows 서비스 `Cloudflared` 로 등록하고 켭니다. 시작 유형은 **자동**이고, 꺼지면 5초/15초/60초 뒤 자동으로 다시 켭니다 |
| 5 | 주소가 실제로 열리는지 다시 확인하고 결과를 표시 |

- 이미 열려 있으면 연결을 끊지 않고 자동 시작 설정만 확인합니다.
- 설정 파일도, 실행 중인 토큰도 없으면 Cloudflare 대시보드의 **터널 토큰**을 붙여넣으라고 안내합니다.
  (one.dash.cloudflare.com → Networks → Tunnels → 터널 → Configure → Windows 명령의 `eyJ...` 부분)
- 터널 기록: `C:\ProgramData\cloudflared\k-shorts-tunnel.log`

## 결과별 의미

| 결과 | 뜻 / 할 일 |
|---|---|
| 정상 - 열립니다 | 끝. 다음부터 PC를 켜면 자동 연결 |
| 터널은 연결됨 / k-shorts 프로그램이 응답 안 함 (502) | 터널은 정상. PC 안의 k-shorts 웹 프로그램을 켜야 함 |
| 아직 안 열림 - 1033 | 이 PC에 등록된 터널과 주소가 연결된 터널이 다를 수 있음 → 대시보드 토큰으로 다시 실행 |
