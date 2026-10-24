// 업무 대시보드 「SNS 한번에 올리기」 바구니로 보내기 — 만든 영상과 올릴 글을 대시보드 창으로 바로 넘깁니다.
//  - ko372.com 의 assets/js/social-make.js sendToDashboard(2026-10-22)와 **똑같은 약속**입니다.
//    대시보드를 '#mrkpost' 로 새 창(이름 'mrk_dash_sns')에 열고, 대시보드가 'mrk-outbox-ready' 를 보내 오면
//    { type:'mrk-outbox-post', payload, images, video, videoName } 를 한 번 보냅니다.
//    대시보드는 받으면 'mrk-outbox-ok', 못 받으면 'mrk-outbox-fail'({ error }) 로 답합니다. 3분 안에 답이 없으면 실패.
//  - payload = { from, kind:'video', title, desc, tags, texts:{ youtube, clip, blog, insta, threads, tiktok } }
//    desc·clip 은 300자, threads 는 500자까지(social-make.js 와 같음). tags 는 '#' 를 뗀 낱말.
//  - 창끼리 바로 건네므로 영상·글은 이 사이트 서버를 거치지 않습니다. 공개 범위는 넘기지 않습니다(대시보드는 늘 비공개로 시작).
//  - 대시보드는 ko372.com 에서 보낸 것만 받으므로, Claude 미리보기·단독 배포에서는 dashboardAvailable() 이 false 입니다.

import { inArtifact, serverInfo } from './platform.js';

export const DASH_ORIGIN = 'https://dashboard-nine-drab-95.vercel.app';
export const DASH_WINDOW = 'mrk_dash_sns';
export const DASH_FROM = 'MR.K 영상만들기';
/** 답을 기다리는 시간(ms) — social-make.js 와 같은 3분 */
export const DASH_TIMEOUT = 180000;
/** 글자 수 한도(social-make.js 와 같음) */
export const DASH_LIMITS = { desc: 300, clip: 300, threads: 500 };

const str = (v) => String(v ?? '').replace(/\r\n?/g, '\n').trim();

/**
 * 이 화면에서 대시보드로 보낼 수 있는지. ko372.com(회원 게이트가 있는 서버 — health 의 gate)에서만 true.
 * 환경 판단은 platform.js(serverInfo·inArtifact)에 맡깁니다.
 */
export async function dashboardAvailable() {
  if (inArtifact) return false;
  try { return !!(await serverInfo()).gate; } catch { return false; }
}

/** 보낼 payload 를 social-make.js 와 같은 모양·순서·글자 수로 만듭니다. */
export function buildPayload({ title, desc, tags, texts } = {}) {
  const t = texts && typeof texts === 'object' ? texts : {};
  return {
    from: DASH_FROM, kind: 'video',
    title: str(title), desc: str(desc).slice(0, DASH_LIMITS.desc),
    tags: (Array.isArray(tags) ? tags : []).map((x) => String(x ?? '').trim().replace(/^#+/, '')).filter(Boolean),
    texts: {
      youtube: str(t.youtube), clip: str(t.clip).slice(0, DASH_LIMITS.clip),
      blog: str(t.blog), insta: str(t.insta), threads: str(t.threads).slice(0, DASH_LIMITS.threads), tiktok: str(t.tiktok),
    },
  };
}

/**
 * 영상과 글을 대시보드로 보냅니다. 끝나면(대시보드가 'mrk-outbox-ok') resolve, 아니면 한국어 Error.
 * ※ 팝업이 막히지 않게 버튼 클릭에서 **다른 await 없이 바로** 불러 주세요(창은 첫 줄에서 엽니다).
 * @param {{ videoBlob: Blob, videoName?: string, title?: string, desc?: string, tags?: string[],
 *           texts?: { youtube?: string, clip?: string, blog?: string, insta?: string, threads?: string, tiktok?: string },
 *           images?: string[], onStatus?: (text: string) => void }} o
 */
export async function sendToDashboard({ videoBlob, videoName, title, desc, tags, texts, images = [], onStatus } = {}) {
  const status = typeof onStatus === 'function' ? (s) => { try { onStatus(s); } catch { /* 화면 표시 문제는 무시 */ } } : () => {};
  if (!(videoBlob instanceof Blob) || !videoBlob.size) throw new Error('보낼 영상이 없습니다. 영상을 먼저 만들어 주세요.');
  const w = window.open(DASH_ORIGIN + '/#mrkpost', DASH_WINDOW);
  if (!w) throw new Error('새 창이 막혔습니다 — 주소창 오른쪽의 팝업 허용을 눌러 주세요.');
  status('대시보드로 보낼 준비를 하는 중입니다…');
  const payload = buildPayload({ title, desc, tags, texts });
  const pics = (Array.isArray(images) ? images : []).filter((s) => typeof s === 'string' && s.startsWith('data:image/')).slice(0, 10);
  const name = str(videoName) || 'MRK-영상.mp4';
  status('대시보드가 받기를 기다리는 중입니다… (대시보드 비밀번호 창이 뜨면 넣어 주세요)');
  await new Promise((resolve, reject) => {
    let sent = false;
    let closedTimer = 0;
    const done = (fn, v) => { clearTimeout(timer); clearInterval(closedTimer); window.removeEventListener('message', onMsg); fn(v); };
    const timer = setTimeout(() => done(reject, new Error(sent ? '대시보드에서 답이 없습니다.' : '대시보드가 열리지 않았습니다 — 대시보드에 로그인한 뒤 다시 눌러 주세요.')), DASH_TIMEOUT);
    // 대시보드 창을 닫아 버리면 3분을 기다리지 않고 바로 알려 줍니다(약속에 없는 메시지는 보내지 않음)
    closedTimer = setInterval(() => { if (w.closed) done(reject, new Error('대시보드 창이 닫혔습니다. 다시 눌러 주세요.')); }, 1000);
    function onMsg(e) {
      if (e.origin !== DASH_ORIGIN || !e.data) return;
      if (e.data.type === 'mrk-outbox-ready' && !sent) {
        sent = true;
        status('대시보드로 영상을 넘기는 중입니다…');
        w.postMessage({ type: 'mrk-outbox-post', payload, images: pics, video: videoBlob, videoName: name }, DASH_ORIGIN);
      }
      if (e.data.type === 'mrk-outbox-ok') done(resolve);
      if (e.data.type === 'mrk-outbox-fail') done(reject, new Error(e.data.error ? `대시보드가 받지 못했습니다: ${String(e.data.error).slice(0, 200)}` : '대시보드가 받지 못했습니다.'));
    }
    window.addEventListener('message', onMsg);
  });
  status('대시보드 바구니에 담았습니다 — 영상 1개. 대시보드 창에서 [발행하기]를 누르세요.');
  return { payload };
}
