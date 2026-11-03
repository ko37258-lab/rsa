// ElevenLabs — 키 확인 + 내 계정의 목소리 목록(기본 목소리 + 내가 복제한 목소리) 불러오기
let cache = []; // [{ id, name, category }]

export const elevenVoiceCache = () => cache;

const CATEGORY = { cloned: '내가 복제한 목소리', professional: '전문 복제 목소리', generated: '생성한 목소리', premade: '기본 목소리' };

export async function loadElevenVoices() {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } });
  if (!r.ok) {
    const err = new Error(`ElevenLabs ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const j = await r.json();
  const list = (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category }));
  // 내가 만든(복제한) 목소리를 맨 위로
  const rank = (c) => (c === 'cloned' || c === 'professional' ? 0 : c === 'generated' ? 1 : 2);
  list.sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
  cache = list;
  return list;
}

export const categoryLabel = (c) => CATEGORY[c] || 'ElevenLabs';

export async function verifyEleven() {
  try {
    const list = await loadElevenVoices();
    const mine = list.filter((v) => v.category === 'cloned' || v.category === 'professional').length;
    return { ok: true, msg: `연결됨 (목소리 ${list.length}개${mine ? `, 내 복제 목소리 ${mine}개` : ''})` };
  } catch (e) {
    cache = [];
    if (e.status === 401) return { ok: false, msg: '키가 올바르지 않거나, 키 권한에 "Voices(목소리) 읽기"가 꺼져 있습니다. 키를 만들 때 권한 제한을 풀어 주세요.' };
    if (e.status) return { ok: false, msg: `ElevenLabs 응답 오류 (${e.status})` };
    return { ok: false, msg: '인터넷 연결을 확인하세요 (ElevenLabs 서버에 연결 실패).' };
  }
}
