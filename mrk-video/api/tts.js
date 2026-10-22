// 내레이션 만들기 — Fish Audio 중계. 브라우저가 보낸 사용자 API 키로 Fish Audio TTS 를 대신 부르고 mp3 바이트를 그대로 돌려줍니다.
// Fish Audio 는 브라우저에서 직접 부르면 CORS 로 막히므로 서버가 한 번 전달만 합니다. 제미나이·일레븐랩스는 브라우저가 직접 부르므로 여기로 오지 않습니다(provider 가 fish 가 아니면 400).
// 키는 로그·응답·저장 어디에도 남기지 않습니다. 접속 코드(MRK_VIDEO_ACCESS_CODE 또는 ACCESS_CODE)가 서버에 있어야 켜집니다(ai.js 와 같은 규칙).
import { accessCode, checkCode, readBody } from './_common.mjs';

const FISH_URL = 'https://api.fish.audio/v1/tts';
const MODELS = ['drama-3', 's2.1-pro', 's1'];
const VOICE_RE = /^[A-Za-z0-9_-]{4,64}$/;
const MAX_TEXT = 3000;
const TIMEOUT_MS = 55_000;

// Fish 응답 상태 → 우리 상태·한국어 안내
const FISH_ERRORS = {
  401: [401, 'Fish Audio API 키가 맞지 않습니다. fish.audio → API Keys 에서 다시 확인하세요.'],
  402: [402, 'Fish Audio 크레딧이 부족합니다. fish.audio 에서 충전하세요.'],
  403: [401, 'Fish Audio 가 이 키의 사용을 막았습니다. 키 권한을 확인하세요.'],
  404: [422, '음성 모델 ID 를 확인하세요. fish.audio 의 내 음성에서 ID 를 복사해 넣으세요.'],
  422: [422, '음성 모델 ID 또는 대본을 확인하세요.'],
  429: [429, 'Fish Audio 요청이 많습니다. 잠시 뒤 다시 시도하세요.'],
};

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });
  if (!accessCode()) return res.status(503).json({ error: '서버에 접속 코드를 설정해야 Fish Audio 중계를 쓸 수 있습니다.' });
  if (!checkCode(req, res)) return;

  const b = readBody(req);
  if (b.provider !== 'fish') return res.status(400).json({ error: '이 서버는 Fish Audio 만 전달합니다. 제미나이·일레븐랩스는 브라우저에서 바로 부릅니다.' });
  const key = String(b.key || '').trim();
  if (key.length < 4 || key.length > 200) return res.status(400).json({ error: 'Fish Audio API 키를 넣어 주세요.' });
  const voice = String(b.voice || '').trim();
  if (!VOICE_RE.test(voice)) return res.status(400).json({ error: '음성 모델 ID 는 영문·숫자 4~64자입니다.' });
  const model = b.model == null || b.model === '' ? 'drama-3' : String(b.model);
  if (!MODELS.includes(model)) return res.status(400).json({ error: `엔진은 ${MODELS.join(', ')} 중 하나여야 합니다.` });
  const text = String(b.text || '').trim();
  if (!text) return res.status(400).json({ error: '대본이 비어 있습니다.' });
  if (text.length > MAX_TEXT) return res.status(400).json({ error: `대본은 ${MAX_TEXT.toLocaleString('ko-KR')}자 이하여야 합니다.` });
  let speed = Number(b.speed);
  if (!Number.isFinite(speed)) speed = 1;
  speed = Math.round(Math.min(2, Math.max(0.5, speed)) * 100) / 100;

  let r;
  try {
    r = await fetch(FISH_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', model },
      body: JSON.stringify({ text, reference_id: voice, format: 'mp3', mp3_bitrate: 128, normalize: true, prosody: { speed } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const slow = e?.name === 'TimeoutError';
    return res.status(slow ? 504 : 502).json({ error: slow ? 'Fish Audio 응답이 없습니다. 대본을 줄여 다시 시도하세요.' : 'Fish Audio 에 연결하지 못했습니다.' });
  }
  if (!r.ok) {
    // 오류 본문은 그대로 돌려주지도, 남기지도 않습니다(키가 섞일 수 있음). 상태 번호만 기록합니다.
    console.error('fish tts', r.status);
    const [code, message] = FISH_ERRORS[r.status] || [502, `Fish Audio 오류 (${r.status})`];
    return res.status(code).json({ error: message });
  }
  let buf;
  try {
    buf = Buffer.from(await r.arrayBuffer());
  } catch {
    return res.status(502).json({ error: 'Fish Audio 음성을 받다가 끊겼습니다. 다시 시도하세요.' });
  }
  if (!buf.length) return res.status(502).json({ error: 'Fish Audio 가 빈 음성을 돌려주었습니다. 다시 시도하세요.' });
  res.setHeader('content-type', 'audio/mpeg');
  res.setHeader('content-length', String(buf.length));
  return res.status(200).send(buf);
}
