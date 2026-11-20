// 부동산 AI 강의 쇼츠 광고 (1080x1920) — 모션그래픽 영상꾸미기 스타일
import React from 'react';
import {
  AbsoluteFill, Audio, Composition, Img, OffthreadVideo, Sequence, registerRoot, staticFile,
  useCurrentFrame, interpolate, spring, Easing, delayRender, continueRender,
} from 'remotion';

const FPS = 30;
const DUR = 27.5;
const OFF = 0.6; // 내레이션 시작 시점
const FONT = "'Pretendard','Malgun Gothic',sans-serif";
const MONO = "Consolas,'Cascadia Mono','Pretendard',monospace";
const INK = '#111111';
const GREEN = '#1fcf62';
const RED = '#ef4444';
const GREY = '#6f6b63';
const ez = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const appear = (t: number, at: number, d = 0.4) => interpolate(t, [at, at + d], [0, 1], {...clamp, easing: ez});
const f = (s: number) => Math.round(s * FPS);
const sp = (t: number, at: number, damping = 14, stiffness = 140) =>
  spring({frame: Math.max(0, Math.round((t - at) * FPS)), fps: FPS, config: {damping, stiffness}});

if (typeof window !== 'undefined' && !(window as any).__ptd) {
  (window as any).__ptd = true;
  const h = delayRender('Pretendard');
  const ws: [string, string][] = [['Medium', '500'], ['SemiBold', '600'], ['Bold', '700'], ['ExtraBold', '800'], ['Black', '900']];
  Promise.all(ws.map(([n, w]) => new FontFace('Pretendard', `url(${staticFile(`fonts/Pretendard-${n}.otf`)})`, {weight: w}).load().then((ff) => { (document as any).fonts.add(ff); })))
    .then(() => continueRender(h)).catch(() => continueRender(h));
}

// 장면 구간 (절대 초)
const S = {
  hook: [0, 3.1], prof: [3.1, 7.0], ai: [7.0, 9.7], feat: [9.7, 15.1], class: [15.1, 17.5], cta: [17.5, DUR],
} as const;
const inS = (t: number, k: keyof typeof S) => t >= S[k][0] && t < S[k][1];
// 장면 퇴장(왼쪽으로 밀리며 흐려짐)
const exitOf = (t: number, k: keyof typeof S) => interpolate(t, [S[k][1] - 0.3, S[k][1]], [0, 1], clamp);
const exitStyle = (e: number): React.CSSProperties => ({opacity: 1 - e, transform: `translateX(${-60 * e}px)`, filter: `blur(${10 * e}px)`});

// 키네틱 글자: 흐림 + 넓은 자간 → 모임
const Kin: React.FC<{t: number; at: number; size: number; color?: string; from?: 'up' | 'side'; children: React.ReactNode; style?: React.CSSProperties}> = ({t, at, size, color = INK, from = 'up', children, style}) => {
  const k = sp(t, at);
  const m = Math.min(1, k);
  return (
    <div style={{fontFamily: FONT, fontWeight: 900, fontSize: size, color, lineHeight: 1.08, whiteSpace: 'pre',
      letterSpacing: interpolate(k, [0, 1], [size * 0.18, -size * 0.04]),
      transform: from === 'up' ? `translateY(${(1 - k) * 60}px)` : `translateX(${(1 - k) * 140}px)`,
      filter: `blur(${(1 - m) * 16}px)`, opacity: Math.min(1, k * 1.4), ...style}}>{children}</div>
  );
};

const Bg: React.FC<{t: number}> = ({t}) => (
  <AbsoluteFill style={{background: `radial-gradient(1100px 1500px at ${50 + Math.sin(t / 5) * 6}% 42%, #f4f2ee 0%, #e9e7e2 55%, #dcd9d2 100%)`}}>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(60,50,30,.16) 100%)'}} />
  </AbsoluteFill>
);

