// 모션그래픽 영상꾸미기 스타일 — 사진 2장 + 상철오빠 나레이션 (16:9 / 쇼츠 9:16)
import React from 'react';
import {
  AbsoluteFill, Audio, Composition, Img, Sequence, registerRoot, staticFile,
  useCurrentFrame, interpolate, spring, Easing, delayRender, continueRender,
} from 'remotion';
import subs from './subs.json';

const FPS = 30;
const INTRO = 2.4;          // 인트로 길이 (나레이션 시작 시점)
const NAR = 29.52;          // 나레이션 길이
const OUTRO = 1.8;
const DUR = INTRO + NAR + OUTRO;
const FONT = "'Pretendard','Malgun Gothic',sans-serif";
const MONO = "Consolas,'Cascadia Mono','Pretendard',monospace";
const INK = '#111111', GREEN = '#1fcf62', RED = '#ef4444', GRAY = '#a8a59d';
const ez = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const appear = (t: number, at: number, d = 0.35) => interpolate(t, [at, at + d], [0, 1], {...clamp, easing: ez});
const f = (s: number) => Math.round(s * FPS);

if (typeof window !== 'undefined' && !(window as any).__ptd) {
  (window as any).__ptd = true;
  const h = delayRender('Pretendard');
  const ws: [string, string][] = [['Medium', '500'], ['SemiBold', '600'], ['Bold', '700'], ['ExtraBold', '800'], ['Black', '900']];
  Promise.all(ws.map(([n, w]) => new FontFace('Pretendard', `url(${staticFile(`fonts/Pretendard-${n}.otf`)})`, {weight: w}).load().then((ff) => { (document as any).fonts.add(ff); })))
    .then(() => continueRender(h)).catch(() => continueRender(h));
}

// ───────── 데이터 (나레이션 기준 시간, 초) ─────────
const PHOTOS = [{src: 'p1.jpg', w: 4000, h: 3000}, {src: 'p2.jpg', w: 3968, h: 2232}];
type Step = {from: number; to: number; n: string; a: string; b: string; tag?: string};
const STEPS: Step[] = [
  {from: 0, to: 5.2, n: '01', a: '반가운', b: ' 얼굴들'},
  {from: 5.2, to: 13.0, n: '02', a: '오늘은', b: ' 바다 한 상', tag: '전복·소라·해삼·회'},
  {from: 13.0, to: 19.8, n: '03', a: '사는 얘기는', b: ' 한참'},
  {from: 19.8, to: 24.6, n: '04', a: '인생은 결국', b: ' 사람'},
  {from: 24.6, to: NAR + OUTRO, n: '05', a: '다음 한잔도', b: ' 기대할게요'},
];
// 카메라 키프레임: p=사진, z=확대, x/y=초점(사진 대비 0~1)
type Cam = {t: number; p: number; z: number; x: number; y: number};
const CAMS: Cam[] = [
  {t: -INTRO, p: 1, z: 1.0, x: 0.5, y: 0.5},
  {t: 5.15, p: 1, z: 1.18, x: 0.55, y: 0.45},
  {t: 5.25, p: 0, z: 1.05, x: 0.5, y: 0.55},
  {t: 6.7, p: 0, z: 1.55, x: 0.40, y: 0.78},
  {t: 9.2, p: 0, z: 1.55, x: 0.45, y: 0.76},
  {t: 10.6, p: 0, z: 1.55, x: 0.52, y: 0.78},
  {t: 12.6, p: 0, z: 1.45, x: 0.32, y: 0.76},
  {t: 13.6, p: 0, z: 1.3, x: 0.45, y: 0.32},
  {t: 19.7, p: 0, z: 1.1, x: 0.5, y: 0.4},
  {t: 19.85, p: 1, z: 1.3, x: 0.25, y: 0.45},
  {t: 24.5, p: 1, z: 1.12, x: 0.45, y: 0.45},
  {t: 24.65, p: 1, z: 1.0, x: 0.5, y: 0.5},
  {t: NAR + OUTRO, p: 1, z: 1.12, x: 0.6, y: 0.45},
];
// 강조 표시 (사진 0 기준 좌표) — 나레이션 단어 시점에 맞춤
type Hi = {at: number; x: number; y: number; w: number; h: number; label: string};
const HIS: Hi[] = [
  {at: 7.02, x: 0.33, y: 0.76, w: 0.09, h: 0.07, label: '전복'},
  {at: 7.9, x: 0.43, y: 0.81, w: 0.08, h: 0.07, label: '소라'},
  {at: 8.4, x: 0.40, y: 0.85, w: 0.07, h: 0.06, label: '해삼'},
  {at: 9.58, x: 0.36, y: 0.68, w: 0.14, h: 0.08, label: '싱싱한 회'},
  {at: 10.46, x: 0.52, y: 0.73, w: 0.09, h: 0.09, label: '번데기'},
  {at: 11.16, x: 0.19, y: 0.73, w: 0.12, h: 0.09, label: '콘치즈'},
];

