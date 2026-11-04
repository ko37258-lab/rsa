// '2장의 사진과 2줄의 말로 만든 영상 — 만드는 방법' (16:9 HowTo169 · 9:16 HowTo916)
// build2.py 가 만든 src/timeline2.json + src/subs2.json + public/voice2.wav 로 그린다.
import React, {createContext, useContext} from 'react';
import {
  AbsoluteFill, Audio, Composition, Img, Loop, OffthreadVideo, Sequence, registerRoot, staticFile,
  useCurrentFrame, interpolate, spring, Easing, delayRender, continueRender,
} from 'remotion';
import TL from './timeline2.json';
import subs from './subs2.json';
import WAVE from './wave2.json';

type Ev = {type: string; i: number; scene: string; at: number; end: number; kw?: string; id?: string; n?: number; target?: string;
  x?: number; y?: number; z?: number; d?: number; v?: {x: number; y: number; z: number}; box?: number[]; label?: string; side?: string; color?: string};
type Panel = {type: string; scene: string; at: number; end: number; n?: number; img?: string; from?: number; clipStart?: number; segs?: number[][]};
type ImgMeta = {src: string; w: number; h: number; url: string};
type Step = {from: number; to: number; n: string; a: string; b: string};
const T = TL as unknown as {duration: number; sentences: {scene: string; s: number; e: number; show: string}[]; scenes: Record<string, {from: number; to: number}>;
  steps: Step[]; events: Ev[]; panels: Panel[]; images: Record<string, ImgMeta>};
const FPS = 30, DUR = T.duration, EV = T.events, PANELS = T.panels, SC = T.scenes;
const FONT = "'Pretendard','Malgun Gothic',sans-serif";
const MONO = "Consolas,'Cascadia Mono','Pretendard',monospace";
const INK = '#111111', GREEN = '#1fcf62', RED = '#ef4444', GREY = '#6f6b63', PAPER = '#e9e7e2';
const ez = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const appear = (t: number, at: number, d = 0.35) => interpolate(t, [at, at + d], [0, 1], {...clamp, easing: ez});
const f = (s: number) => Math.round(s * FPS);
const sp = (t: number, at: number, damping = 13) => spring({frame: Math.max(0, Math.round((t - at) * FPS)), fps: FPS, config: {damping}});
const useT = () => useCurrentFrame() / FPS;
const evOf = (type: string, scene?: string) => EV.filter((e) => e.type === type && (!scene || e.scene === scene));
const mark = (id: string) => EV.find((e) => e.type === 'mark' && e.id === id)?.at ?? 1e9;
const TOTAL_STEPS = new Set(T.steps.filter((s) => /^\d+$/.test(s.n)).map((s) => s.n)).size;

// ---------- 화면 배치 (16:9 / 9:16) ----------
type Box = {x: number; y: number; w: number; h: number};
type Lay = {W: number; H: number; vert: boolean; card: Box; clip: Box; clipV: Box; left: number; labelTop: number; titleTop: number; titleFs: number;
  face: {right: number; top: number; size: number}; sub: {fs: number; bottom?: number; top?: number; maxW: number}};
const L169: Lay = {W: 1920, H: 1080, vert: false, card: {x: 70, y: 196, w: 1780, h: 742}, clip: {x: 220, y: 180, w: 1480, h: 878}, clipV: {x: 341, y: 196, w: 1238, h: 742},
  left: 70, labelTop: 26, titleTop: 66, titleFs: 78, face: {right: 70, top: 66, size: 100}, sub: {fs: 50, bottom: 30, maxW: 1860}};
const L916: Lay = {W: 1080, H: 1920, vert: true, card: {x: 40, y: 300, w: 1000, h: 1040}, clip: {x: 40, y: 520, w: 1000, h: 608}, clipV: {x: 40, y: 520, w: 1000, h: 608},
  left: 44, labelTop: 44, titleTop: 100, titleFs: 64, face: {right: 44, top: 92, size: 124}, sub: {fs: 56, top: 1395, maxW: 980}};
const LayCtx = createContext<Lay>(L169);
const useL = () => useContext(LayCtx);
const CHROME = 46;

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
    <AbsoluteFill style={{background: `radial-gradient(1400px 900px at ${50 + Math.sin(t / 6) * 4}% 45%, #f4f2ee 0%, ${PAPER} 55%, #dcd9d2 100%)`}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(60,50,30,.16) 100%)'}} />
    </AbsoluteFill>
  );
};