const Header: React.FC<{t: number}> = ({t}) => {
  const scenes = Object.keys(S) as (keyof typeof S)[];
  const idx = scenes.findIndex((k) => inS(t, k));
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, height: 8, width: `${(t / DUR) * 100}%`, background: GREEN}} />
      <div style={{position: 'absolute', left: 64, right: 64, top: 70, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: 24, color: GREY, letterSpacing: 1.5, opacity: appear(t, 0.1)}}>
        <span style={{fontFamily: FONT, fontWeight: 900, fontSize: 32, color: INK, letterSpacing: -0.5, marginRight: 18}}>MR.HOMES</span>
        REAL ESTATE × AI
        <div style={{flex: 1}} />
        {scenes.map((_, i) => <div key={i} style={{width: 12, height: 12, borderRadius: 6, marginLeft: 9, background: i <= idx ? INK : 'rgba(0,0,0,.18)'}} />)}
      </div>
    </>
  );
};

// 흰 카드 (브라우저 창)
const Card: React.FC<{x: number; y: number; w: number; h: number; url: string; enter: number; children: React.ReactNode}> = ({x, y, w, h, url, enter, children}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 26, overflow: 'hidden', background: '#fff',
    boxShadow: '0 40px 90px rgba(40,32,20,.22), 0 2px 6px rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.06)',
    opacity: enter, transform: `translateY(${(1 - enter) * 60}px)`, filter: `blur(${(1 - enter) * 10}px)`}}>
    <div style={{height: 60, background: '#e8eaed', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 11}}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{width: 18, height: 18, borderRadius: 9, background: c}} />)}
      <div style={{marginLeft: 16, flex: 1, background: '#fff', borderRadius: 999, height: 40, display: 'flex', alignItems: 'center', padding: '0 22px', fontFamily: FONT, fontSize: 24, fontWeight: 600, color: '#333'}}>🔒 {url}</div>
    </div>
    <div style={{position: 'relative', width: w, height: h - 60, overflow: 'hidden', background: '#f4f2ee'}}>{children}</div>
  </div>
);

const Pill: React.FC<{t: number; at: number; bg: string; children: React.ReactNode; size?: number}> = ({t, at, bg, children, size = 36}) => {
  const q = sp(t, at, 12, 160);
  return <div style={{background: bg, color: '#fff', fontFamily: FONT, fontSize: size, fontWeight: 800, padding: '14px 30px', borderRadius: 999, whiteSpace: 'nowrap',
    opacity: Math.min(1, q * 1.5), transform: `translateY(${(1 - q) * 40}px) scale(${0.8 + 0.2 * q})`}}>{children}</div>;
};

// ① 훅
const Hook: React.FC<{t: number}> = ({t}) => {
  const e = exitOf(t, 'hook');
  const pulse = 1 + Math.max(0, Math.sin((t - 1.6) * 6)) * 0.03 * (t > 1.6 ? 1 : 0);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: '0 80px', ...exitStyle(e)}}>
      <div style={{fontFamily: MONO, color: GREY, fontSize: 30, letterSpacing: 4, opacity: appear(t, 0.1)}}>QUESTION — 01</div>
      <Kin t={t} at={0.55} size={150} style={{marginTop: 24}}>부동산 공부,</Kin>
      <Kin t={t} at={1.35} size={150} color={GREEN} from="side">아직도</Kin>
      <Kin t={t} at={1.9} size={150}>혼자 하세요?</Kin>
      <div style={{height: 10, background: INK, width: `${appear(t, 2.3, 0.5) * 100}%`, marginTop: 18}} />
    </AbsoluteFill>
  );
};

