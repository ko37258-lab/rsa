// MR.K 영상만들기 서버 함수 공통 — 접속 코드 검사, 오류 응답
export const accessCode = () => process.env.MRK_VIDEO_ACCESS_CODE || process.env.ACCESS_CODE || '';
export function checkCode(req, res) {
  const code = accessCode();
  if (code && req.headers['x-access-code'] !== code) {
    res.setHeader('cache-control', 'no-store');
    res.status(401).json({ error: '접속 코드가 맞지 않습니다. 사용 안내 화면에서 접속 코드를 입력하세요.' });
    return false;
  }
  return true;
}
export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch { return {}; }
}
