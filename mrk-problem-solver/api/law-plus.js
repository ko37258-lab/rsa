// Mr. K 문제 바로 해설 — 정밀 조회 확장 프록시 (Vercel Edge Function, /api/law-plus)
// /api/law(법령검색·조문·판례)가 다루지 않는 자료를 법제처 국가법령정보 공동활용 API(DRF)에서 가져온다.
//   searchArticle : 법령 안에서 키워드로 조문 찾기 (+ 키워드가 나오는 별표 안내)
//   delegation    : 위임조문 3단비교 — 법률 조문 ↔ 시행령 ↔ 시행규칙 원문
//   annex         : 별표 목록 / 별표 원문 (keyword로 해당 부분만)
//   searchExpc    : 법제처 법령해석례 검색
//   expcDetail    : 법령해석례 질의요지·회답·이유
//
// OC 우선순위: 환경변수 LAW_OC → 쿼리 ?oc= → 기본값 'ko372' (실패 시 'test' OC로 자동 재시도)

export const config = { runtime: 'edge' };

const DRF = 'https://www.law.go.kr/DRF';
const DEFAULT_OC = 'ko372';
const MAX_TEXT = 12000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

// 법령 원문은 자주 바뀌지 않으므로 성공 응답만 CDN에 6시간 캐시
const json = (obj, status = 200, cache = false) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: cache ? { ...CORS, 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } : CORS,
  });

class UserError extends Error {}

const arr = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);
const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : v == null ? [] : [String(v)]);
const nospace = (s) => String(s || '').replace(/\s/g, '');
const clip = (s, n = MAX_TEXT) => (s.length > n ? s.slice(0, n) + '\n…(이하 생략)' : s);
const keywords = (q) => String(q || '').split(/[\s,]+/).map((k) => k.trim()).filter(Boolean);

async function drfRaw(path, params, oc) {
  const url = new URL(`${DRF}/${path}`);
  url.searchParams.set('OC', oc);
  url.searchParams.set('type', 'JSON');
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { headers: { 'User-Agent': 'MrK-Solver/1.0' }, signal: ctrl.signal });
      const text = await res.text();
      clearTimeout(timer);
      let obj;
      try { obj = JSON.parse(text); }
      catch { throw new Error(`법제처 응답을 해석할 수 없습니다 (HTTP ${res.status}). 응답 앞부분: ${text.replace(/\s+/g, ' ').slice(0, 120)}`); }
      // OC 미등록 등은 HTTP 200 + {"result":"사용자 정보 검증에 실패하였습니다."}로 온다
      if (typeof obj?.result === 'string' && /검증|인증/.test(obj.result)) {
        const err = new Error(`법제처 OC 인증 실패(${oc}): ${obj.result}`);
        err.auth = true;
        throw err;
      }
      return obj;
    } catch (e) {
      lastErr = e;
      if (e.auth) break;
    }
  }
  throw lastErr;
}

async function drf(path, params, oc) {
  try { return await drfRaw(path, params, oc); }
  catch (e) {
    if (oc === 'test' || !e.auth) throw e; // 인증 문제일 때만 공용 'test' OC로 재시도
    return drfRaw(path, params, 'test');
  }
}

// "건축법 시행령" → 현행 법령의 MST(법령일련번호)
async function resolveLaw(name, oc) {
  const q = String(name || '').trim();
  if (!q) throw new UserError('law_name이 비어 있습니다.');
  const d = await drf('lawSearch.do', { target: 'law', query: q, display: '20' }, oc);
  const list = arr(d?.LawSearch?.law);
  if (!list.length) throw new UserError(`"${q}" 법령을 찾지 못했습니다. search_law로 정확한 법령명을 먼저 확인하세요.`);
  const key = nospace(q);
  const cur = (x) => (x.현행연혁코드 || '현행') === '현행';
  const hit =
    list.find((x) => nospace(x.법령명한글) === key && cur(x)) ||
    list.find((x) => nospace(x.법령명한글) === key) ||
    list.find((x) => nospace(x.법령약칭명) === key) ||
    list.find(cur) || list[0];
  return { mst: hit.법령일련번호, name: hit.법령명한글, kind: hit.법령구분명, ef: hit.시행일자 };
}