// ② 교수 소개
const Prof: React.FC<{t: number}> = ({t}) => {
  const e = exitOf(t, 'prof');
  const st = S.prof[0];
  const enter = appear(t, st, 0.55);
  const kb = interpolate(t, [st, S.prof[1]], [1.12, 1.0]);
  const years = Math.round(interpolate(t, [st + 0.2, st + 0.9], [0, 28], {...clamp, easing: ez}));
  const tagK = sp(t, OFF + 4.52, 10, 180);
  return (
    <AbsoluteFill style={exitStyle(e)}>
      <Card x={110} y={190} w={860} h={980} url="mrhomes.co.kr / 고상철" enter={enter}>
        <Img src={staticFile('prof.jpg')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 48%', transform: `scale(${kb})`}} />
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 300, background: 'linear-gradient(transparent, rgba(0,0,0,.72))'}} />
        <div style={{position: 'absolute', left: 40, bottom: 34, fontFamily: FONT, color: '#fff'}}>
          <div style={{fontSize: 30, fontWeight: 700, opacity: appear(t, st + 0.8)}}>서울사이버대학교 부동산AI학과 교수</div>
          <div style={{fontSize: 92, fontWeight: 900, letterSpacing: -3, opacity: appear(t, st + 1.0), transform: `translateY(${(1 - appear(t, st + 1.0)) * 30}px)`}}>고상철</div>
        </div>
        <div style={{position: 'absolute', right: 30, top: 30, background: INK, color: '#fff', borderRadius: 22, padding: '14px 26px', fontFamily: FONT, textAlign: 'center', opacity: appear(t, st + 0.2), borderLeft: `10px solid ${GREEN}`}}>
          <div style={{fontSize: 88, fontWeight: 900, lineHeight: 1, letterSpacing: -3}}>{years}<span style={{fontSize: 40}}>년</span></div>
          <div style={{fontSize: 26, fontWeight: 700, color: '#cfcbc2'}}>부동산공법 강의</div>
        </div>
      </Card>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1105, display: 'flex', justifyContent: 'center'}}>
        <div style={{background: RED, color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 64, padding: '14px 46px', borderRadius: 999, letterSpacing: -2,
          transform: `scale(${tagK}) rotate(${-4 * tagK}deg)`, opacity: Math.min(1, tagK * 2), boxShadow: '0 16px 40px rgba(239,68,68,.35)'}}>"공법의 신"</div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1235, display: 'flex', justifyContent: 'center', gap: 14}}>
        <Pill t={t} at={st + 1.6} bg={INK} size={30}>도시계획 박사</Pill>
        <Pill t={t} at={st + 1.85} bg={INK} size={30}>미스터홈즈 대표</Pill>
        <Pill t={t} at={st + 2.1} bg={GREEN} size={30}>체인 100여 곳</Pill>
      </div>
    </AbsoluteFill>
  );
};

// ③ 이제 부동산도 AI로
const AiScene: React.FC<{t: number}> = ({t}) => {
  const e = exitOf(t, 'ai');
  const aiAt = OFF + 7.64;
  const k = sp(t, aiAt, 9, 120);
  const ring = interpolate(t, [aiAt, aiAt + 0.8], [0, 1], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', ...exitStyle(e)}}>
      <div style={{fontFamily: MONO, color: GREY, fontSize: 30, letterSpacing: 4, opacity: appear(t, S.ai[0])}}>NOW — 2026</div>
      <Kin t={t} at={OFF + 6.36} size={120} style={{marginTop: 20}}>이제 부동산도</Kin>
      <div style={{position: 'relative', marginTop: 10}}>
        {ring < 1 && <div style={{position: 'absolute', left: '50%', top: '50%', width: 600 * ring + 100, height: 600 * ring + 100, marginLeft: -(300 * ring + 50), marginTop: -(300 * ring + 50), borderRadius: '50%', border: `10px solid ${GREEN}`, opacity: 1 - ring}} />}
        <div style={{fontFamily: FONT, fontWeight: 900, fontSize: 380, lineHeight: 1, color: GREEN, letterSpacing: -14, transform: `scale(${0.4 + 0.6 * k})`, opacity: Math.min(1, k * 2), filter: `blur(${(1 - Math.min(1, k)) * 20}px)`, textShadow: '0 20px 60px rgba(31,207,98,.35)'}}>AI</div>
      </div>
      <Kin t={t} at={OFF + 8.1} size={120}>로 합니다.</Kin>
    </AbsoluteFill>
  );
};

