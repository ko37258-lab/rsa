// 사진 두 장 설명 영상 — 모션그래픽 영상꾸미기 스타일 (종이 배경 · 키네틱 타이포 · 흰 카드 · 가라오케 자막)
// build.py 가 만든 src/timeline.json + src/subs.json + public/voice.wav 로 그린다.
import React from 'react';
import {
  AbsoluteFill, Audio, Composition, Img, Loop, OffthreadVideo, Sequence, registerRoot, staticFile,
  useCurrentFrame, interpolate, spring, Easing, delayRender, continueRender,
} from 'remotion';
import TL from './timeline.json';
import subs from './subs.json';

type Ev = {
  type: string; i: number; scene: string; at: number; end?: number; kw?: string;
  x?: number; y?: number; z?: number; d?: number; box?: number[]; label?: string; side?: string; color?: string;
  text?: string; sub?: string; pos?: string; item?: string;
};
type ImgMeta = {src: string; w: number; h: number; url: string};
type Step = {from: number; to: number; n: string; a: string; b: string; tag?: string};
const T = TL as unknown as {
  duration: number; sentences: {scene: string; s: number; e: number; show: string}[];
  scenes: Record<string, {from: number; to: number}>; steps: Step[]; events: Ev[];
  images: Record<string, ImgMeta>; shots: {id: string; img: string}[];
};
const FPS = 30;
const DUR = T.duration;
const EV = T.events;
const SC = T.scenes;
const FONT = "'Pretendard','Malgun Gothic',sans-serif";
const MONO = "Consolas,'Cascadia Mono','Pretendard',monospace";
const INK = '#111111', GREEN = '#1fcf62', RED = '#ef4444', GREY = '#6f6b63';
const ez = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const appear = (t: number, at: number, d = 0.35) => interpolate(t, [at, at + d], [0, 1], {...clamp, easing: ez});
const f = (s: number) => Math.round(s * FPS);
const sp = (t: number, at: number, damping = 13) => spring({frame: Math.max(0, Math.round((t - at) * FPS)), fps: FPS, config: {damping}});
const useT = () => useCurrentFrame() / FPS;
const TOTAL_STEPS = T.steps.filter((s) => /^\d+$/.test(s.n)).length;

// Pretendard 로드
if (typeof window !== 'undefined' && !(window as any).__ptd) {
  (window as any).__ptd = true;
  const h = delayRender('Pretendard');
  const ws: [string, string][] = [['Medium', '500'], ['SemiBold', '600'], ['Bold', '700'], ['ExtraBold', '800'], ['Black', '900']];
  Promise.all(ws.map(([n, w]) => new FontFace('Pretendard', `url(${staticFile(`fonts/Pretendard-${n}.otf`)})`, {weight: w}).load().then((ff) => { (document as any).fonts.add(ff); })))
    .then(() => continueRender(h)).catch(() => continueRender(h));
}

const Bg: React.FC = () => {
  const t = useT();
  return (
    <AbsoluteFill style={{background: `radial-gradient(1400px 900px at ${50 + Math.sin(t / 6) * 4}% 45%, #f4f2ee 0%, #e9e7e2 55%, #dcd9d2 100%)`}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(60,50,30,.16) 100%)'}} />
    </AbsoluteFill>
  );
};