// ---------- 상단 진행선 · 라벨 · 키네틱 단계 제목 ----------
const Header: React.FC = () => {
  const t = useT(); const L = useL();
  const st = T.steps.find((s) => t >= s.from && t < s.to);
  const done = new Set(T.steps.filter((s) => /^\d+$/.test(s.n) && t >= s.from).map((s) => s.n)).size;
  const k = (d: number) => sp(t - d, st ? st.from : 0, 15);
  const e = st ? interpolate(t, [st.to - 0.3, st.to], [0, 1], clamp) : 0;
  const k1 = k(0.05), k2 = k(0.3), k3 = k(0.5);
  const fs = L.titleFs;
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, height: 5, width: `${(t / DUR) * 100}%`, background: GREEN}} />
      <div style={{position: 'absolute', left: L.left, right: L.vert ? L.face.right : 200, top: L.labelTop, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: L.vert ? 20 : 17, color: GREY, letterSpacing: 1.5}}>
        <span style={{fontFamily: FONT, fontWeight: 900, fontSize: L.vert ? 26 : 22, color: INK, letterSpacing: -0.5, marginRight: 16}}>MR<span style={{color: GREEN}}>.</span>K</span>
        {L.vert ? '영리치TV — 만드는 방법' : '영리치TV — 사진 2장 + 말 2줄로 영상 만드는 방법'}
        <div style={{flex: 1}} />
        {done > 0 && <span style={{marginRight: 18}}>STEP {String(done).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')}</span>}
        {Array.from({length: TOTAL_STEPS}, (_, i) => <div key={i} style={{width: 9, height: 9, borderRadius: 5, marginLeft: 7, background: i < done ? INK : 'rgba(0,0,0,.18)'}} />)}
      </div>
      {st && (
        <div style={{position: 'absolute', left: L.left, top: L.titleTop, fontFamily: FONT, opacity: 1 - e, transform: `translateX(${-50 * e}px)`, filter: `blur(${8 * e}px)`}}>
          <div style={{display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap'}}>
            <span style={{fontFamily: MONO, fontSize: 22, color: GREEN, fontWeight: 700, marginRight: 20, opacity: k1}}>{st.n}</span>
            <span style={{fontSize: fs, fontWeight: 900, color: INK, letterSpacing: interpolate(k1, [0, 1], [14, -3]), display: 'inline-block', transform: `translateY(${(1 - k1) * 50}px)`, filter: `blur(${(1 - Math.min(1, k1)) * 14}px)`, opacity: Math.min(1, k1 * 1.4)}}>{st.a}</span>
            <span style={{fontSize: fs, fontWeight: 900, color: GREEN, letterSpacing: interpolate(k2, [0, 1], [18, -3]), display: 'inline-block', whiteSpace: 'pre', transform: `translateX(${(1 - k2) * 80}px)`, filter: `blur(${(1 - Math.min(1, k2)) * 16}px)`, opacity: Math.min(1, k2 * 1.4)}}>{st.b}</span>
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
  const t = useT(); const L = useL();
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
  const pos: React.CSSProperties = L.sub.bottom !== undefined ? {bottom: L.sub.bottom} : {top: L.sub.top};
  return (
    <div style={{position: 'absolute', left: 0, right: 0, ...pos, display: 'flex', justifyContent: 'center', fontFamily: FONT, zIndex: 90}}>
      <div style={{fontSize: L.sub.fs, fontWeight: 800, padding: '8px 20px', maxWidth: L.sub.maxW, whiteSpace: L.vert ? 'normal' : 'nowrap', flexWrap: L.vert ? 'wrap' : 'nowrap', justifyContent: 'center', rowGap: 6, opacity: k, transform: `translateY(${(1 - k) * 14}px)`, filter: `blur(${(1 - k) * 6}px)`, letterSpacing: -1.2, display: 'flex', columnGap: 20}}>
        {tokens.map((tok, i) => {
          const fill = Math.max(0, Math.min(1, (done - c0) / tok.length));
          c0 += tok.length;
          const p = fill * 100;
          const active = fill > 0 && fill < 1;
          return (
            <span key={i} style={{display: 'inline-block', position: 'relative', whiteSpace: 'nowrap', backgroundImage: `linear-gradient(90deg, ${active ? GREEN : INK} ${p - 5}%, #a8a59d ${p + 5}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', transform: `translateY(${active ? -4 : 0}px) scale(${active ? 1.03 : 1})`, fontWeight: active || fill >= 1 ? 900 : 700}}>
              {tok}{active && <span style={{position: 'absolute', left: 0, bottom: -4, height: 4, width: `${p}%`, background: GREEN}} />}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ---------- 공통 카드(브라우저 창) ----------
const Card: React.FC<{box: Box; p: Panel; url: string; dark?: boolean; children: React.ReactNode}> = ({box, p, url, dark, children}) => {
  const t = useT();
  const enter = appear(t, p.at, 0.5);
  const exit = interpolate(t, [p.end - 0.28, p.end], [1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: 18, overflow: 'hidden', background: dark ? '#141414' : '#fff', boxShadow: '0 30px 70px rgba(40,32,20,.18), 0 2px 6px rgba(0,0,0,.06)', border: '1px solid rgba(0,0,0,.06)', opacity: enter * exit, transform: `translateY(${(1 - enter) * 40}px)`, filter: `blur(${(1 - enter) * 8}px)`, fontFamily: FONT}}>
      <div style={{height: CHROME, background: '#e8eaed', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{width: 14, height: 14, borderRadius: 7, background: c}} />)}
        <div style={{marginLeft: 16, flex: 1, background: '#fff', borderRadius: 999, height: 30, display: 'flex', alignItems: 'center', padding: '0 18px', fontSize: 19, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden'}}>{url}</div>
      </div>
      <div style={{position: 'relative', width: box.w, height: box.h - CHROME, overflow: 'hidden'}}>{children}</div>
    </div>
  );
};
const Free: React.FC<{p: Panel; children: React.ReactNode}> = ({p, children}) => {
  const t = useT();
  const enter = appear(t, p.at, 0.5);
  const exit = interpolate(t, [p.end - 0.28, p.end], [1, 0], clamp);
  return <AbsoluteFill style={{fontFamily: FONT, opacity: enter * exit, filter: `blur(${(1 - enter) * 8}px)`, transform: `translateY(${(1 - enter) * 30}px)`}}>{children}</AbsoluteFill>;
};
const Pill: React.FC<{children: React.ReactNode; col?: string; fs?: number; style?: React.CSSProperties}> = ({children, col = GREEN, fs = 30, style}) => (
  <div style={{whiteSpace: 'nowrap', background: col === GREEN ? INK : col, color: '#fff', borderLeft: `8px solid ${col === GREEN ? GREEN : '#fff'}`, fontFamily: FONT, fontWeight: 800, fontSize: fs, padding: '8px 20px', borderRadius: 12, boxShadow: '0 8px 20px rgba(0,0,0,.3)', ...style}}>{children}</div>
);

// ---------- 1. 인트로 ----------
const TitlePanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const a = appear(t, 0.1, 0.6), b = appear(t, 0.35, 0.7), c = appear(t, mark('twolines') - 0.1, 0.6), d = appear(t, mark('twolines') + 0.5, 0.6);
  const shot = sp(t, 0.9, 14);
  const stamp = sp(t, mark('zero'), 9);
  const big = L.vert ? 132 : 150;
  const title = (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: L.vert ? 'center' : 'flex-start'}}>
      <div style={{fontFamily: MONO, color: GREY, fontSize: 24, letterSpacing: 4, opacity: a}}>Claude Opus 5.5 · 영리치TV</div>
      <div style={{color: INK, fontWeight: 900, fontSize: big, lineHeight: 1.02, marginTop: 18, letterSpacing: interpolate(b, [0, 1], [30, -7]), opacity: b, filter: `blur(${(1 - b) * 18}px)`, transform: `translateY(${(1 - b) * 60}px)`, whiteSpace: 'nowrap'}}>사진 2장</div>
      <div style={{color: GREEN, fontWeight: 900, fontSize: big, lineHeight: 1.05, letterSpacing: interpolate(c, [0, 1], [24, -7]), opacity: c, filter: `blur(${(1 - c) * 14}px)`, transform: `translateX(${(1 - c) * 120}px)`, whiteSpace: 'nowrap'}}>+ 말 2줄</div>
      <div style={{color: INK, fontWeight: 900, fontSize: big * 0.56, marginTop: 14, opacity: d, transform: `translateY(${(1 - d) * 30}px)`, whiteSpace: 'nowrap'}}>= 영상 한 편</div>
    </div>
  );
  const sw = L.vert ? 960 : 800;
  const shotEl = (
    <div style={{position: 'relative', width: sw, opacity: Math.min(1, shot * 1.4), transform: `translateY(${(1 - shot) * 80}px) rotate(${(1 - shot) * 4}deg)`}}>
      <div style={{fontFamily: MONO, fontSize: 20, color: GREY, letterSpacing: 2, marginBottom: 10}}>실제로 보낸 대화 그대로</div>
      <div style={{background: '#fff', borderRadius: 20, padding: 14, boxShadow: '0 30px 70px rgba(40,32,20,.22)'}}>
        <Img src={staticFile('chat.png')} style={{width: sw - 28, height: ((sw - 28) * 298) / 540, display: 'block', borderRadius: 10}} />
      </div>
      {t >= mark('zero') && (
        <div style={{position: 'absolute', right: -20, bottom: -46, transform: `scale(${0.4 + 0.6 * stamp}) rotate(${-6 + (1 - stamp) * -10}deg)`, background: RED, color: '#fff', fontWeight: 900, fontSize: L.vert ? 54 : 50, padding: '14px 30px', borderRadius: 20, boxShadow: '0 20px 50px rgba(0,0,0,.35)', whiteSpace: 'nowrap'}}>편집 프로그램 0%</div>
      )}
    </div>
  );
  return (
    <Free p={p}>
      {L.vert ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 70}}>{title}{shotEl}</div>
      ) : (
        <div style={{position: 'absolute', left: 130, right: 110, top: 170, bottom: 150, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>{title}{shotEl}</div>
      )}
    </Free>
  );
};

// ---------- 2. 완성 영상 클립 ----------
const ClipPanel: React.FC<{p: Panel}> = ({p}) => {
  const L = useL();
  const box = p.type === 'clipA' ? L.clip : L.clipV;
  const segs = p.type === 'clipA' ? p.segs! : [[p.from!, p.from! + (p.end - p.at) + 0.5]];
  let acc = p.type === 'clipA' ? p.clipStart! : p.at;
  const vw = box.w, vh = box.h - CHROME;
  const s = Math.min(vw / 1920, vh / 1080), w = 1920 * s, h = 1080 * s;
  return (
    <>
      <Card box={box} p={p} url={p.type === 'clipA' ? '▶ 완성 영상 — 공법의신_사진두장_모션그래픽.mp4' : '▶ 완성 영상 03단계 — 국토계획법 제78조로 바로잡은 장면'} dark>
        {segs.map((sg, k) => {
          const from = acc; acc += sg[1] - sg[0];
          return (
            <Sequence key={k} from={f(from)} durationInFrames={Math.max(1, f(sg[1] - sg[0]))}>
              <OffthreadVideo src={staticFile('result.mp4')} startFrom={f(sg[0])} muted={p.type !== 'clipA'} style={{position: 'absolute', left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h}} />
            </Sequence>
          );
        })}
      </Card>
    </>
  );
};

// ---------- 3. 대화 화면(또렷하게 다시 그림) ----------
const LINE1 = '모션그래픽 스킬 이용해서 현재 보이는 내용 설명하는 영상만들어줘';
const LINE2 = '목소리 fish audio "밝은 상철" 목소리로 하되 속도는 1.15배로 진행해';
const ChatPanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const his = evOf('hi', p.scene).filter((h) => t >= h.at - 0.05 && t < h.end + 0.3);
  const anyActive = his.some((h) => t >= h.at);
  const vis = (target: string) => his.find((h) => h.target === target && t >= h.at - 0.05);
  const dimmed = (targets: string[]) => anyActive && !targets.some((x) => vis(x)) ? 0.32 : 1;
  const ring = (target: string, side: 'top' | 'left' | 'bottom' = 'top') => {
    const h = vis(target); if (!h) return null;
    const k = sp(t, h.at, 12); const out = interpolate(t, [h.end, h.end + 0.3], [1, 0], clamp);
    return (
      <div style={{position: 'absolute', inset: -12, border: `6px solid ${GREEN}`, borderRadius: 24, boxShadow: `0 0 30px ${GREEN}`, opacity: Math.min(1, k * 1.5) * out, transform: `scale(${0.85 + 0.15 * k})`, zIndex: 5}}>
        {h.label && <Pill fs={L.vert ? 30 : 32} style={{position: 'absolute', ...(side === 'top' ? {left: -6, top: -62} : side === 'bottom' ? {left: -6, bottom: -62} : {right: '100%', marginRight: 18, top: 'calc(50% - 26px)'})}}>{h.label}</Pill>}
      </div>
    );
  };
  const pw = L.vert ? 462 : 520, ph = L.vert ? 300 : 320, fs = L.vert ? 31 : 32;
  return (
    <Card box={L.card} p={p} url="claude.ai — 대표님이 보낸 메시지">
      <div style={{position: 'absolute', inset: 0, background: '#faf9f5', display: 'flex', flexDirection: 'column', alignItems: L.vert ? 'center' : 'flex-end', justifyContent: 'center', padding: L.vert ? '0 24px' : '0 90px', gap: L.vert ? 70 : 64}}>
        <div style={{position: 'relative', display: 'flex', gap: 16, opacity: dimmed(['photos'])}}>
          {['photo1.webp', 'photo2.webp'].map((s) => <Img key={s} src={staticFile(s)} style={{width: pw, height: ph, objectFit: 'cover', borderRadius: 18, display: 'block'}} />)}
          {ring('photos')}
        </div>
        <div style={{position: 'relative', background: '#efede6', borderRadius: 26, padding: L.vert ? '28px 30px' : '30px 40px', maxWidth: L.vert ? 952 : 1250, fontSize: fs, fontWeight: 600, color: '#222', lineHeight: 1.45, letterSpacing: -0.5, opacity: dimmed(['bubble', 'line1', 'line2'])}}>
          <div style={{position: 'relative', opacity: anyActive && vis('line2') && !vis('line1') && !vis('bubble') ? 0.35 : 1}}>{LINE1}{ring('line1', L.vert ? 'top' : 'left')}</div>
          <div style={{height: fs * 0.9}} />
          <div style={{position: 'relative', opacity: anyActive && vis('line1') && !vis('line2') && !vis('bubble') ? 0.35 : 1}}>{LINE2}{ring('line2', L.vert ? 'bottom' : 'left')}</div>
          {ring('bubble', L.vert ? 'top' : 'left')}
        </div>
      </div>
    </Card>
  );
};

// ---------- 4. 클로드가 한 일 (단계 목록 + 미리보기) ----------
const ROWS = [
  {t: '사진 읽기', s: '수강생 · 노트북 · 체계도 · 화이트보드'},
  {t: '대본 · 연출표', s: '35문장 · 장면 8개'},
  {t: '목소리 생성', s: 'Fish Audio 밝은 상철 1.15배 · 잘린 2문장 재생성'},
  {t: '가라오케 자막', s: '음성인식으로 단어마다 시점 측정'},
  {t: '모션그래픽 렌더', s: '카메라 · 강조 · 효과음 → 1920×1080'},
];
const SCRIPT_LINES = [
  ['#', '01 강의 현장, 사진 한 장'], ['', '첫 번째 사진은 저의 부동산 실무 강의 현장입니다.'], ['', '강의실을 가득 채운 수강생 모두가 노트북을 펴고 있죠.'],
  ['{', '"type": "hi", "kw": "노트북", "label": "수강생 전원 노트북"'], ['#', '02 공법의 신 작업실'], ['', "그 아래 큰 판이 바로 '12p 체계도'입니다."],
  ['{', '"type": "cam", "x": 935, "y": 410, "z": 1.6'], ['#', '03 건폐율과 용적률'], ['', '국토계획법이 정한 상한은 주거 500, 상업 1,500, 공업 400% 이하입니다.'],
];
const Preview: React.FC<{cur: number; at: number; w: number; h: number}> = ({cur, at, w, h}) => {
  const t = useT();
  const k = appear(t, at, 0.45);
  const wrap: React.CSSProperties = {position: 'absolute', inset: 0, opacity: k, transform: `scale(${0.96 + 0.04 * k})`, filter: `blur(${(1 - k) * 6}px)`};
  if (cur < 0) {
    return (
      <div style={{...wrap, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: '#151515', borderRadius: 18}}>
        <div style={{fontFamily: MONO, color: GREEN, fontSize: 26, letterSpacing: 3}}>CLAUDE OPUS 5.5</div>
        <div style={{color: '#fff', fontSize: 50, fontWeight: 900}}>작업 시작</div>
        <div style={{display: 'flex', gap: 14}}>{[0, 1, 2].map((i) => <div key={i} style={{width: 18, height: 18, borderRadius: 9, background: GREEN, opacity: 0.3 + 0.7 * Math.max(0, Math.sin(t * 5 - i * 0.9))}} />)}</div>
      </div>
    );
  }
  if (cur === 0) {
    const pw = (w - 16) / 2, ph = Math.min(h - 40, pw * 0.68);
    const tags = [[0, 0.38, 0.55, '수강생'], [0, 0.73, 0.85, '노트북'], [1, 0.46, 0.3, '12p 체계도'], [1, 0.86, 0.55, '화이트보드']] as const;
    const scan = ((t - at) / 2.2) % 1;
    return (
      <div style={{...wrap, display: 'flex', gap: 16, alignItems: 'center'}}>
        {['photo1.webp', 'photo2.webp'].map((s, i) => (
          <div key={s} style={{position: 'relative', width: pw, height: ph, borderRadius: 16, overflow: 'hidden'}}>
            <Img src={staticFile(s)} style={{width: pw, height: ph, objectFit: 'cover', display: 'block'}} />
            <div style={{position: 'absolute', left: 0, right: 0, top: `${scan * 100}%`, height: 4, background: GREEN, boxShadow: `0 0 24px 6px ${GREEN}`, opacity: 0.8}} />
            {tags.filter((g) => g[0] === i).map((g, j) => {
              const q = sp(t, at + 0.4 + (i * 2 + j) * 0.45, 11);
              return <div key={j} style={{position: 'absolute', left: `${g[1] * 100}%`, top: `${g[2] * 100}%`, transform: `translate(-50%,-50%) scale(${q})`}}><Pill fs={24}>{g[3]}</Pill></div>;
            })}
          </div>
        ))}
      </div>
    );
  }
  if (cur === 1) {
    return (
      <div style={{...wrap, background: '#151515', borderRadius: 18, padding: '26px 30px', boxSizing: 'border-box', fontFamily: MONO, fontSize: w > 900 ? 22 : 20, lineHeight: 1.75, overflow: 'hidden'}}>
        <div style={{color: GREY, marginBottom: 6}}>script.json — 대본 + 연출표</div>
        {SCRIPT_LINES.map((ln, i) => {
          const q = appear(t, at + 0.15 + i * 0.22, 0.25);
          const col = ln[0] === '#' ? GREEN : ln[0] === '{' ? '#9aa4b2' : '#f4f2ee';
          return <div key={i} style={{color: col, opacity: q, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: ln[0] === '#' ? 700 : 400}}>{ln[0] === '#' ? '## ' : ln[0] === '{' ? '  { ' : '  '}{ln[1]}{ln[0] === '{' ? ' }' : ''}</div>;
        })}
      </div>
    );
  }
  if (cur === 2) {
    const W = WAVE as number[]; const rev = appear(t, at + 0.1, 2.4);
    return (
      <div style={{...wrap, background: '#151515', borderRadius: 18, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 34px', boxSizing: 'border-box', gap: 24}}>
        <div style={{fontFamily: MONO, color: GREY, fontSize: 22}}>voice.wav — 밝은 상철 · 1.15배 · 138초</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 2, height: h * 0.42}}>
          {W.map((v, i) => <div key={i} style={{flex: 1, height: `${Math.max(3, v * 100)}%`, background: i / W.length < rev ? GREEN : '#3a3a3a', borderRadius: 2}} />)}
        </div>
        <div style={{display: 'flex', gap: 14, flexWrap: 'wrap'}}>
          {['✓ 35문장 생성', '✓ 말끝 잘림 검사', '↻ 잘린 2문장 재생성'].map((x, i) => <div key={x} style={{opacity: appear(t, at + 0.8 + i * 0.5, 0.3), background: i === 2 ? RED : '#262626', color: '#fff', fontWeight: 800, fontSize: 24, padding: '8px 18px', borderRadius: 999}}>{x}</div>)}
        </div>
      </div>
    );
  }
  const src = cur === 3 ? 'howto/f_24.3.jpg' : 'howto/f_58.7.jpg';
  const z = cur === 3 ? 1 + 0.55 * appear(t, at + 0.4, 1.2) : 1;
  return (
    <div style={{...wrap, borderRadius: 18, overflow: 'hidden', background: '#151515'}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: cur === 3 ? 'cover' : 'contain', transform: `scale(${z})`, transformOrigin: '50% 96%'}} />
      <div style={{position: 'absolute', left: 18, top: 16}}><Pill fs={24}>{cur === 3 ? '단어별 시점 → 가라오케 자막' : '1920×1080 · 30fps · 138초'}</Pill></div>
    </div>
  );
};
const PipelinePanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const rowAt = ROWS.map((_, n) => EV.find((e) => e.type === 'row' && e.n === n)?.at ?? 1e9);
  let cur = -1; rowAt.forEach((a, n) => { if (t >= a) cur = n; });
  const body = {w: L.card.w, h: L.card.h - CHROME};
  const prev = L.vert ? {x: 30, y: 30, w: body.w - 60, h: 520} : {x: 820, y: 60, w: body.w - 860, h: 560};
  const list = L.vert ? {x: 40, y: 590, w: body.w - 80, rh: 78} : {x: 44, y: 46, w: 740, rh: 120};
  return (
    <Card box={L.card} p={p} url="Claude Code — 클로드가 한 일 (사람 손 0%)">
      <div style={{position: 'absolute', left: list.x, top: list.y, width: list.w}}>
        {ROWS.map((r, n) => {
          const on = n <= cur, act = n === cur;
          const k = appear(t, rowAt[n], 0.35);
          return (
            <div key={n} style={{display: 'flex', alignItems: 'center', gap: 22, height: list.rh, borderBottom: n < ROWS.length - 1 ? '2px dashed #e5e2da' : 'none', opacity: 0.3 + 0.7 * k}}>
              <div style={{width: L.vert ? 52 : 62, height: L.vert ? 52 : 62, borderRadius: 40, flexShrink: 0, background: act ? GREEN : on ? INK : '#e5e2da', color: '#fff', fontSize: L.vert ? 28 : 32, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${act ? 1 + 0.08 * Math.sin((t - rowAt[n]) * 5) * Math.max(0, 1 - (t - rowAt[n]) / 2) : 1})`}}>{on && !act ? '✓' : n + 1}</div>
              <div style={{minWidth: 0}}>
                <div style={{fontSize: L.vert ? 34 : 40, fontWeight: 900, color: act ? INK : on ? '#333' : '#999', letterSpacing: -1}}>{r.t}</div>
                <div style={{fontSize: L.vert ? 21 : 23, fontWeight: 600, color: act ? GREEN : GREY, marginTop: 2, whiteSpace: 'nowrap'}}>{r.s}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: prev.x, top: prev.y, width: prev.w, height: prev.h}}>
        <Preview key={cur} cur={cur} at={cur < 0 ? p.at : rowAt[cur]} w={prev.w} h={prev.h} />
      </div>
    </Card>
  );
};

// ---------- 5. 이유 목록 ----------
const REASONS = ['틀린 내용은 바로잡는다', '스스로 검수한다', '사람 손은 딱 3가지'];
const ReasonPanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const ss = T.sentences.filter((s) => s.scene === p.scene);
  const hiAt = p.n === 0 ? (ss[1]?.s ?? p.at) : p.at + 0.2;
  const hk = appear(t, hiAt, 0.4);
  return (
    <Free p={p}>
      <div style={{position: 'absolute', left: L.vert ? 40 : 300, right: L.vert ? 40 : 300, top: L.vert ? 330 : 220, background: '#fff', borderRadius: 30, padding: L.vert ? '44px 44px' : '46px 70px', boxShadow: '0 30px 80px rgba(40,32,20,.2)'}}>
        <div style={{fontFamily: MONO, fontSize: 22, color: GREY, letterSpacing: 4}}>WHY CLAUDE — 3가지 이유</div>
        {REASONS.map((r, i) => {
          const k = appear(t, p.at + 0.25 + i * 0.28, 0.4);
          const act = i === p.n && hk > 0;
          const done = p.n !== undefined && i < p.n;
          return (
            <div key={r} style={{display: 'flex', alignItems: 'center', gap: 28, height: L.vert ? 150 : 128, borderBottom: i < 2 ? '2px dashed #e5e2da' : 'none', opacity: k * (act ? 1 : done ? 0.55 : 0.4 + 0.6 * (1 - hk)), transform: `translateX(${(1 - k) * -40}px) scale(${act ? 1 + 0.04 * hk : 1})`, transformOrigin: 'left center'}}>
              <div style={{width: 78, height: 78, borderRadius: 40, background: act ? GREEN : done ? INK : '#e5e2da', color: '#fff', fontSize: 42, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>{done ? '✓' : i + 1}</div>
              <div style={{fontSize: L.vert ? 54 : 60, fontWeight: 900, color: act ? INK : '#555', letterSpacing: -2}}>{r}</div>
            </div>
          );
        })}
      </div>
    </Free>
  );
};

// ---------- 6. 사진 카드(카메라 + 강조) ----------
type Cam = {x: number; y: number; z: number};
const ShotPanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const img = T.images[p.img!];
  const box = L.card; const VW = box.w, VH = box.h - CHROME;
  const cams = evOf('cam', p.scene).map((c) => (L.vert && c.v ? {...c, ...c.v} : c)).sort((a, b) => a.at - b.at);
  let c: Cam = cams.length ? {x: cams[0].x!, y: cams[0].y!, z: cams[0].z!} : {x: img.w / 2, y: img.h / 2, z: 1};
  c = {...c, z: c.z * (1 + 0.03 * Math.min(1, (t - p.at) / 5))};
  const s0 = Math.max(VW / img.w, VH / img.h), S1 = s0 * c.z;
  const tx = Math.min(0, Math.max(VW - img.w * S1, VW / 2 - c.x * S1));
  const ty = Math.min(0, Math.max(VH - img.h * S1, VH / 2 - c.y * S1));
  const his = evOf('hi', p.scene).filter((h) => h.box && t >= h.at - 0.05 && t < h.end + 0.3);
  return (
    <Card box={box} p={p} url={img.url}>
      <Img src={staticFile(img.src)} style={{position: 'absolute', left: tx, top: ty, width: img.w * S1, height: img.h * S1}} />
      {his.map((h, i) => {
        const x = tx + h.box![0] * S1, y = ty + h.box![1] * S1, w = h.box![2] * S1, hh = h.box![3] * S1;
        const k = sp(t, h.at - 0.05, 12); const out = interpolate(t, [h.end, h.end + 0.3], [1, 0], clamp);
        const col = h.color === 'red' ? RED : GREEN;
        return (
          <React.Fragment key={i}>
            <div style={{position: 'absolute', left: x - 10, top: y - 10, width: w + 20, height: hh + 20, borderRadius: 14, boxShadow: `0 0 0 9999px rgba(20,16,10,${0.34 * Math.min(1, k) * out})`}} />
            <div style={{position: 'absolute', left: x - 10, top: y - 10, width: w + 20, height: hh + 20, border: `6px solid ${col}`, borderRadius: 14, boxShadow: `0 0 30px ${col}`, opacity: Math.min(1, k * 1.5) * out, transform: `scale(${0.75 + 0.25 * k})`}}>
              {h.label && <Pill col={col} style={{position: 'absolute', right: w + 40, top: hh / 2 - 18}}>{h.label}</Pill>}
            </div>
          </React.Fragment>
        );
      })}
    </Card>
  );
};

// ---------- 7. 정지 화면 검수 ----------
const GridPanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const body = {w: L.card.w, h: L.card.h - CHROME};
  const cols = 3, gap = 14;
  const gw = L.vert ? body.w - 60 : 1160;
  const cw = (gw - gap * (cols - 1)) / cols, ch = cw * 9 / 16;
  const n = Math.round(interpolate(t, [p.at + 0.3, p.at + 2.6], [0, 30], clamp));
  return (
    <Card box={L.card} p={p} url="stills/ — 렌더 전에 뽑아 본 정지 화면">
      <div style={{position: 'absolute', inset: 0, background: '#f4f2ee'}} />
      <div style={{position: 'absolute', left: 30, top: L.vert ? 36 : (body.h - (ch * 3 + gap * 2)) / 2, width: gw, display: 'flex', flexWrap: 'wrap', gap}}>
        {Array.from({length: 9}, (_, i) => {
          const q = sp(t, p.at + 0.2 + i * 0.16, 12);
          return <Img key={i} src={staticFile(`howto/sheet${i + 1}.jpg`)} style={{width: cw, height: ch, objectFit: 'cover', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,.15)', opacity: Math.min(1, q * 1.4), transform: `scale(${0.7 + 0.3 * q})`}} />;
        })}
      </div>
      <div style={{position: 'absolute', ...(L.vert ? {left: 0, right: 0, top: 36 + ch * 3 + gap * 2 + 50, textAlign: 'center' as const} : {left: gw + 70, right: 30, top: 0, bottom: 0, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center'})}}>
        <div style={{fontFamily: MONO, fontSize: 22, color: GREY, letterSpacing: 3}}>정지 화면 검수</div>
        <div style={{fontSize: L.vert ? 170 : 150, fontWeight: 900, color: INK, letterSpacing: -6, lineHeight: 1.05}}>{n}<span style={{color: GREEN}}>{n >= 30 ? '+' : ''}</span><span style={{fontSize: L.vert ? 70 : 60}}>장</span></div>
        <div style={{fontSize: L.vert ? 38 : 34, fontWeight: 800, color: '#444', marginTop: 8}}>강조 위치 · 글자 겹침 확인</div>
      </div>
    </Card>
  );
};

// ---------- 8. 수정 전 / 후 ----------
const ComparePanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const ak = appear(t, mark('after'), 0.5);
  const items = [{src: 'howto/before.png', lab: '수정 전 — 막대가 먼저 뜸', col: RED}, {src: 'howto/after.png', lab: '수정 후 — 말할 때 뜸', col: GREEN}];
  const w = L.vert ? 760 : 860, h = w * 9 / 16;
  return (
    <Free p={p}>
      <div style={{position: 'absolute', left: 0, right: 0, top: L.vert ? 350 : 300, display: 'flex', flexDirection: L.vert ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: L.vert ? 90 : 40}}>
        {items.map((it, i) => {
          const q = sp(t, p.at + 0.15 + i * 0.35, 13);
          const focus = i === 1 ? ak : 1 - 0.5 * ak;
          return (
            <div key={i} style={{position: 'relative', opacity: Math.min(1, q * 1.4) * (0.45 + 0.55 * focus), transform: `translateY(${(1 - q) * 50}px) scale(${i === 1 ? 1 + 0.03 * ak : 1})`}}>
              <Pill col={it.col} fs={L.vert ? 32 : 30} style={{position: 'absolute', left: 0, top: -58, zIndex: 3}}>{it.lab}</Pill>
              <Img src={staticFile(it.src)} style={{width: w, height: h, borderRadius: 16, display: 'block', boxShadow: i === 1 && ak > 0 ? `0 0 0 6px ${GREEN}, 0 0 40px ${GREEN}` : '0 20px 50px rgba(0,0,0,.2)'}} />
            </div>
          );
        })}
      </div>
    </Free>
  );
};

// ---------- 9. 사람이 한 일 ----------
const ChipsPanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const at = (n: number) => EV.find((e) => e.type === 'chip' && e.n === n)?.at ?? 1e9;
  const human = ['📷 사진 2장', '💬 말 2줄', '🔑 목소리 키 1번'];
  const auto = ['사진 분석', '대본', '법령 확인', '목소리', '자막 시점', '모션그래픽', '렌더', '검수'];
  const k3 = appear(t, Math.min(at(3), at(2) + 0.45), 0.5);
  return (
    <Free p={p}>
      <div style={{position: 'absolute', left: 0, right: 0, top: L.vert ? 330 : 270, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{fontFamily: MONO, fontSize: 24, color: GREY, letterSpacing: 4}}>③ 사람이 한 일은 이것뿐</div>
        <div style={{display: 'flex', flexDirection: L.vert ? 'column' : 'row', gap: L.vert ? 26 : 26, marginTop: 34, alignItems: 'center'}}>
          {human.map((h, i) => {
            const q = sp(t, at(i), 11);
            return <div key={h} style={{background: INK, color: '#fff', fontSize: L.vert ? 62 : 58, fontWeight: 900, padding: '20px 40px', borderRadius: 999, transform: `scale(${q})`, opacity: Math.min(1, q * 1.5), letterSpacing: -1.5, whiteSpace: 'nowrap'}}>{h}</div>;
          })}
        </div>
        <div style={{marginTop: L.vert ? 60 : 56, opacity: k3, transform: `translateY(${(1 - k3) * 30}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <div style={{fontSize: L.vert ? 66 : 70, fontWeight: 900, color: INK, letterSpacing: -2}}>나머지는 <span style={{color: GREEN}}>전부 클로드</span></div>
          <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 26, maxWidth: L.vert ? 960 : 1400}}>
            {auto.map((a, i) => <div key={a} style={{opacity: appear(t, Math.min(at(3), at(2) + 0.45) + 0.25 + i * 0.08, 0.3), background: '#fff', border: `3px solid ${GREEN}`, color: INK, fontSize: L.vert ? 34 : 32, fontWeight: 800, padding: '8px 22px', borderRadius: 999}}>{a}</div>)}
          </div>
        </div>
      </div>
    </Free>
  );
};

// ---------- 10. 따라 하는 방법 ----------
const HOW = [
  {t: 'Opus 5.5 선택 + 모션그래픽 스킬 준비', s: 'Claude 앱에서 모델과 스킬 확인'},
  {t: 'Fish Audio API 키 → 환경 설정에 등록', s: '채팅창에 키를 붙이지 않기', warn: true},
  {t: '사진 올리고 두 줄 입력', s: '무엇을 만들지 + 어떤 목소리로'},
  {t: '완성 영상 파일 받기', s: '대본 · 목소리 · 자막 · 렌더까지 자동'},
];
const HowPanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const at = (n: number) => EV.find((e) => e.type === 'step' && e.n === n)?.at ?? 1e9;
  return (
    <Free p={p}>
      <div style={{position: 'absolute', left: L.vert ? 40 : 230, right: L.vert ? 40 : 230, top: L.vert ? 300 : 205, background: '#fff', borderRadius: 30, padding: L.vert ? '36px 38px' : '34px 60px', boxShadow: '0 30px 80px rgba(40,32,20,.2)'}}>
        <div style={{fontFamily: MONO, fontSize: 22, color: GREY, letterSpacing: 4}}>HOW TO — 4단계</div>
        {HOW.map((h, i) => {
          const k = appear(t, at(i), 0.4);
          const done = t >= (i < 3 ? at(i + 1) : 1e9);
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 26, height: L.vert ? 200 : 136, borderBottom: i < 3 ? '2px dashed #e5e2da' : 'none', opacity: 0.25 + 0.75 * k}}>
              <div style={{width: 70, height: 70, borderRadius: 40, flexShrink: 0, background: k > 0.5 ? (done ? INK : GREEN) : '#e5e2da', color: '#fff', fontSize: 38, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.8 + 0.2 * k})`}}>{done ? '✓' : i + 1}</div>
              <div>
                <div style={{fontSize: L.vert ? 44 : 46, fontWeight: 900, color: INK, letterSpacing: -1.5, lineHeight: 1.2}}>{h.t}</div>
                <div style={{fontSize: L.vert ? 28 : 26, fontWeight: 700, color: h.warn ? RED : GREY, marginTop: 6}}>{h.warn ? '⚠ ' : ''}{h.s}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Free>
  );
};

// ---------- 11. 마무리 ----------
const OutroPanel: React.FC<{p: Panel}> = ({p}) => {
  const t = useT(); const L = useL();
  const ss = T.sentences.filter((s) => s.scene === p.scene);
  const a = sp(t, p.at + 0.1, 15), b = sp(t, p.at + 0.45, 15), c = appear(t, ss[1]?.s ?? p.at + 3, 0.5);
  const big = L.vert ? 116 : 140;
  return (
    <Free p={p}>
      <div style={{position: 'absolute', left: 0, right: 0, top: L.vert ? 420 : 250, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{display: 'flex', gap: L.vert ? 20 : 30, marginBottom: 46}}>
          {['photo1.webp', 'photo2.webp'].map((s, i) => {
            const q = sp(t, p.at + 0.2 + i * 0.2, 14);
            return <div key={s} style={{background: '#fff', padding: 10, borderRadius: 10, boxShadow: '0 20px 50px rgba(40,32,20,.22)', transform: `translateY(${(1 - q) * 200}px) rotate(${(i ? 4 : -5) * q}deg)`, opacity: Math.min(1, q * 1.4)}}><Img src={staticFile(s)} style={{width: L.vert ? 420 : 300, height: L.vert ? 290 : 205, objectFit: 'cover', display: 'block', borderRadius: 4}} /></div>;
          })}
        </div>
        <div style={{fontSize: big, fontWeight: 900, color: INK, letterSpacing: interpolate(a, [0, 1], [20, -5]), opacity: Math.min(1, a * 1.4), filter: `blur(${(1 - Math.min(1, a)) * 14}px)`, lineHeight: 1.05, whiteSpace: 'nowrap'}}>말 두 줄이면</div>
        <div style={{fontSize: big, fontWeight: 900, color: GREEN, letterSpacing: interpolate(b, [0, 1], [24, -5]), opacity: Math.min(1, b * 1.4), filter: `blur(${(1 - Math.min(1, b)) * 16}px)`, transform: `translateX(${(1 - b) * 100}px)`, lineHeight: 1.1, whiteSpace: 'nowrap'}}>영상 한 편</div>
        <div style={{display: 'flex', gap: 16, marginTop: 44, opacity: c, transform: `translateY(${(1 - c) * 30}px)`, flexWrap: 'wrap', justifyContent: 'center', maxWidth: L.vert ? 960 : 1600}}>
          {['영리치TV', '누구나 사진 2장이면 OK', '편집 프로그램 0%'].map((w, i) => <div key={w} style={{background: i === 2 ? GREEN : INK, color: '#fff', fontSize: L.vert ? 38 : 34, fontWeight: 800, padding: '12px 28px', borderRadius: 999}}>{w}</div>)}
        </div>
      </div>
    </Free>
  );
};

const FacePip: React.FC = () => {
  const frame = useCurrentFrame(); const L = useL();
  const k = spring({frame: Math.max(0, frame - 8), fps: FPS, config: {damping: 13}});
  const s = L.face.size;
  return (
    <div style={{position: 'absolute', right: L.face.right, top: L.face.top, width: s, height: s, transform: `scale(${k})`, filter: 'drop-shadow(0 8px 16px rgba(40,32,20,.28))', zIndex: 100}}>
      <Loop durationInFrames={Math.round(11.6 * FPS)}>
        <OffthreadVideo src={staticFile('face.webm')} transparent muted style={{width: s, height: s}} />
      </Loop>
    </div>
  );
};

const PANEL_C: Record<string, React.FC<{p: Panel}>> = {
  title: TitlePanel, clipA: ClipPanel, clipV: ClipPanel, chat: ChatPanel, pipeline: PipelinePanel, reason: ReasonPanel,
  shot: ShotPanel, grid: GridPanel, compare: ComparePanel, chips: ChipsPanel, howto: HowPanel, outro: OutroPanel,
};
const Panels: React.FC = () => {
  const t = useT();
  return <>{PANELS.map((p, i) => {
    const C = PANEL_C[p.type];
    // 영상 클립은 Sequence 안에서 재생되므로 항상 마운트, 나머지는 보이는 동안만
    if (p.type !== 'clipA' && p.type !== 'clipV' && (t < p.at - 0.01 || t >= p.end)) return null;
    if ((p.type === 'clipA' || p.type === 'clipV') && (t < p.at - 0.01 || t >= p.end)) return null;
    return C ? <C key={i} p={p} /> : null;
  })}</>;
};

const Main: React.FC<{lay: Lay}> = ({lay}) => {
  const clicks = EV.filter((e) => ['hi', 'row', 'chip', 'step'].includes(e.type)).map((e) => e.at).concat([mark('zero')]);
  const whooshes = PANELS.slice(1).map((p) => p.at);
  return (
    <LayCtx.Provider value={lay}>
      <AbsoluteFill style={{backgroundColor: PAPER}}>
        <Bg />
        <Audio src={staticFile('voice2.wav')} />
        {clicks.map((c, i) => <Sequence key={'c' + i} from={f(c)} durationInFrames={8}><Audio src={staticFile('click.wav')} volume={0.7} /></Sequence>)}
        {whooshes.map((c, i) => <Sequence key={'w' + i} from={Math.max(0, f(c) - 4)} durationInFrames={20}><Audio src={staticFile('whoosh.wav')} volume={0.22} /></Sequence>)}
        <Panels />
        <Header />
        <FacePip />
        <Subtitle />
      </AbsoluteFill>
    </LayCtx.Provider>
  );
};
const Main169: React.FC = () => <Main lay={L169} />;
const Main916: React.FC = () => <Main lay={L916} />;

const Root: React.FC = () => (
  <>
    <Composition id="HowTo169" component={Main169} durationInFrames={Math.round(DUR * FPS)} fps={FPS} width={1920} height={1080} />
    <Composition id="HowTo916" component={Main916} durationInFrames={Math.round(DUR * FPS)} fps={FPS} width={1080} height={1920} />
  </>
);
registerRoot(Root);