async function fullLaw(law, oc) {
  const d = await drf('lawService.do', { target: 'law', MST: law.mst }, oc);
  if (!d?.법령) throw new Error('법령 본문을 받지 못했습니다.');
  return d.법령;
}

// "제19조의2", "19의2", "19-2" → {no:'19', sub:'2'}
function parseJo(s) {
  const m = String(s || '').replace(/\s/g, '').match(/^제?(\d+)(?:조)?(?:(?:의|-)(\d+))?/);
  return m ? { no: String(Number(m[1])), sub: m[2] ? String(Number(m[2])) : '' } : null;
}
const joLabel = (j) => `제${j.no}조${j.sub ? '의' + j.sub : ''}`;

function articleText(a) {
  const out = [String(a.조문내용 || '').trim()];
  for (const h of arr(a.항)) {
    out.push(...flat(h.항내용));
    for (const ho of arr(h.호)) {
      out.push(...flat(ho.호내용));
      for (const mo of arr(ho.목)) out.push(...flat(mo.목내용));
    }
  }
  return out.map((s) => stripTags(s).trim()).filter(Boolean).join('\n');
}

// 3단비교 원문은 줄바꿈이 없어 항·호 앞에서 줄을 나눠 읽기 쉽게
const breakLines = (s) =>
  String(s || '')
    .replace(/\s*([①-⑳])\s*/g, '\n$1 ')
    .replace(/([^\d\s])\s*(\d{1,2})\.\s{2,}/g, '$1\n$2. ')
    .replace(/(\S)([가나다라마바사아자차카타파하])\.\s{2,}/g, '$1\n  $2. ')
    .trim();
const stripTags = (s) => String(s || '').replace(/<img[^>]*>/gi, '').replace(/<[^>]+>/g, '');

function annexLabel(b) {
  const no = String(Number(b.별표번호 || 0));
  const sub = Number(b.별표가지번호 || 0);
  return sub ? `${no}의${sub}` : no;
}