// ---------- 상단: 진행선 + 모노 라벨 + 키네틱 단계 제목 ----------
const Header: React.FC = () => {
  const t = useT();
  const st = T.steps.find((s) => t >= s.from && t < s.to);
  const done = T.steps.filter((s) => /^\d+$/.test(s.n) && t >= s.from).length;
  const k = (d: number) => sp(t - d, st ? st.from : 0, 15);
  const e = st ? interpolate(t, [st.to - 0.3, st.to], [0, 1], clamp) : 0;
  const k1 = k(0.05), k2 = k(0.3), k3 = k(0.5);
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, height: 5, width: `${(t / DUR) * 100}%`, background: GREEN}} />
      <div style={{position: 'absolute', left: 70, right: 200, top: 26, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: 17, color: GREY, letterSpacing: 1.5}}>
        <span style={{fontFamily: FONT, fontWeight: 900, fontSize: 22, color: INK, letterSpacing: -0.5, marginRight: 16}}>MR<span style={{color: GREEN}}>.</span>K</span>
        고상철TV — 사진으로 보는 공법의 신
        <div style={{flex: 1}} />
        {done > 0 && <span style={{marginRight: 18}}>STEP {String(done).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')}</span>}
        {Array.from({length: TOTAL_STEPS}, (_, i) => <div key={i} style={{width: 9, height: 9, borderRadius: 5, marginLeft: 7, background: i < done ? INK : 'rgba(0,0,0,.18)'}} />)}
      </div>
      {st && (
        <div style={{position: 'absolute', left: 70, top: 66, fontFamily: FONT, opacity: 1 - e, transform: `translateX(${-50 * e}px)`, filter: `blur(${8 * e}px)`}}>
          <div style={{display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap'}}>
            <span style={{fontFamily: MONO, fontSize: 22, color: GREEN, fontWeight: 700, marginRight: 22, opacity: k1}}>{st.n}</span>
            <span style={{fontSize: 78, fontWeight: 900, color: INK, letterSpacing: interpolate(k1, [0, 1], [14, -3]), display: 'inline-block', transform: `translateY(${(1 - k1) * 50}px)`, filter: `blur(${(1 - Math.min(1, k1)) * 14}px)`, opacity: Math.min(1, k1 * 1.4)}}>{st.a}</span>
            <span style={{fontSize: 78, fontWeight: 900, color: GREEN, letterSpacing: interpolate(k2, [0, 1], [18, -3]), display: 'inline-block', whiteSpace: 'pre', transform: `translateX(${(1 - k2) * 80}px)`, filter: `blur(${(1 - Math.min(1, k2)) * 16}px)`, opacity: Math.min(1, k2 * 1.4)}}>{st.b}</span>
            {st.tag && <span style={{marginLeft: 26, alignSelf: 'center', background: RED, color: '#fff', fontSize: 26, fontWeight: 800, padding: '8px 18px', borderRadius: 999, transform: `scale(${k3})`}}>{st.tag}</span>}
          </div>
          <div style={{height: 5, background: INK, width: `${Math.min(1, k3) * 100}%`, marginTop: 2}} />
        </div>
      )}
    </>
  );
};

// ---------- 가라오케 자막 ----------
type Sub = {t: string; s: number; e: number; w: {s: number; e: number}[]};
const Subtitle: React.FC = () => {
  const t = useT();
  const s = (subs as Sub[]).find((x) => t >= x.s && t < x.e);
  if (!s) return null;
  const k = appear(t, s.s, 0.18);
  let prog = 0;
  if (s.w.length) {
    const idx = s.w.findIndex((w) => t < w.e);
    if (idx === -1) prog = 1;
    else { const w = s.w[idx]; const part = t < w.s ? 0 : Math.min(1, (t - w.s) / Math.max(0.05, w.e - w.s)); prog = (idx + part) / s.w.length; }
  } else prog = Math.min(1, (t - s.s) / Math.max(0.1, s.e - s.s));
  const tokens = s.t.split(' ');
  const total = tokens.reduce((a, b) => a + b.length, 0);
  const done = prog * total;
  let c0 = 0;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 30, display: 'flex', justifyContent: 'center', fontFamily: FONT, zIndex: 90}}>
      <div style={{fontSize: 50, fontWeight: 800, padding: '8px 20px', whiteSpace: 'nowrap', opacity: k, transform: `translateY(${(1 - k) * 14}px)`, filter: `blur(${(1 - k) * 6}px)`, letterSpacing: -1.2, display: 'flex', gap: 14}}>
        {tokens.map((tok, i) => {
          const fill = Math.max(0, Math.min(1, (done - c0) / tok.length));
          c0 += tok.length;
          const p = fill * 100;
          const active = fill > 0 && fill < 1;
          return (
            <span key={i} style={{display: 'inline-block', position: 'relative', backgroundImage: `linear-gradient(90deg, ${active ? GREEN : INK} ${p - 5}%, #a8a59d ${p + 5}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', transform: `translateY(${active ? -4 : 0}px) scale(${active ? 1.06 : 1})`, fontWeight: active || fill >= 1 ? 900 : 700}}>
              {tok}{active && <span style={{position: 'absolute', left: 0, bottom: -4, height: 4, width: `${p}%`, background: GREEN}} />}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ---------- 인트로: 키네틱 제목 → 사진 두 장 등장 ----------
const Intro: React.FC = () => {
  const t = useT();
  const end = SC.intro.to;
  const ph = EV.find((e) => e.type === 'photos')?.at ?? 3;
  const a = appear(t, 0.1, 0.6), b = appear(t, 0.35, 0.7), c = appear(t, 0.9, 0.6);
  const m = appear(t, ph - 0.2, 0.7);
  const out = interpolate(t, [end - 0.35, end], [1, 0], clamp);
  const chips = ['강의 현장', '12p 체계도', 'AI 스튜디오'];
  const cards = [{img: T.images.photo1, cap: '① 강의 현장', rot: -6, x: -330}, {img: T.images.photo2, cap: '② AI로 그린 작업실', rot: 5, x: 330}];
  return (
    <AbsoluteFill style={{fontFamily: FONT, opacity: out}}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', transform: `translateY(${-292 * m}px) scale(${1 - 0.5 * m})`}}>
        <div style={{fontFamily: MONO, color: GREY, fontSize: 24, letterSpacing: 4, opacity: a}}>MR.K — 고상철TV</div>
        <div style={{color: INK, fontWeight: 900, fontSize: 190, lineHeight: 1, marginTop: 20, letterSpacing: interpolate(b, [0, 1], [30, -8]), opacity: b, filter: `blur(${(1 - b) * 18}px)`, transform: `translateY(${(1 - b) * 60}px)`}}>공법의 신</div>
        <div style={{color: GREEN, fontWeight: 900, fontSize: 120, lineHeight: 1.1, letterSpacing: interpolate(c, [0, 1], [24, -5]), opacity: c, filter: `blur(${(1 - c) * 14}px)`, transform: `translateX(${(1 - c) * 120}px)`}}>사진 두 장 풀이</div>
        <div style={{marginTop: 30, display: 'flex', gap: 18, opacity: 1 - m}}>
          {chips.map((w, i) => {
            const q = appear(t, 1.1 + i * 0.25, 0.4);
            return <div key={w} style={{background: i === chips.length - 1 ? GREEN : INK, color: '#fff', fontSize: 34, fontWeight: 800, padding: '12px 26px', borderRadius: 999, opacity: q, transform: `translateY(${(1 - q) * 40}px)`}}>{w}</div>;
          })}
        </div>
      </AbsoluteFill>
      {cards.map((cd, i) => {
        const q = sp(t, ph + i * 0.22, 14);
        const ih = 330, iw = Math.round((ih * cd.img.w) / cd.img.h);
        return (
          <div key={i} style={{position: 'absolute', left: 960 + cd.x - (iw + 28) / 2, top: 400, background: '#fff', padding: '14px 14px 0', borderRadius: 10, boxShadow: '0 30px 70px rgba(40,32,20,.25)', opacity: Math.min(1, q * 1.4), transform: `translateY(${(1 - q) * 520}px) rotate(${cd.rot * q}deg)`}}>
            <Img src={staticFile(cd.img.src)} style={{width: iw, height: ih, objectFit: 'cover', display: 'block', borderRadius: 4}} />
            <div style={{height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 900, color: INK, letterSpacing: -1}}>{cd.cap}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- 사진 카드: 카메라 이동 + 강조 + 배지 ----------
const V = {x: 70, y: 196, w: 1780, h: 742};
const CHROME = 46;
const VW = V.w, VH = V.h - CHROME;
type Cam = {x: number; y: number; z: number};
const drift = (dt: number) => 1 + 0.035 * (1 - Math.exp(-Math.max(0, dt) / 6));
const camAt = (cams: Ev[], t: number): Cam => {
  if (!cams.length) return {x: 1000, y: 700, z: 1};
  let c: Cam = {x: cams[0].x!, y: cams[0].y!, z: cams[0].z!};
  let lastEnd = cams[0].at + (cams[0].d ?? 0);
  for (const k of cams.slice(1)) {
    if (t < k.at) break;
    c = {...c, z: c.z * drift(k.at - lastEnd)};
    const p = ez(Math.min(1, (t - k.at) / Math.max(0.01, k.d ?? 0.9)));
    c = {x: c.x + (k.x! - c.x) * p, y: c.y + (k.y! - c.y) * p, z: c.z * Math.pow(k.z! / c.z, p)};
    lastEnd = k.at + (k.d ?? 0.9);
  }
  return {...c, z: c.z * drift(t - lastEnd)};
};

const Ripple: React.FC<{x: number; y: number; t: number; at: number; col: string}> = ({x, y, t, at, col}) => {
  const p = interpolate(t, [at, at + 0.55], [0, 1], clamp);
  if (t < at || p >= 1) return null;
  const r = 20 + 60 * p;
  return <div style={{position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `5px solid ${col}`, opacity: 1 - p, zIndex: 49}} />;
};

const Badge: React.FC<{e: Ev; t: number}> = ({e, t}) => {
  const k = sp(t, e.at, 11);
  const out = interpolate(t, [e.end!, e.end! + 0.3], [1, 0], clamp);
  const box: React.CSSProperties = e.pos === 'left' ? {left: 56, top: VH / 2 - 110} : {left: 0, right: 0, top: VH / 2 - 80, display: 'flex', justifyContent: 'center'};
  return (
    <div style={{position: 'absolute', ...box, zIndex: 60, opacity: out}}>
      <div style={{background: INK, color: '#fff', borderLeft: `14px solid ${GREEN}`, borderRadius: 26, padding: '26px 46px', fontFamily: FONT, boxShadow: '0 30px 70px rgba(0,0,0,.35)', transform: `scale(${0.6 + 0.4 * k}) rotate(${(1 - k) * -3}deg)`, opacity: Math.min(1, k * 1.6), transformOrigin: e.pos === 'left' ? 'left center' : 'center'}}>
        <div style={{fontSize: 64, fontWeight: 900, letterSpacing: -2, whiteSpace: 'nowrap'}}>{e.text}</div>
        {e.sub && <div style={{fontSize: 28, fontWeight: 700, color: '#bdf5d0', marginTop: 10, whiteSpace: 'nowrap'}}>{e.sub}</div>}
      </div>
    </div>
  );
};

// 건폐율·용적률 정리 패널 (03 단계)
const Frac: React.FC<{name: string; num: string; den: string; law: string; k: number}> = ({name, num, den, law, k}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 24, height: 128, opacity: k, transform: `translateX(${(1 - k) * -60}px)`, filter: `blur(${(1 - k) * 8}px)`}}>
    <div style={{background: GREEN, color: '#fff', fontWeight: 900, fontSize: 46, padding: '10px 26px', borderRadius: 16, letterSpacing: -1}}>{name}</div>
    <div style={{fontSize: 52, fontWeight: 900, color: INK}}>=</div>
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <div style={{fontSize: 44, fontWeight: 900, color: INK, padding: '0 14px'}}>{num}</div>
      <div style={{height: 5, alignSelf: 'stretch', background: INK, borderRadius: 3}} />
      <div style={{fontSize: 44, fontWeight: 900, color: INK, padding: '0 14px'}}>{den}</div>
    </div>
    <div style={{fontSize: 44, fontWeight: 900, color: INK}}>× 100 (%)</div>
    <div style={{flex: 1}} />
    <div style={{fontFamily: MONO, fontSize: 20, color: GREY, letterSpacing: 1}}>{law}</div>
  </div>
);
const ZONES = [{n: '주거', c: '#f2c230', v: 500}, {n: '상업', c: '#ef4444', v: 1500}, {n: '공업', c: '#8b5cf6', v: 400}];
const Panel: React.FC<{t: number; to: number}> = ({t, to}) => {
  const it = (name: string) => EV.find((e) => e.type === 'panel' && e.item === name);
  const open = it('open'); if (!open || t < open.at) return null;
  const k = appear(t, open.at, 0.5);
  const out = interpolate(t, [to - 0.35, to], [1, 0], clamp);
  const kf1 = it('f1') ? appear(t, it('f1')!.at, 0.5) : 0;
  const kf2 = it('f2') ? appear(t, it('f2')!.at, 0.5) : 0;
  const kz = it('zone') ? appear(t, it('zone')!.at, 0.5) : 0;
  const kl = it('law') ? appear(t, it('law')!.at, 0.5) : 0;
  return (
    <div style={{position: 'absolute', left: 30, top: 26, width: 1320, height: VH - 52, background: '#fbfaf7', borderRadius: 24, boxShadow: '0 30px 70px rgba(40,32,20,.28)', padding: '26px 44px', boxSizing: 'border-box', fontFamily: FONT, zIndex: 55, opacity: k * out, transform: `translateY(${(1 - k) * 30}px)`, filter: `blur(${(1 - k) * 8}px)`}}>
      <div style={{fontFamily: MONO, fontSize: 20, color: GREY, letterSpacing: 3}}>WHITEBOARD → 공법 정답 노트</div>
      <Frac name="건폐율" num="건축면적" den="대지면적" law="건축법 제55조" k={kf1} />
      <div style={{height: 2, background: 'rgba(0,0,0,.08)', opacity: kf2}} />
      <Frac name="용적률" num="연면적" den="대지면적" law="건축법 제56조" k={kf2} />
      <div style={{height: 2, background: 'rgba(0,0,0,.08)', opacity: kz}} />
      <div style={{marginTop: 16, opacity: kz, transform: `translateY(${(1 - kz) * 30}px)`}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 18}}>
          <div style={{fontSize: 38, fontWeight: 900, color: INK, letterSpacing: -1}}>용적률 상한은 <span style={{color: GREEN}}>용도지역마다</span> 다르다</div>
          <div style={{flex: 1}} />
          <div style={{fontFamily: MONO, fontSize: 20, color: kl > 0.5 ? GREEN : GREY, letterSpacing: 1}}>국토계획법 제78조</div>
        </div>
        <div style={{marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12}}>
          {ZONES.map((z, i) => {
            const kb = appear(t, it('z' + i)?.at ?? (it('law')?.at ?? 1e9) + 0.25 + i * 0.75, 0.6);
            return (
              <div key={z.n} style={{display: 'flex', alignItems: 'center', gap: 18, height: 44}}>
                <div style={{width: 92, fontSize: 30, fontWeight: 900, color: INK, display: 'flex', alignItems: 'center', gap: 10}}><span style={{width: 18, height: 18, borderRadius: 5, background: z.c, display: 'inline-block'}} />{z.n}</div>
                <div style={{flex: 1, height: 34, background: 'rgba(0,0,0,.06)', borderRadius: 10, overflow: 'hidden'}}>
                  <div style={{height: '100%', width: `${(z.v / 1500) * 100 * kb}%`, background: z.c, borderRadius: 10}} />
                </div>
                <div style={{width: 250, textAlign: 'right', whiteSpace: 'nowrap', fontSize: 34, fontWeight: 900, color: INK, opacity: kb}}>{z.v.toLocaleString()}% 이하</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Confetti: React.FC<{t: number; at: number}> = ({t, at}) => {
  const dt = t - at;
  if (dt < 0 || dt > 4) return null;
  const cols = [GREEN, '#f2c230', RED, '#3b82f6', '#ec4899', '#ffffff'];
  const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  return (
    <AbsoluteFill style={{pointerEvents: 'none', zIndex: 80, opacity: interpolate(dt, [3.2, 4], [1, 0], clamp)}}>
      {Array.from({length: 140}, (_, i) => {
        const side = i % 2 ? 1 : -1;
        const x0 = side > 0 ? 1920 + 20 : -20, y0 = 760 + rnd(i) * 200;
        const vx = -side * (500 + rnd(i + 3) * 900), vy = -(900 + rnd(i + 7) * 700);
        const x = x0 + vx * dt * 0.9, y = y0 + vy * dt + 900 * dt * dt;
        const rot = (rnd(i + 11) * 720 - 360) * dt;
        const w = 10 + rnd(i + 5) * 14;
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: w, height: w * 0.45, background: cols[i % cols.length], borderRadius: 2, transform: `rotate(${rot}deg) scaleX(${Math.cos(dt * 8 + i)})`, boxShadow: '0 1px 2px rgba(0,0,0,.15)'}} />;
      })}
    </AbsoluteFill>
  );
};

const Shot: React.FC<{img: ImgMeta; scenes: string[]; from: number; to: number}> = ({img, scenes, from, to}) => {
  const t = useT();
  if (t < from - 0.01 || t >= to) return null;
  const mine = EV.filter((e) => scenes.includes(e.scene));
  const cams = mine.filter((e) => e.type === 'cam').sort((a, b) => a.at - b.at);
  const c = camAt(cams, t);
  const s0 = Math.max(VW / img.w, VH / img.h);
  const S1 = s0 * c.z;
  const tx = Math.min(0, Math.max(VW - img.w * S1, VW / 2 - c.x * S1));
  const ty = Math.min(0, Math.max(VH - img.h * S1, VH / 2 - c.y * S1));
  const sc = (x: number, y: number) => ({x: tx + x * S1, y: ty + y * S1});
  const enter = appear(t, from, 0.5);
  const exit = interpolate(t, [to - 0.3, to], [1, 0], clamp);
  const his = mine.filter((e) => e.type === 'hi' && t >= e.at - 0.05 && t < e.end! + 0.3);
  const active = [...his].filter((h) => t >= h.at).sort((a, b) => b.at - a.at)[0];
  const badges = mine.filter((e) => e.type === 'badge' && e.pos !== 'corner' && t >= e.at - 0.05 && t < e.end! + 0.3);
  const corner = mine.find((e) => e.type === 'badge' && e.pos === 'corner');
  const confetti = mine.find((e) => e.type === 'confetti');
  const hasPanel = mine.some((e) => e.type === 'panel');
  const panelTo = hasPanel ? SC[mine.find((e) => e.type === 'panel')!.scene].to : 0;
  return (
    <>
      <div style={{position: 'absolute', left: V.x, top: V.y, width: V.w, height: V.h, borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 70px rgba(40,32,20,.18), 0 2px 6px rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.06)', opacity: enter * exit, transform: `translateY(${(1 - enter) * 40}px)`, filter: `blur(${(1 - enter) * 8}px)`}}>
        <div style={{height: CHROME, background: '#e8eaed', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9}}>
          {['#ff5f57', '#febc2e', '#28c840'].map((cc) => <div key={cc} style={{width: 14, height: 14, borderRadius: 7, background: cc}} />)}
          <div style={{marginLeft: 16, flex: 1, background: '#fff', borderRadius: 999, height: 30, display: 'flex', alignItems: 'center', padding: '0 18px', fontFamily: FONT, fontSize: 19, color: '#333'}}>🖼 {img.url}</div>
          {corner && t >= corner.at && (() => {
            const k = sp(t, corner.at, 9);
            const pop = 0.35 * Math.max(0, 1 - (t - corner.at) / 0.8) * k;
            return <div style={{marginLeft: 12, background: INK, color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 18, height: 30, display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 999, borderLeft: `6px solid ${GREEN}`, transform: `scale(${0.5 + 0.5 * k + pop})`, transformOrigin: 'right center', whiteSpace: 'nowrap'}}>✨ {corner.text}</div>;
          })()}
        </div>
        <div style={{position: 'relative', width: VW, height: VH, overflow: 'hidden', background: '#f4f2ee'}}>
          <Img src={staticFile(img.src)} style={{position: 'absolute', left: tx, top: ty, width: img.w * S1, height: img.h * S1}} />
          {active && (() => {
            const a = sc(active.box![0], active.box![1]);
            const k = Math.min(1, sp(t, active.at, 12) * 1.4) * interpolate(t, [active.end!, active.end! + 0.3], [1, 0], clamp);
            return <div style={{position: 'absolute', left: a.x - 10, top: a.y - 10, width: active.box![2] * S1 + 20, height: active.box![3] * S1 + 20, borderRadius: 14, boxShadow: `0 0 0 9999px rgba(20,16,10,${0.34 * k})`, zIndex: 39}} />;
          })()}
          {his.map((h, i) => {
            const a = sc(h.box![0], h.box![1]);
            const w = h.box![2] * S1, hh = h.box![3] * S1;
            const k = sp(t, h.at - 0.05, 12);
            const out = interpolate(t, [h.end!, h.end! + 0.3], [1, 0], clamp);
            const col = h.color === 'red' ? RED : GREEN;
            const isAct = h === active;
            const pulse = isAct ? 1 + Math.sin((t - h.at) * 6) * 0.012 : 1;
            const pad = 10;
            const lab: React.CSSProperties = h.side === 'top' ? {left: -pad, bottom: hh + pad * 2 + 12} : h.side === 'left' ? {right: w + pad * 2 + 16, top: hh / 2 - 28} : h.side === 'right' ? {left: w + pad * 2 + 16, top: hh / 2 - 28} : {left: -pad, top: hh + pad * 2 + 12};
            return (
              <div key={i} style={{position: 'absolute', left: a.x - pad, top: a.y - pad, width: w + pad * 2, height: hh + pad * 2, transform: `scale(${(0.75 + 0.25 * k) * pulse})`, opacity: Math.min(1, k * 1.5) * out * (isAct ? 1 : 0.85), zIndex: isAct ? 42 : 41}}>
                <div style={{position: 'absolute', inset: 0, border: `6px solid ${col}`, borderRadius: 14, boxShadow: isAct ? `0 0 30px ${col}` : 'none'}} />
                {h.label && h.side !== 'none' && (
                  <div style={{position: 'absolute', ...lab, whiteSpace: 'nowrap', background: col === GREEN ? INK : col, color: '#fff', borderLeft: `8px solid ${col === GREEN ? GREEN : '#fff'}`, fontFamily: FONT, fontWeight: 800, fontSize: 32, padding: '8px 20px', borderRadius: 12, boxShadow: '0 8px 20px rgba(0,0,0,.3)'}}>{h.label}</div>
                )}
              </div>
            );
          })}
          {his.map((h, i) => { const cc = sc(h.box![0] + h.box![2] / 2, h.box![1] + h.box![3] / 2); return <Ripple key={'r' + i} x={cc.x} y={cc.y} t={t} at={h.at} col={h.color === 'red' ? RED : GREEN} />; })}
          {hasPanel && <Panel t={t} to={panelTo} />}
          {badges.map((b, i) => <Badge key={i} e={b} t={t} />)}
        </div>
      </div>
      {confetti && <Confetti t={t} at={confetti.at} />}
    </>
  );
};

// ---------- 마무리: 명언 카드 ----------
const Outro: React.FC = () => {
  const t = useT();
  const from = SC.outro.from;
  if (t < from) return null;
  const ss = T.sentences.filter((s) => s.scene === 'outro');
  const k0 = appear(t, from, 0.5);
  const l1 = appear(t, ss[0].s, 0.6), l2 = appear(t, ss[1].s, 0.6), l3 = sp(t, ss[2].s, 15);
  const l3b = sp(t, ss[2].s + 0.35, 15);
  const fin = appear(t, ss[2].e + 0.1, 0.5);
  const line = (k: number): React.CSSProperties => ({opacity: k, transform: `translateY(${(1 - k) * 26}px)`, filter: `blur(${(1 - k) * 8}px)`});
  return (
    <AbsoluteFill style={{fontFamily: FONT}}>
      <div style={{position: 'absolute', left: 170, right: 170, top: 210, background: '#fff', borderRadius: 30, padding: '46px 70px', boxShadow: '0 30px 80px rgba(40,32,20,.2)', opacity: k0, transform: `translateY(${(1 - k0) * 40}px)`}}>
        <div style={{fontFamily: MONO, fontSize: 22, color: GREY, letterSpacing: 4}}>고상철의 한마디</div>
        <div style={{fontSize: 140, lineHeight: 0.6, color: GREEN, fontWeight: 900, marginTop: 34, height: 50}}>“</div>
        <div style={{fontSize: 52, fontWeight: 800, color: INK, letterSpacing: -1.5, lineHeight: 1.35, ...line(l1)}}>훌륭한 의사는 한 시간에 <span style={{fontWeight: 900}}>한 사람의 생명</span>을 구할 수 있지만,</div>
        <div style={{fontSize: 52, fontWeight: 800, color: INK, letterSpacing: -1.5, lineHeight: 1.35, marginTop: 10, ...line(l2)}}>훌륭한 선생은 한 시간에 <span style={{color: GREEN, fontWeight: 900}}>수만 명의 인생</span>을 바꿀 수 있습니다.</div>
        <div style={{height: 5, background: INK, width: `${l2 * 100}%`, marginTop: 30}} />
        <div style={{display: 'flex', alignItems: 'baseline', marginTop: 34, whiteSpace: 'nowrap'}}>
          <span style={{fontSize: 74, fontWeight: 900, color: INK, letterSpacing: interpolate(l3, [0, 1], [14, -3]), display: 'inline-block', opacity: Math.min(1, l3 * 1.4), filter: `blur(${(1 - Math.min(1, l3)) * 14}px)`, transform: `translateY(${(1 - l3) * 40}px)`}}>공법이 재미있고</span>
          <span style={{fontSize: 74, fontWeight: 900, color: GREEN, letterSpacing: interpolate(l3b, [0, 1], [18, -3]), display: 'inline-block', whiteSpace: 'pre', opacity: Math.min(1, l3b * 1.4), filter: `blur(${(1 - Math.min(1, l3b)) * 16}px)`, transform: `translateX(${(1 - l3b) * 80}px)`}}> 기다려지는 시간</span>
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 900, display: 'flex', justifyContent: 'center', gap: 18, opacity: fin, transform: `translateY(${(1 - fin) * 30}px)`}}>
        {['MR.K 고상철TV', '미스터홈즈 FC', '공법의 신'].map((w, i) => <div key={w} style={{background: i === 2 ? GREEN : INK, color: '#fff', fontSize: 34, fontWeight: 800, padding: '12px 28px', borderRadius: 999}}>{w}</div>)}
      </div>
    </AbsoluteFill>
  );
};

const FacePip: React.FC = () => {
  const frame = useCurrentFrame();
  const k = spring({frame: Math.max(0, frame - 8), fps: FPS, config: {damping: 13}});
  return (
    <div style={{position: 'absolute', right: 70, top: 66, width: 100, height: 100, transform: `scale(${k})`, filter: 'drop-shadow(0 8px 16px rgba(40,32,20,.28))', zIndex: 100}}>
      <Loop durationInFrames={Math.round(11.6 * FPS)}>
        <OffthreadVideo src={staticFile('face.webm')} transparent muted style={{width: 100, height: 100}} />
      </Loop>
    </div>
  );
};

// 같은 사진을 쓰는 연속 장면은 하나의 카드로 묶어 카메라만 이동
const SHOTS = T.shots.reduce<{img: string; scenes: string[]}[]>((acc, s) => {
  const last = acc[acc.length - 1];
  if (last && last.img === s.img) last.scenes.push(s.id); else acc.push({img: s.img, scenes: [s.id]});
  return acc;
}, []).map((g) => ({...g, from: SC[g.scenes[0]].from, to: SC[g.scenes[g.scenes.length - 1]].to}));

const Main: React.FC = () => {
  const clicks = EV.filter((e) => e.type === 'hi' || (e.type === 'badge' && e.pos !== 'corner')).map((e) => e.at);
  const pops = EV.filter((e) => e.type === 'badge' && e.pos === 'corner' || e.type === 'panel').map((e) => e.at);
  const whooshes = [...SHOTS.map((s) => s.from), SC.outro.from, ...EV.filter((e) => e.type === 'photos').map((e) => e.at)];
  return (
    <AbsoluteFill style={{backgroundColor: '#e9e7e2'}}>
      <Bg />
      <Audio src={staticFile('voice.wav')} />
      {clicks.map((c, i) => <Sequence key={'c' + i} from={f(c)} durationInFrames={8}><Audio src={staticFile('click.wav')} volume={0.8} /></Sequence>)}
      {pops.map((c, i) => <Sequence key={'p' + i} from={f(c)} durationInFrames={8}><Audio src={staticFile('click.wav')} volume={0.5} /></Sequence>)}
      {whooshes.map((c, i) => <Sequence key={'w' + i} from={Math.max(0, f(c) - 4)} durationInFrames={20}><Audio src={staticFile('whoosh.wav')} volume={0.22} /></Sequence>)}
      <Sequence durationInFrames={f(SC.intro.to)}><Intro /></Sequence>
      {SHOTS.map((s) => <Shot key={s.from} img={T.images[s.img]} scenes={s.scenes} from={s.from} to={s.to} />)}
      <Outro />
      <Header />
      <FacePip />
      <Subtitle />
    </AbsoluteFill>
  );
};

const Root: React.FC = () => (
  <Composition id="Decor" component={Main} durationInFrames={Math.round(DUR * FPS)} fps={FPS} width={1920} height={1080} />
);
registerRoot(Root);