// ④ 기능 카드 + 몇 분 만에
const FEATS = [
  {at: OFF + 9.26, n: '01', a: '토지', b: ' 분석', d: '입지 · 용도지역 · 개발가능성'},
  {at: OFF + 10.18, n: '02', a: '공법', b: ' 검토', d: '건폐율 · 용적률 · 규제 체크'},
  {at: OFF + 11.04, n: '03', a: '매물', b: ' 브리핑', d: '고객용 리포트 자동 작성'},
];
const Feat: React.FC<{t: number}> = ({t}) => {
  const e = exitOf(t, 'feat');
  const fastAt = OFF + 11.96;
  const prog = interpolate(t, [fastAt, OFF + 14.0], [0, 1], {...clamp, easing: ez});
  const sec = Math.round(interpolate(prog, [0, 1], [0, 180]));
  const done = t > OFF + 13.9;
  const dk = sp(t, OFF + 13.9, 10, 200);
  return (
    <AbsoluteFill style={exitStyle(e)}>
      <div style={{position: 'absolute', left: 80, top: 190}}>
        <Kin t={t} at={S.feat[0]} size={92}>AI가 대신</Kin>
        <Kin t={t} at={S.feat[0] + 0.2} size={92} color={GREEN} from="side">해주는 일</Kin>
        <div style={{height: 8, background: INK, width: 520 * appear(t, S.feat[0] + 0.4, 0.5), marginTop: 6}} />
      </div>
      {FEATS.map((x, i) => {
        const k = sp(t, x.at, 13, 150);
        const check = appear(t, fastAt + 0.5 + i * 0.45, 0.25);
        return (
          <div key={x.n} style={{position: 'absolute', left: 80, right: 80, top: 470 + i * 190, height: 160, background: '#fff', borderRadius: 26,
            boxShadow: '0 24px 60px rgba(40,32,20,.16)', display: 'flex', alignItems: 'center', padding: '0 40px', fontFamily: FONT,
            opacity: Math.min(1, k * 1.5), transform: `translateX(${(1 - k) * 200}px)`, filter: `blur(${(1 - Math.min(1, k)) * 12}px)`,
            border: check > 0 ? `4px solid rgba(31,207,98,${check})` : '4px solid transparent'}}>
            <span style={{fontFamily: MONO, fontSize: 32, color: GREEN, fontWeight: 700, marginRight: 30}}>{x.n}</span>
            <div style={{flex: 1}}>
              <div style={{fontSize: 64, fontWeight: 900, letterSpacing: -2, lineHeight: 1.1}}><span style={{color: INK}}>{x.a}</span><span style={{color: GREEN, whiteSpace: 'pre'}}>{x.b}</span></div>
              <div style={{fontSize: 28, fontWeight: 600, color: GREY}}>{x.d}</div>
            </div>
            <div style={{width: 76, height: 76, borderRadius: 38, background: GREEN, color: '#fff', fontSize: 46, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${check})`}}>✓</div>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 80, right: 80, top: 1060, opacity: appear(t, fastAt - 0.1), fontFamily: FONT}}>
        <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
          <span style={{fontSize: 44, fontWeight: 900, color: INK}}>{done ? '분석 완료' : 'AI 분석 중…'}</span>
          <span style={{fontFamily: MONO, fontSize: 52, fontWeight: 700, color: done ? GREEN : INK}}>{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</span>
        </div>
        <div style={{height: 22, background: 'rgba(0,0,0,.1)', borderRadius: 11, marginTop: 14, overflow: 'hidden'}}>
          <div style={{height: '100%', width: `${prog * 100}%`, background: GREEN, borderRadius: 11}} />
        </div>
        {done && <div style={{marginTop: 26, display: 'flex', justifyContent: 'center'}}>
          <div style={{background: INK, color: '#fff', fontSize: 52, fontWeight: 900, padding: '14px 40px', borderRadius: 999, borderLeft: `12px solid ${GREEN}`, transform: `scale(${dk})`, letterSpacing: -1.5}}>며칠 걸리던 일 → <span style={{color: GREEN}}>몇 분</span></div>
        </div>}
      </div>
    </AbsoluteFill>
  );
};

// ⑤ 강의실 현장 (수강생 영상)
const ClassScene: React.FC<{t: number}> = ({t}) => {
  const e = exitOf(t, 'class');
  const st = S.class[0];
  const enter = appear(t, st, 0.45);
  const badge = sp(t, OFF + 15.72, 9, 180);
  return (
    <AbsoluteFill style={exitStyle(e)}>
      <Card x={90} y={180} w={900} h={1080} url="부동산AI 강의실 · LIVE" enter={enter}>
        <Sequence from={f(st)} layout="none">
          <OffthreadVideo src={staticFile('students.mp4')} muted playbackRate={0.85} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(t, [st, S.class[1]], [1.0, 1.08])})`}} />
        </Sequence>
        <div style={{position: 'absolute', left: 28, top: 26, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,.6)', color: '#fff', padding: '10px 22px', borderRadius: 999, fontFamily: FONT, fontWeight: 800, fontSize: 28}}>
          <div style={{width: 16, height: 16, borderRadius: 8, background: RED, opacity: 0.5 + 0.5 * Math.abs(Math.sin(t * 5))}} />실제 강의 현장
        </div>
      </Card>
      <div style={{position: 'absolute', right: 60, top: 1130, background: RED, color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 72, padding: '14px 44px', borderRadius: 999, letterSpacing: -2,
        transform: `scale(${badge}) rotate(${-5 * badge}deg)`, opacity: Math.min(1, badge * 2), boxShadow: '0 16px 40px rgba(239,68,68,.35)'}}>만석!</div>
    </AbsoluteFill>
  );
};

// ⑥ CTA
const Cta: React.FC<{t: number}> = ({t}) => {
  const st = S.cta[0];
  const ph = sp(t, st, 13, 120);
  const btn = sp(t, OFF + 21.9, 11, 160);
  const glow = t > OFF + 22 ? 0.5 + 0.5 * Math.sin((t - OFF - 22) * 4) : 0;
  return (
    <AbsoluteFill style={{alignItems: 'center'}}>
      <div style={{position: 'absolute', top: 185, width: 300, height: 300, borderRadius: '50%', overflow: 'hidden', border: `10px solid ${GREEN}`, boxShadow: '0 24px 60px rgba(40,32,20,.25)',
        transform: `scale(${ph})`, opacity: Math.min(1, ph * 2)}}>
        <Img src={staticFile('prof.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '55% 50%', transform: 'scale(1.2) translateY(6%)'}} />
      </div>
      <div style={{position: 'absolute', top: 520, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <Kin t={t} at={OFF + 16.94} size={150}>부동산 AI</Kin>
        <Kin t={t} at={OFF + 17.84} size={120} color={GREEN} from="side">지금 시작하세요</Kin>
        <div style={{height: 10, background: INK, width: 760 * appear(t, OFF + 18.6, 0.5), marginTop: 10}} />
        <div style={{marginTop: 30, fontFamily: FONT, fontSize: 52, fontWeight: 800, color: INK, letterSpacing: -1.5, opacity: appear(t, OFF + 19.14), transform: `translateY(${(1 - appear(t, OFF + 19.14)) * 30}px)`}}>
          <span style={{color: GREEN}}>공법의 신</span> 고상철과 함께라면
        </div>
      </div>
      <div style={{position: 'absolute', top: 1060, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
        <div style={{background: GREEN, color: '#fff', fontFamily: FONT, fontWeight: 900, fontSize: 60, padding: '24px 64px', borderRadius: 999, letterSpacing: -2,
          transform: `scale(${btn * (1 + glow * 0.03)})`, opacity: Math.min(1, btn * 2), boxShadow: `0 0 ${30 + glow * 40}px rgba(31,207,98,.6)`}}>부동산 AI 강의 신청 →</div>
        <div style={{fontFamily: MONO, fontSize: 28, color: GREY, letterSpacing: 2, opacity: appear(t, OFF + 22.4)}}>서울사이버대 부동산AI학과 · 미스터홈즈 FC</div>
      </div>
    </AbsoluteFill>
  );
};

// 가라오케 자막
type Sub = {t: string; s: number; e: number; w: {s: number; e: number}[]};
const W = (s: number, e: number) => ({s: s + OFF, e: e + OFF});
const SUBS: Sub[] = [
  {t: '부동산 공부, 아직도 혼자 하세요?', w: [W(0, .42), W(.42, .78), W(.78, 1.46), W(1.46, 1.72), W(1.72, 2.12)]},
  {t: '28년 부동산공법 강의,', w: [W(2.68, 3.32), W(3.32, 3.9), W(3.9, 4.52)]},
  {t: '공법의 신 고상철입니다.', w: [W(4.52, 5.22), W(5.22, 5.42), W(5.42, 6.18)]},
  {t: '이제 부동산도 AI로 합니다.', w: [W(6.36, 6.92), W(6.92, 7.64), W(7.64, 8.38), W(8.38, 8.66)]},
  {t: '토지 분석, 공법 검토,', w: [W(9.26, 9.55), W(9.55, 9.9), W(10.18, 10.5), W(10.5, 10.84)]},
  {t: '매물 브리핑까지', w: [W(11.04, 11.3), W(11.3, 11.96)]},
  {t: 'AI가 몇 분 만에 끝냅니다.', w: [W(11.96, 12.98), W(12.98, 13.2), W(13.2, 13.68), W(13.68, 14.22)]},
  {t: '보세요, 강의실이 꽉 찼습니다.', w: [W(14.22, 14.78), W(15.18, 15.72), W(15.72, 15.96), W(15.96, 16.44)]},
  {t: '부동산 AI, 지금 시작하세요.', w: [W(16.94, 17.5), W(17.5, 17.84), W(17.84, 18.44), W(18.44, 19.14)]},
  {t: '고상철과 함께라면', w: [W(19.14, 20.16), W(20.16, 20.68)]},
  {t: '어렵지 않습니다.', w: [W(20.68, 21.28), W(21.28, 21.9)]},
].map((x, i, arr) => ({...x, s: x.w[0].s - 0.12, e: i < arr.length - 1 ? arr[i + 1].w[0].s - 0.12 : DUR})) as Sub[];

const Subtitle: React.FC<{t: number}> = ({t}) => {
  const s = SUBS.find((x) => t >= x.s && t < x.e);
  if (!s) return null;
  const k = appear(t, s.s, 0.18);
  const tokens = s.t.split(' ');
  // 토큰별 진행: 단어 시점 i번째 = 토큰 i번째
  return (
    <div style={{position: 'absolute', left: 40, right: 40, top: 1400, display: 'flex', justifyContent: 'center', fontFamily: FONT}}>
      <div style={{fontSize: 66, fontWeight: 800, padding: '12px 28px', whiteSpace: 'nowrap', opacity: k, transform: `translateY(${(1 - k) * 16}px)`, filter: `blur(${(1 - k) * 6}px)`,
        letterSpacing: -1.8, display: 'flex', gap: 18, background: 'rgba(255,255,255,.55)', borderRadius: 20}}>
        {tokens.map((tok, i) => {
          const w = s.w[Math.min(i, s.w.length - 1)];
          const fill = t < w.s ? 0 : Math.min(1, (t - w.s) / Math.max(0.05, w.e - w.s));
          const p = fill * 100;
          const active = fill > 0 && fill < 1;
          return (
            <span key={i} style={{display: 'inline-block', position: 'relative', backgroundImage: `linear-gradient(90deg, ${active ? GREEN : INK} ${p - 5}%, #a8a59d ${p + 5}%)`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', transform: `translateY(${active ? -5 : 0}px) scale(${active ? 1.06 : 1})`, fontWeight: active || fill >= 1 ? 900 : 700}}>
              {tok}{active && <span style={{position: 'absolute', left: 0, bottom: -6, height: 6, width: `${p}%`, background: GREEN}} />}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const WHOOSH = [S.prof[0], S.ai[0], S.feat[0], S.class[0], S.cta[0]];
const POPS = [OFF + 4.52, OFF + 7.64, ...FEATS.map((x) => x.at), OFF + 13.9, OFF + 15.72, OFF + 21.9];

const Ad: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{backgroundColor: '#e9e7e2'}}>
      <Bg t={t} />
      <Sequence from={f(OFF)}><Audio src={staticFile('narr.mp3')} /></Sequence>
      {WHOOSH.map((c, i) => <Sequence key={'w' + i} from={Math.max(0, f(c) - 4)} durationInFrames={20}><Audio src={staticFile('whoosh.wav')} volume={0.22} /></Sequence>)}
      {POPS.map((c, i) => <Sequence key={'c' + i} from={f(c)} durationInFrames={8}><Audio src={staticFile('click.wav')} volume={0.6} /></Sequence>)}
      {inS(t, 'hook') && <Hook t={t} />}
      {inS(t, 'prof') && <Prof t={t} />}
      {inS(t, 'ai') && <AiScene t={t} />}
      {inS(t, 'feat') && <Feat t={t} />}
      {inS(t, 'class') && <ClassScene t={t} />}
      {inS(t, 'cta') && <Cta t={t} />}
      <Header t={t} />
      <Subtitle t={t} />
    </AbsoluteFill>
  );
};

const Root: React.FC = () => <Composition id="AdTall" component={Ad} durationInFrames={f(DUR)} fps={FPS} width={1080} height={1920} />;
registerRoot(Root);