function annexText(b) {
  return flat(b.별표내용)
    .map((s) => stripTags(s).replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 키워드가 들어간 줄과 앞뒤 문맥만 뽑기
function excerpt(text, kws, ctx = 3) {
  const lines = text.split('\n');
  const keep = new Set();
  lines.forEach((l, i) => {
    if (kws.some((k) => nospace(l).includes(nospace(k))))
      for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++) keep.add(j);
  });
  if (!keep.size) return '';
  let out = '', prev = -2;
  [...keep].sort((a, b) => a - b).forEach((i) => {
    if (i !== prev + 1 && out) out += '\n…\n';
    out += lines[i] + '\n';
    prev = i;
  });
  return out.trim();
}

// ---------- ops ----------

async function searchArticle(p, oc) {
  const kws = keywords(p.q);
  if (!kws.length) throw new UserError('keyword가 비어 있습니다.');
  const law = await resolveLaw(p.lm, oc);
  const body = await fullLaw(law, oc);

  const hits = [];
  for (const a of arr(body?.조문?.조문단위)) {
    if (a.조문여부 !== '조문') continue;
    const text = articleText(a);
    const flatText = nospace(text);
    const score = kws.filter((k) => flatText.includes(nospace(k))).length;
    if (!score) continue;
    const j = parseJo(text);
    hits.push({
      score,
      조문: text.split('\n')[0].slice(0, 80),
      article: j ? (j.sub ? `${j.no}의${j.sub}` : j.no) : '',
      일치부분: excerpt(text, kws, 0).slice(0, 600),
    });
  }
  hits.sort((x, y) => y.score - x.score);

  const annexHits = [];
  for (const b of arr(body?.별표?.별표단위)) {
    if (b.별표구분 !== '별표') continue;
    const t = nospace(annexText(b));
    const score = kws.filter((k) => t.includes(nospace(k))).length;
    if (score) annexHits.push({ score, 별표: annexLabel(b), 제목: b.별표제목 });
  }
  annexHits.sort((x, y) => y.score - x.score);

  return {
    법령명: law.name,
    시행일자: law.ef,
    검색어: kws.join(' '),
    결과수: hits.length,
    조문목록: hits.slice(0, 8).map(({ score, ...r }) => ({ ...r, 일치키워드수: `${score}/${kws.length}` })),
    별표목록: annexHits.slice(0, 5).map(({ score, ...r }) => r),
    안내: hits.length
      ? '정확한 원문은 get_law_article(law_name, article)로 확인하세요. 별표목록이 있으면 get_annex로 별표 원문을 확인하세요.'
      : '일치하는 조문이 없습니다. 키워드를 줄이거나 다른 표현으로 다시 찾으세요.',
  };
}

async function delegation(p, oc) {
  const j = parseJo(p.jo);
  if (!j) throw new UserError('article(조 번호)이 올바르지 않습니다. 예: "76", "19의2"');
  const target = await resolveLaw(p.lm, oc);
  const lower = /시행규칙$/.test(nospace(target.name)) ? 'rule' : /시행령$/.test(nospace(target.name)) ? 'decree' : 'act';
  const act = lower === 'act' ? target : await resolveLaw(target.name.replace(/\s*(시행령|시행규칙)$/, ''), oc);

  const d = await drf('lawService.do', { target: 'thdCmp', MST: act.mst, knd: '2' }, oc);
  const rows = arr(d?.LspttnThdCmpLawXService?.위임조문삼단비교?.법률조문);
  if (!rows.length) throw new UserError(`${act.name}의 위임조문 3단비교 자료가 없습니다. get_law_article로 각 법령 조문을 따로 확인하세요.`);

  const sameJo = (title, no4, sub2) => {
    const t = parseJo(title);
    if (t) return t.no === j.no && t.sub === j.sub;
    return String(Number(no4)) === j.no && String(Number(sub2 || 0) || '') === j.sub;
  };
  const picked = rows.filter((r) => {
    if (lower === 'act') return sameJo(r.조제목, r.조번호, r.조가지번호) && r.조제목;
    const key = lower === 'decree' ? '시행령조문' : '시행규칙조문';
    return arr(r[key]).some((x) => sameJo(x.조제목, x.조번호, x.조가지번호));
  });
  if (!picked.length)
    throw new UserError(`${target.name} ${joLabel(j)}에 연결된 위임조문을 찾지 못했습니다. 위임이 없는 조문일 수 있으니 get_law_article로 원문을 확인하세요.`);

  const uniq = (list) => {
    const seen = new Map();
    for (const x of list) if (x?.조제목 && !seen.has(x.조제목)) seen.set(x.조제목, x);
    return [...seen.values()];
  };
  const fmt = (x, lawName) => ({ 법령명: x.법령명 || lawName, 조문: x.조제목, 원문: clip(breakLines(stripTags(x.조내용)), 4000) });

  const acts = uniq(picked.map((r) => ({ 조제목: r.조제목, 조내용: r.조내용 }))).map((x) => fmt(x, act.name));
  const decrees = uniq(picked.flatMap((r) => arr(r.시행령조문))).map((x) => fmt(x));
  const rules = uniq(picked.flatMap((r) => arr(r.시행규칙조문))).map((x) => fmt(x));

  let out = { 기준: `${target.name} ${joLabel(j)}`, 법률조문: acts, 시행령조문: decrees, 시행규칙조문: rules };
  // 응답이 너무 크면 하위 조문 수를 줄인다
  while (JSON.stringify(out).length > MAX_TEXT + 2000 && (out.시행규칙조문.length > 1 || out.시행령조문.length > 1)) {
    if (out.시행규칙조문.length > 1) out.시행규칙조문 = out.시행규칙조문.slice(0, -1);
    else out.시행령조문 = out.시행령조문.slice(0, -1);
    out.생략안내 = '연결 조문이 많아 일부만 표시했습니다. 나머지는 get_law_article로 조회하세요.';
  }
  out.안내 = '위 원문은 법제처 위임조문 3단비교 자료입니다. basis.quote에는 이 원문 문장을 그대로 인용하세요.';
  return out;
}

async function annex(p, oc) {
  const law = await resolveLaw(p.lm, oc);
  const body = await fullLaw(law, oc);
  const list = arr(body?.별표?.별표단위).filter((b) => b.별표구분 === '별표');
  if (!list.length) throw new UserError(`${law.name}에는 별표가 없습니다.`);

  const want = String(p.no || '').replace(/\s|별표|제|호/g, '').replace(/-/g, '의');
  if (!want) {
    return {
      법령명: law.name,
      시행일자: law.ef,
      별표목록: list.map((b) => ({ 별표: annexLabel(b), 제목: b.별표제목 })),
      안내: 'get_annex에 annex_no(예: "2", "1의2")를 넣으면 별표 원문을 볼 수 있습니다.',
    };
  }
  const b = list.find((x) => annexLabel(x) === want);
  if (!b) throw new UserError(`${law.name}에 별표 ${want}이(가) 없습니다. annex_no를 비우고 호출해 목록을 확인하세요.`);

  const text = annexText(b);
  const kws = keywords(p.q);
  if (kws.length) {
    const part = excerpt(text, kws, 4);
    if (part)
      return { 법령명: law.name, 시행일자: law.ef, 별표: `별표 ${want}`, 제목: b.별표제목, 검색어: kws.join(' '), 원문발췌: clip(part) };
  }
  return {
    법령명: law.name,
    시행일자: law.ef,
    별표: `별표 ${want}`,
    제목: b.별표제목,
    원문: clip(text),
    ...(text.length > MAX_TEXT ? { 안내: '별표가 길어 일부만 표시했습니다. keyword를 넣으면 해당 부분만 볼 수 있습니다.' } : {}),
    ...(kws.length ? { 검색결과: `"${kws.join(' ')}"이(가) 별표에 없어 전체를 표시합니다.` } : {}),
  };
}

async function searchExpc(p, oc) {
  const q = String(p.q || '').trim();
  if (!q) throw new UserError('query가 비어 있습니다.');
  let d = await drf('lawSearch.do', { target: 'expc', query: q, display: '10' }, oc);
  let list = arr(d?.Expc?.expc);
  if (!list.length) {
    d = await drf('lawSearch.do', { target: 'expc', query: q, display: '10', search: '2' }, oc);
    list = arr(d?.Expc?.expc);
  }
  return {
    검색어: q,
    결과수: list.length,
    해석례목록: list.map((x) => ({
      안건명: x.안건명,
      안건번호: x.안건번호,
      회신기관: x.회신기관명,
      회신일자: x.회신일자,
      해석례일련번호: x.법령해석례일련번호,
    })),
    안내: list.length
      ? 'get_interpretation에 해석례일련번호를 넣으면 질의요지·회답·이유를 볼 수 있습니다.'
      : '검색 결과가 없습니다. 핵심 단어만 넣어 다시 검색하세요.',
  };
}

async function expcDetail(p, oc) {
  const id = String(p.id || '').trim();
  if (!/^\d+$/.test(id)) throw new UserError('interp_id(해석례일련번호)가 올바르지 않습니다.');
  const d = await drf('lawService.do', { target: 'expc', ID: id }, oc);
  const e = d?.ExpcService;
  if (!e) throw new UserError('해당 법령해석례를 찾지 못했습니다.');
  return {
    안건명: e.안건명,
    안건번호: e.안건번호,
    해석기관: e.해석기관명,
    해석일자: e.해석일자,
    질의요지: clip(String(e.질의요지 || ''), 3000),
    회답: clip(String(e.회답 || ''), 3000),
    이유: clip(String(e.이유 || ''), 6000),
  };
}

const OPS = { searchArticle, delegation, annex, searchExpc, expcDetail };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const sp = new URL(req.url).searchParams;
  const op = sp.get('op') || '';
  const fn = OPS[op];
  if (!fn) return json({ error: `알 수 없는 op: "${op}" (${Object.keys(OPS).join(' | ')})` }, 400);

  const oc = (typeof process !== 'undefined' && process.env?.LAW_OC) || sp.get('oc') || DEFAULT_OC;
  const p = { lm: sp.get('lm'), jo: sp.get('jo'), no: sp.get('no'), q: sp.get('q'), id: sp.get('id') };
  try {
    return json(await fn(p, oc), 200, true);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message });
    return json({ error: '법제처 조회 중 오류가 발생했습니다. 이 근거는 verified:false로 처리하라.', detail: String(e.message || e).slice(0, 300) }, 502);
  }
}