// ───────── 레이아웃 ─────────
type L = {
  W: number; H: number; vertical: boolean;
  card: {x: number; y: number; w: number; h: number};
  title: {x: number; y: number; size: number};
  sub: {top: number; size: number; maxW: number};
  intro: {main: number; accent: number; chip: number};
};
const L16: L = {
  W: 1920, H: 1080, vertical: false,
  card: {x: 70, y: 196, w: 1780, h: 742},
  title: {x: 70, y: 66, size: 78},
  sub: {top: 958, size: 50, maxW: 1800},
  intro: {main: 190, accent: 120, chip: 34},
};
const L9: L = {
  W: 1080, H: 1920, vertical: true,
  card: {x: 50, y: 400, w: 980, h: 1080},
  title: {x: 56, y: 150, size: 92},
  sub: {top: 1535, size: 62, maxW: 980},
  intro: {main: 150, accent: 104, chip: 34},
};
const CHROME = 46;

const Bg: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{background: `radial-gradient(1400px 1100px at ${50 + Math.sin(t / 6) * 4}% 45%, #f4f2ee 0%, #e9e7e2 55%, #dcd9d2 100%)`}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(60,50,30,.16) 100%)'}} />
    </AbsoluteFill>
  );
};

const Header: React.FC<{l: L}> = ({l}) => {
  const T = useCurrentFrame() / FPS;
  const t = T - INTRO;
  const st = T >= INTRO ? STEPS.find((s) => t >= s.from && t < s.to) : undefined;
  const done = T >= INTRO ? STEPS.filter((s) => t >= s.from).length : 0;
  const k = (d: number) => spring({frame: Math.max(0, Math.round((t - (st ? st.from : 0) - d) * FPS)), fps: FPS, config: {damping: 15, stiffness: 140}});
  const e = st ? interpolate(t, [st.to - 0.3, st.to], [0, 1], clamp) : 0;
  const k1 = k(0.05), k2 = k(0.3), k3 = k(0.5);
  const S = l.title.size;
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, height: 6, width: `${(T / DUR) * 100}%`, background: GREEN}} />
      <div style={{position: 'absolute', left: l.title.x, right: l.title.x, top: l.vertical ? 70 : 26, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: l.vertical ? 22 : 17, color: '#6f6b63', letterSpacing: 1.5}}>
        <span style={{fontFamily: FONT, fontWeight: 900, fontSize: l.vertical ? 30 : 22, color: INK, letterSpacing: -0.5, marginRight: 16}}>MR.HOMES</span>
        {l.vertical ? '고상철의 하루' : '고상철의 하루 — 반가운 한잔 / 2026.11'}
        <div style={{flex: 1}} />
        {done > 0 && <span style={{marginRight: 14}}>{String(done).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</span>}
        {STEPS.map((_, i) => <div key={i} style={{width: 9, height: 9, borderRadius: 5, marginLeft: 7, background: i < done ? INK : 'rgba(0,0,0,.18)'}} />)}
      </div>
      {st && (
        <div style={{position: 'absolute', left: l.title.x, top: l.title.y, fontFamily: FONT, opacity: 1 - e, transform: `translateX(${-50 * e}px)`, filter: `blur(${8 * e}px)`}}>
          <div style={{display: 'flex', alignItems: 'baseline', flexWrap: l.vertical ? 'wrap' : 'nowrap', whiteSpace: 'nowrap', maxWidth: l.W - l.title.x * 2}}>
            <span style={{fontFamily: MONO, fontSize: 22, color: GREEN, fontWeight: 700, marginRight: 22, opacity: k1}}>{st.n}</span>
            <span style={{fontSize: S, fontWeight: 900, color: INK, letterSpacing: interpolate(k1, [0, 1], [14, -3]), display: 'inline-block', transform: `translateY(${(1 - k1) * 50}px)`, filter: `blur(${(1 - Math.min(1, k1)) * 14}px)`, opacity: Math.min(1, k1 * 1.4)}}>{st.a}</span>
            <span style={{fontSize: S, fontWeight: 900, color: GREEN, letterSpacing: interpolate(k2, [0, 1], [18, -3]), display: 'inline-block', whiteSpace: 'pre', transform: `translateX(${(1 - k2) * 80}px)`, filter: `blur(${(1 - Math.min(1, k2)) * 16}px)`, opacity: Math.min(1, k2 * 1.4)}}>{st.b}</span>
            {st.tag && !l.vertical && <span style={{marginLeft: 26, alignSelf: 'center', background: RED, color: '#fff', fontSize: 26, fontWeight: 800, padding: '8px 18px', borderRadius: 999, transform: `scale(${k3})`}}>{st.tag}</span>}
          </div>
          <div style={{display: 'flex', alignItems: 'center', marginTop: 4}}>
            <div style={{height: 5, background: INK, width: `${Math.min(1, k3) * (l.vertical ? 100 : 100)}%`, minWidth: 0, flex: l.vertical ? 1 : undefined}} />
          </div>
          {st.tag && l.vertical && <div style={{marginTop: 16, display: 'inline-block', background: RED, color: '#fff', fontSize: l.vertical ? 32 : 26, fontWeight: 800, padding: '8px 20px', borderRadius: 999, transform: `scale(${k3})`, transformOrigin: 'left center'}}>{st.tag}</div>}
        </div>
      )}
    </>
  );
};

// 사진 카드 + 카메라 이동 + 강조
const camAt = (t: number) => {
  let i = CAMS.findIndex((c) => c.t > t);
  if (i === -1) return CAMS[CAMS.length - 1];
  if (i === 0) return CAMS[0];
  const a = CAMS[i - 1], b = CAMS[i];
  if (a.p !== b.p) return t - a.t < b.t - t ? a : b;
  const r = Easing.inOut(Easing.cubic)((t - a.t) / (b.t - a.t));
  return {t, p: a.p, z: a.z + (b.z - a.z) * r, x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r};
};

const PhotoLayer: React.FC<{p: number; cw: number; ch: number; cam: Cam; opacity: number; blur: number; t: number; v: boolean}> = ({p, cw, ch, cam: c0, opacity, blur, t, v}) => {
  const cam = v && p === 1 ? {...c0, x: c0.x * 0.8} : c0;
  const P = PHOTOS[p];
  const s0 = Math.max(cw / P.w, ch / P.h); // cover
  const dw = P.w * s0, dh = P.h * s0;
  const z = cam.z;
  let tx = cw / 2 - cam.x * dw * z, ty = ch / 2 - cam.y * dh * z;
  tx = Math.min(0, Math.max(cw - dw * z, tx));
  ty = Math.min(0, Math.max(ch - dh * z, ty));
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: dw, height: dh, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})`, opacity, filter: blur ? `blur(${blur}px)` : undefined}}>
      <Img src={staticFile(P.src)} style={{width: dw, height: dh, display: 'block'}} />
      {p === 0 && HIS.map((h, i) => {
        if (t < h.at - 0.05 || t > h.at + 1.9) return null;
        const kk = spring({frame: Math.round((t - h.at + 0.05) * FPS), fps: FPS, config: {damping: 12}});
        const out = interpolate(t, [h.at + 1.5, h.at + 1.9], [1, 0], clamp);
        const x = h.x * dw, y = h.y * dh, w = h.w * dw, hh = h.h * dh;
        const r = interpolate(t, [h.at, h.at + 0.55], [0, 1], clamp);
        return (
          <React.Fragment key={i}>
            <div style={{position: 'absolute', left: x - 8, top: y - 8, width: w + 16, height: hh + 16, border: `${5 / z}px solid ${GREEN}`, borderRadius: 14, boxShadow: `0 0 26px ${GREEN}`, transform: `scale(${0.75 + 0.25 * kk})`, opacity: Math.min(1, kk * 1.5) * out}}>
              <div style={{position: 'absolute', left: '50%', top: -18 - 62 / z, transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: INK, color: '#fff', borderLeft: `${8 / z}px solid ${GREEN}`, fontFamily: FONT, fontWeight: 800, fontSize: 34 / z, padding: `${8 / z}px ${18 / z}px`, borderRadius: 12 / z}}>{h.label}</div>
            </div>
            {r < 1 && <div style={{position: 'absolute', left: x + w / 2 - (20 + 60 * r), top: y + hh / 2 - (20 + 60 * r), width: (20 + 60 * r) * 2, height: (20 + 60 * r) * 2, borderRadius: '50%', border: `${5 / z}px solid ${GREEN}`, opacity: 1 - r}} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const PhotoCard: React.FC<{l: L}> = ({l}) => {
  const T = useCurrentFrame() / FPS;
  const t = T - INTRO;
  const enter = appear(T, INTRO - 0.15, 0.6);
  const V = l.card;
  const cw = V.w, ch = V.h - CHROME;
  // 사진 전환 크로스페이드 (0.5초)
  const changes = CAMS.slice(1).filter((c, i) => c.p !== CAMS[i].p).map((c) => c.t);
  const cur = camAt(t);
  let layers = [{p: cur.p, cam: cur, o: 1, b: 0}];
  for (const ct of changes) {
    const d = t - ct;
    if (d > -0.3 && d < 0.3) {
      const r = interpolate(d, [-0.3, 0.3], [0, 1], {...clamp, easing: ez});
      const A = camAt(ct - 0.31), B = camAt(ct + 0.31);
      const pa = camAt(Math.min(t, ct - 0.11)), pb = camAt(Math.max(t, ct + 0.11));
      layers = [{p: A.p, cam: pa, o: 1, b: r * 10}, {p: B.p, cam: pb, o: r, b: (1 - r) * 10}];
    }
  }
  return (
    <div style={{position: 'absolute', left: V.x, top: V.y, width: V.w, height: V.h, borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 70px rgba(40,32,20,.18), 0 2px 6px rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.06)', opacity: enter, transform: `translateY(${(1 - enter) * 40}px)`, filter: `blur(${(1 - enter) * 8}px)`}}>
      <div style={{height: CHROME, background: '#e8eaed', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{width: 14, height: 14, borderRadius: 7, background: c}} />)}
        <div style={{marginLeft: 16, flex: 1, background: '#fff', borderRadius: 999, height: 30, display: 'flex', alignItems: 'center', padding: '0 18px', fontFamily: FONT, fontSize: 19, color: '#333'}}>📷 오늘의 한잔 · 반가운 얼굴들</div>
      </div>
      <div style={{position: 'relative', width: cw, height: ch, overflow: 'hidden', background: '#f4f2ee'}}>
        {layers.map((ly, i) => <PhotoLayer key={i} p={ly.p} cw={cw} ch={ch} cam={ly.cam} opacity={ly.o} blur={ly.b} t={t} v={l.vertical} />)}
      </div>
    </div>
  );
};

type Sub = {t: string; s: number; e: number; w: {s: number; e: number}[]};
const Subtitle: React.FC<{l: L}> = ({l}) => {
  const t = useCurrentFrame() / FPS - INTRO;
  const s = (subs as Sub[]).find((x) => t >= x.s && t < x.e);
  if (!s) return null;
  const k = appear(t, s.s, 0.18);
  const tokens = s.t.split(' ');
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: l.sub.top, display: 'flex', justifyContent: 'center', fontFamily: FONT}}>
      <div style={{fontSize: l.sub.size, fontWeight: 800, padding: '8px 20px', maxWidth: l.sub.maxW, flexWrap: 'wrap', justifyContent: 'center', rowGap: 6, opacity: k, transform: `translateY(${(1 - k) * 14}px)`, filter: `blur(${(1 - k) * 6}px)`, letterSpacing: -1.2, display: 'flex', columnGap: 14, lineHeight: 1.25}}>
        {tokens.map((tok, i) => {
          const w = s.w[i];
          const fill = t < w.s ? 0 : t >= w.e ? 1 : (t - w.s) / Math.max(0.05, w.e - w.s);
          const p = fill * 100;
          const active = t >= w.s && t < w.e + 0.05;
          return (
            <span key={i} style={{display: 'inline-block', position: 'relative', whiteSpace: 'nowrap', backgroundImage: `linear-gradient(90deg, ${active ? GREEN : INK} ${p - 5}%, ${GRAY} ${p + 5}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', transform: `translateY(${active ? -4 : 0}px) scale(${active ? 1.06 : 1})`, fontWeight: active || fill >= 1 ? 900 : 700}}>
              {tok}{active && <span style={{position: 'absolute', left: 0, bottom: -4, height: 4, width: `${Math.max(p, 8)}%`, background: GREEN}} />}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Intro: React.FC<{l: L}> = ({l}) => {
  const t = useCurrentFrame() / FPS;
  const a = appear(t, 0.1, 0.6), b = appear(t, 0.3, 0.7), c = appear(t, 0.75, 0.6);
  const out = interpolate(t, [INTRO - 0.35, INTRO], [1, 0], clamp);
  const chips = ['바다 한 상', '반가운 얼굴', '사는 얘기'];
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', fontFamily: FONT, opacity: out, textAlign: 'center'}}>
      <div style={{fontFamily: MONO, color: '#6f6b63', fontSize: 24, letterSpacing: 4, opacity: a}}>MR.HOMES — 고상철의 하루</div>
      <div style={{color: INK, fontWeight: 900, fontSize: l.intro.main, lineHeight: 1, marginTop: 20, letterSpacing: interpolate(b, [0, 1], [30, -8]), opacity: b, filter: `blur(${(1 - b) * 18}px)`, transform: `translateY(${(1 - b) * 60}px)`}}>오늘의 한잔</div>
      <div style={{color: GREEN, fontWeight: 900, fontSize: l.intro.accent, lineHeight: 1.15, letterSpacing: interpolate(c, [0, 1], [24, -5]), opacity: c, filter: `blur(${(1 - c) * 14}px)`, transform: `translateX(${(1 - c) * 120}px)`}}>결국은 사람</div>
      <div style={{marginTop: 34, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center'}}>
        {chips.map((w, i) => {
          const q = appear(t, 1.0 + i * 0.2, 0.4);
          return <div key={w} style={{background: i === chips.length - 1 ? GREEN : INK, color: '#fff', fontSize: l.intro.chip, fontWeight: 800, padding: '12px 26px', borderRadius: 999, opacity: q, transform: `translateY(${(1 - q) * 40}px)`}}>{w}</div>;
        })}
      </div>
    </AbsoluteFill>
  );
};

const Main: React.FC<{l: L}> = ({l}) => {
  const clicks = HIS.map((h) => h.at + INTRO);
  const whooshes = [0.15, ...STEPS.map((s) => s.from + INTRO)];
  return (
    <AbsoluteFill style={{backgroundColor: '#e9e7e2'}}>
      <Bg />
      <Sequence from={f(INTRO)}><Audio src={staticFile('take1.mp3')} /></Sequence>
      {clicks.map((c, i) => <Sequence key={'c' + i} from={f(c)} durationInFrames={8}><Audio src={staticFile('click.wav')} volume={0.6} /></Sequence>)}
      {whooshes.map((c, i) => <Sequence key={'w' + i} from={Math.max(0, f(c) - 4)} durationInFrames={20}><Audio src={staticFile('whoosh.wav')} volume={0.22} /></Sequence>)}
      <PhotoCard l={l} />
      <Sequence durationInFrames={f(INTRO)}><Intro l={l} /></Sequence>
      <Header l={l} />
      <Subtitle l={l} />
    </AbsoluteFill>
  );
};

const Wide: React.FC = () => <Main l={L16} />;
const Shorts: React.FC = () => <Main l={L9} />;
const Root: React.FC = () => (
  <>
    <Composition id="Wide" component={Wide} durationInFrames={f(DUR)} fps={FPS} width={1920} height={1080} />
    <Composition id="Shorts" component={Shorts} durationInFrames={f(DUR)} fps={FPS} width={1080} height={1920} />
  </>
);
registerRoot(Root);
