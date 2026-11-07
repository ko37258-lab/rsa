// 고상철의 공인중개사 합격 가져가! — 세로 쇼츠(1080x1920) 모션그래픽 편집
// 비트: 128.57BPM, 1박 = 14프레임(30fps). 클립A 8박 → 클립B 8박 → 엔딩 8박 = 336프레임(11.2초)
import React from 'react';
import {
  AbsoluteFill, Audio, Composition, Img, OffthreadVideo, Sequence, registerRoot, staticFile,
  useCurrentFrame, interpolate, spring, Easing, delayRender, continueRender, random,
} from 'remotion';

const FPS = 30;
const W = 1080;
const H = 1920;
const BEAT = 14;
const DUR = BEAT * 24; // 336
const B = (b: number) => Math.round(b * BEAT);
const FONT = "'Pretendard','Noto Sans CJK KR','Malgun Gothic',sans-serif";
const YELLOW = '#FFE02E';
const RED = '#E5322D';
const WHITE = '#FFFFFF';
const INK = '#0B0B0B';
const SHIFT = 250; // 영상을 아래로 내려 상단 타이틀 띠 확보 (하단 털모자·책상 부분이 잘려 나감)
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const ez = Easing.bezier(0.22, 1, 0.36, 1);

// Pretendard 로드
if (typeof window !== 'undefined' && !(window as any).__ptd) {
  (window as any).__ptd = true;
  const h = delayRender('Pretendard');
  const ws: [string, string][] = [['Medium', '500'], ['SemiBold', '600'], ['Bold', '700'], ['ExtraBold', '800'], ['Black', '900']];
  Promise.all(ws.map(([n, w]) => new FontFace('Pretendard', `url(${staticFile(`fonts/Pretendard-${n}.otf`)})`, {weight: w}).load().then((ff) => { (document as any).fonts.add(ff); })))
    .then(() => continueRender(h)).catch(() => continueRender(h));
}

// ---------- 공용 ----------
const pop = (f: number, at: number, cfg = {damping: 11, stiffness: 230, mass: 0.6}) =>
  spring({frame: Math.max(0, f - at), fps: FPS, config: cfg});

// 화면 흔들림: 지정 프레임 이후 n프레임 동안 감쇠
const SHAKES: [number, number, number][] = [[B(1), 9, 14], [B(14), 10, 16], [B(17), 8, 12], [B(22), 12, 24]];
const shakeAt = (f: number) => {
  let x = 0, y = 0, r = 0;
  for (const [at, n, amp] of SHAKES) {
    const d = f - at;
    if (d >= 0 && d < n) {
      const k = (1 - d / n) ** 2 * amp;
      x += (random(`sx${at}-${d}`) - 0.5) * 2 * k;
      y += (random(`sy${at}-${d}`) - 0.5) * 2 * k;
      r += (random(`sr${at}-${d}`) - 0.5) * 0.08 * k;
    }
  }
  return {x, y, r};
};

// 두 겹(외곽선 + 채움)으로 그리는 굵은 글씨
type Part = {t: string; c?: string; strike?: boolean};
const Outline: React.FC<{parts: Part[]; size: number; stroke?: number; f: number; at: number; stagger?: number; letter?: number}> = ({parts, size, stroke = 16, f, at, stagger = 1.2, letter = -3}) => {
  let idx = 0;
  const chars: {ch: string; c: string; i: number; strike?: boolean}[] = [];
  for (const p of parts) for (const ch of Array.from(p.t)) chars.push({ch, c: p.c ?? WHITE, i: idx++, strike: p.strike});
  return (
    <div style={{display: 'flex', justifyContent: 'center', whiteSpace: 'pre', fontFamily: FONT, fontWeight: 900, fontSize: size, lineHeight: 1.05, letterSpacing: letter}}>
      {chars.map(({ch, c, i, strike}) => {
        const s = pop(f, at + i * stagger);
        const sb = Math.min(1, s);
        return (
          <span key={i} style={{position: 'relative', display: 'inline-block', transform: `translateY(${(1 - s) * 70}px) scale(${0.35 + 0.65 * s}) rotate(${(1 - s) * -10}deg)`, filter: `blur(${(1 - sb) * 10}px)`, opacity: Math.min(1, s * 2)}}>
            <span style={{position: 'absolute', left: 0, top: 0, color: INK, WebkitTextStroke: `${stroke}px ${INK}`}}>{ch}</span>
            <span style={{position: 'relative', color: c}}>{ch}</span>
            {strike && <Strike f={f} at={at + 11} size={size} />}
          </span>
        );
      })}
    </div>
  );
};

// 'L' 위에 빨간 X
const Strike: React.FC<{f: number; at: number; size: number}> = ({f, at, size}) => {
  const p1 = interpolate(f, [at, at + 4], [0, 1], {...clamp, easing: ez});
  const p2 = interpolate(f, [at + 3, at + 7], [0, 1], {...clamp, easing: ez});
  const L = size * 1.0;
  return (
    <svg width={L} height={L} viewBox="0 0 100 100" style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', overflow: 'visible'}}>
      <line x1="8" y1="8" x2={8 + 84 * p1} y2={8 + 84 * p1} stroke={RED} strokeWidth="8" strokeLinecap="round" opacity="0.92" />
      <line x1="92" y1="8" x2={92 - 84 * p2} y2={8 + 84 * p2} stroke={RED} strokeWidth="8" strokeLinecap="round" opacity="0.92" />
    </svg>
  );
};

// 방사형 집중선
const Burst: React.FC<{f: number; at: number; cx: number; cy: number; color?: string; r0?: number; r1?: number; n?: number; life?: number}> = ({f, at, cx, cy, color = YELLOW, r0 = 170, r1 = 520, n = 18, life = 16}) => {
  const d = f - at;
  if (d < 0 || d > life) return null;
  const p = interpolate(d, [0, life], [0, 1], {...clamp, easing: ez});
  const op = interpolate(d, [0, 3, life], [0, 1, 0], clamp);
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity: op}}>
      {Array.from({length: n}, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.17;
        const ra = r0 + (r1 - r0) * p * 0.55, rb = r0 + (r1 - r0) * p;
        return <line key={i} x1={cx + Math.cos(a) * ra} y1={cy + Math.sin(a) * ra * 0.75} x2={cx + Math.cos(a) * rb} y2={cy + Math.sin(a) * rb * 0.75} stroke={color} strokeWidth={i % 2 ? 7 : 12} strokeLinecap="round" />;
      })}
    </svg>
  );
};

// 반짝이
const Sparkles: React.FC<{f: number; at: number; cx: number; cy: number; spread?: number; n?: number}> = ({f, at, cx, cy, spread = 420, n = 9}) => {
  const d = f - at;
  if (d < 0 || d > 22) return null;
  return (
    <>
      {Array.from({length: n}, (_, i) => {
        const a = random(`a${at}${i}`) * Math.PI * 2;
        const dist = (0.45 + random(`d${at}${i}`) * 0.55) * spread;
        const p = interpolate(d, [0, 22], [0, 1], {...clamp, easing: ez});
        const s = interpolate(d, [0, 5, 22], [0, 1, 0], clamp) * (22 + random(`s${at}${i}`) * 26);
        const x = cx + Math.cos(a) * dist * p, y = cy + Math.sin(a) * dist * p * 0.7;
        return (
          <svg key={i} width={s * 2} height={s * 2} viewBox="-10 -10 20 20" style={{position: 'absolute', left: x - s, top: y - s, transform: `rotate(${d * 6}deg)`}}>
            <path d="M0,-10 C1.2,-1.2 1.2,-1.2 10,0 C1.2,1.2 1.2,1.2 0,10 C-1.2,1.2 -1.2,1.2 -10,0 C-1.2,-1.2 -1.2,-1.2 0,-10Z" fill={i % 3 === 0 ? WHITE : YELLOW} />
          </svg>
        );
      })}
    </>
  );
};

const Flash: React.FC<{f: number; at: number; len?: number}> = ({f, at, len = 7}) => {
  const d = f - at;
  if (d < -1 || d > len) return null;
  const op = interpolate(d, [-1, 0, len], [0.35, 0.95, 0], clamp);
  return <AbsoluteFill style={{background: WHITE, opacity: op}} />;
};

// ---------- 영상 레이어 ----------
const kickPulse = (f: number) => {
  const b = Math.floor(f / BEAT);
  if (b === 14 || b === 15) return 0; // 브레이크 구간
  const d = f - b * BEAT;
  return 0.02 * Math.exp(-d / 3);
};

const VideoLayer: React.FC = () => {
  const f = useCurrentFrame();
  if (f >= B(16)) return null;
  const local = f < B(8) ? f : f - B(8);
  const punch = interpolate(local, [0, 9], [0.1, 0], {...clamp, easing: ez});
  const blurIn = interpolate(local, [0, 5], [8, 0], clamp);
  // 클립 끝 3프레임: 확대 + 흐림(휩 전환)
  const toEnd = (f < B(8) ? B(8) : B(16)) - f;
  const whip = toEnd <= 3 ? (4 - toEnd) / 3 : 0;
  const sc = 1 + punch + kickPulse(f) + whip * 0.08;
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: INK}}>
      <div style={{position: 'absolute', left: 0, top: SHIFT, width: W, height: H, transform: `scale(${sc})`, transformOrigin: '50% 40%', filter: `blur(${blurIn + whip * 6}px)`}}>
        <Sequence durationInFrames={B(8)} layout="none">
          <OffthreadVideo src={staticFile('a.mp4')} muted style={{width: W, height: H}} />
        </Sequence>
        <Sequence from={B(8)} durationInFrames={B(8)} layout="none">
          <OffthreadVideo src={staticFile('b.mp4')} muted style={{width: W, height: H}} />
        </Sequence>
      </div>
      {/* 상단 띠 + 하단 그라데이션 */}
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: SHIFT, background: INK}} />
      <div style={{position: 'absolute', left: 0, top: SHIFT - 1, width: W, height: 200, background: 'linear-gradient(180deg, rgba(11,11,11,1) 0%, rgba(11,11,11,.55) 45%, rgba(11,11,11,0) 100%)'}} />
      <div style={{position: 'absolute', left: 0, top: 1150, width: W, height: H - 1150, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.45) 40%, rgba(0,0,0,.78) 100%)'}} />
    </AbsoluteFill>
  );
};

// ---------- 상단 고정 타이틀 ----------
const TopTitle: React.FC = () => {
  const f = useCurrentFrame();
  if (f >= B(16) + 8) return null;
  const out = interpolate(f, [B(16) - 2, B(16) + 6], [0, 1], {...clamp, easing: ez});
  const s2 = pop(f, B(1), {damping: 9, stiffness: 260, mass: 0.7});
  const beatPulse = f > B(2) ? 0.035 * Math.exp(-((f - B(1)) % (BEAT * 2)) / 4) : 0;
  const words1 = ['고상철의', '공인중개사'];
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: W, height: 420, transform: `translateY(${-out * 120}px)`, opacity: 1 - out, filter: `blur(${out * 10}px)`}}>
      {/* 1줄: 고상철의 공인중개사 */}
      <div style={{position: 'absolute', left: 0, top: 70, width: W, display: 'flex', justifyContent: 'center', gap: 22, fontFamily: FONT, fontWeight: 900, fontSize: 78, color: WHITE, letterSpacing: -2}}>
        {words1.map((w, i) => {
          const s = pop(f, i * 4, {damping: 13, stiffness: 200, mass: 0.6});
          return <span key={w} style={{display: 'inline-block', transform: `translateY(${(1 - s) * -70}px)`, filter: `blur(${(1 - Math.min(1, s)) * 12}px)`, opacity: Math.min(1, s * 1.6), letterSpacing: interpolate(Math.min(1, s), [0, 1], [16, -2])}}>{w}</span>;
        })}
      </div>
      {/* 2줄: 합격 가져가! (쾅) */}
      <div style={{position: 'absolute', left: 0, top: 160, width: W, display: 'flex', justifyContent: 'center', fontFamily: FONT, fontWeight: 900, fontSize: 136, letterSpacing: -5, whiteSpace: 'pre', transform: `scale(${(2.3 - 1.3 * s2) * (1 + beatPulse)}) rotate(${(1 - Math.min(1, s2)) * -6 - 1.5}deg)`, opacity: f < B(1) ? 0 : Math.min(1, s2 * 2.5), filter: `blur(${(1 - Math.min(1, s2)) * 14}px)`}}>
        <span style={{position: 'relative'}}>
          <span style={{position: 'absolute', left: 0, top: 0, color: RED, transform: 'translate(8px, 8px)', WebkitTextStroke: `10px ${RED}`}}>합격 가져가!</span>
          <span style={{position: 'relative', color: YELLOW, WebkitTextStroke: `2px ${YELLOW}`}}>합격 가져가!</span>
        </span>
      </div>
    </div>
  );
};

// ---------- 하단 키네틱 단어 ----------
type Cue = {from: number; to: number; parts: Part[]; size: number; burst?: boolean};
const CUES: Cue[] = [
  {from: 2, to: 4, size: 132, parts: [{t: '공인중개사'}]},
  {from: 4, to: 6, size: 118, parts: [{t: '합격', c: YELLOW}, {t: '하고 싶어?'}]},
  {from: 6, to: 8, size: 128, parts: [{t: '그냥 '}, {t: '가져가~!', c: YELLOW}]},
  {from: 8.15, to: 10, size: 140, parts: [{t: '공법의 신', c: YELLOW}]},
  {from: 10, to: 12, size: 118, parts: [{t: '28년', c: YELLOW}, {t: ' 적중 노하우'}]},
  {from: 12, to: 14, size: 140, parts: [{t: 'L', strike: true}, {t: ' 말고'}]},
  {from: 14, to: 16, size: 140, parts: [{t: '합격', c: YELLOW}, {t: ' 가져가!'}], burst: true},
];
const CY = 1400; // 하단 단어 중심선

const BottomWords: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      {CUES.map((c, i) => {
        const a = B(c.from), z = B(c.to);
        if (f < a || f >= z) return null;
        const exit = interpolate(f, [z - 3, z], [0, 1], clamp);
        const sub = i === 3; // '공법의 신' 위에 작은 설명
        return (
          <React.Fragment key={i}>
            {c.burst && <Burst f={f} at={a} cx={W / 2} cy={CY} r0={260} r1={640} />}
            {c.burst && <Sparkles f={f} at={a + 2} cx={W / 2} cy={CY} />}
            <div style={{position: 'absolute', left: 60, right: 60, top: CY - c.size * 0.62, transform: `scale(${1 + exit * 0.18}) rotate(-2deg)`, opacity: 1 - exit, filter: `blur(${exit * 8}px) drop-shadow(0 10px 0 rgba(0,0,0,.35))`}}>
              {sub && (
                <div style={{position: 'absolute', left: 0, right: 0, top: -78, display: 'flex', justifyContent: 'center'}}>
                  <span style={{fontFamily: FONT, fontWeight: 800, fontSize: 40, color: INK, background: WHITE, padding: '6px 22px', borderRadius: 999, transform: `scale(${pop(f, a + 6)})`, letterSpacing: -1}}>부동산공법 고상철 교수</span>
                </div>
              )}
              <Outline parts={c.parts} size={c.size} f={f} at={a} />
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------- 엔딩 카드 ----------
const CARD = {w: 792, top: 525, cropTop: 250, cropH: 1200};
const Stamp: React.FC<{f: number; at: number}> = ({f, at}) => {
  const d = f - at;
  if (d < 0) return null;
  const s = interpolate(d, [0, 5], [3.2, 1], {...clamp, easing: Easing.in(Easing.quad)});
  const op = interpolate(d, [0, 2], [0, 1], clamp);
  const size = 370;
  return (
    <div style={{position: 'absolute', left: 640, top: 1170, width: size, height: size, transform: `scale(${s}) rotate(-14deg)`, opacity: op * 0.96, filter: 'drop-shadow(0 0 2px rgba(255,255,255,.55)) drop-shadow(0 6px 14px rgba(0,0,0,.35))'}}>
      <svg width={size} height={size} viewBox="0 0 200 200">
        <defs>
          <filter id="ink" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="9" result="n2" />
            <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.85" result="mask" />
            <feComposite in="d" in2="mask" operator="in" />
          </filter>
        </defs>
        <g filter="url(#ink)" fill="none" stroke={RED}>
          <circle cx="100" cy="100" r="92" strokeWidth="9" />
          <circle cx="100" cy="100" r="78" strokeWidth="3.5" />
          <text x="100" y="66" textAnchor="middle" fill={RED} stroke="none" fontFamily={FONT} fontWeight={800} fontSize="20" letterSpacing="2">공인중개사</text>
          <text x="100" y="128" textAnchor="middle" fill={RED} stroke="none" fontFamily={FONT} fontWeight={900} fontSize="66" letterSpacing="-2">합격</text>
          <line x1="44" y1="146" x2="156" y2="146" strokeWidth="3.5" />
          <text x="100" y="168" textAnchor="middle" fill={RED} stroke="none" fontFamily={FONT} fontWeight={800} fontSize="18">공법의 신</text>
        </g>
      </svg>
    </div>
  );
};

const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const S0 = B(16);
  if (f < S0) return null;
  const lf = f - S0;
  const bgScale = interpolate(lf, [0, B(8)], [1.12, 1.22], clamp);
  const cardIn = pop(f, S0, {damping: 13, stiffness: 160, mass: 0.8});
  const kb = interpolate(lf, [0, B(8)], [1.0, 1.08], clamp);
  const k = CARD.w / W;
  const cardH = Math.round(CARD.cropH * k);
  const chips = ['#공법의신', '#28년강의', '#공인중개사'];
  const sHap = pop(f, B(17), {damping: 9, stiffness: 260, mass: 0.7});
  const sGa = pop(f, B(18), {damping: 9, stiffness: 260, mass: 0.7});
  const pulse = f > B(19) ? 0.03 * Math.exp(-((f - B(19)) % (BEAT * 2)) / 4) : 0;
  return (
    <AbsoluteFill>
      {/* 배경: 흐린 정지화면 */}
      <AbsoluteFill style={{overflow: 'hidden', background: INK}}>
        <Img src={staticFile('freeze.png')} style={{width: W, height: H, transform: `scale(${bgScale})`, filter: 'blur(26px) brightness(0.42) saturate(1.2)'}} />
      </AbsoluteFill>
      <Burst f={f} at={B(17)} cx={W / 2} cy={300} r0={240} r1={700} n={22} life={18} />
      {/* 1줄 */}
      <div style={{position: 'absolute', left: 0, top: 96, width: W, display: 'flex', justifyContent: 'center', gap: 22, fontFamily: FONT, fontWeight: 900, fontSize: 80, color: WHITE, letterSpacing: -2}}>
        {['고상철의', '공인중개사'].map((w, i) => {
          const s = pop(f, S0 + i * 7, {damping: 13, stiffness: 200, mass: 0.6});
          return <span key={w} style={{display: 'inline-block', transform: `translateY(${(1 - s) * -60}px)`, filter: `blur(${(1 - Math.min(1, s)) * 12}px)`, opacity: Math.min(1, s * 1.6)}}>{w}</span>;
        })}
      </div>
      {/* 2줄: 합격 / 가져가! 각각 쾅 */}
      <div style={{position: 'absolute', left: 0, top: 182, width: W, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 26, fontFamily: FONT, fontWeight: 900, letterSpacing: -6, transform: `scale(${1 + pulse}) rotate(-2deg)`}}>
        {[['합격', sHap, 176], ['가져가!', sGa, 150]].map(([t, s, sz]) => (
          <span key={t as string} style={{position: 'relative', display: 'inline-block', fontSize: sz as number, transform: `scale(${2.4 - 1.4 * (s as number)})`, opacity: Math.min(1, (s as number) * 2.5), filter: `blur(${(1 - Math.min(1, s as number)) * 14}px)`}}>
            <span style={{position: 'absolute', left: 0, top: 0, color: RED, transform: 'translate(8px, 9px)', WebkitTextStroke: `10px ${RED}`}}>{t}</span>
            <span style={{position: 'relative', color: YELLOW, WebkitTextStroke: `2px ${YELLOW}`}}>{t}</span>
          </span>
        ))}
      </div>
      {/* 해시태그 칩 */}
      <div style={{position: 'absolute', left: 0, top: 430, width: W, display: 'flex', justifyContent: 'center', gap: 16}}>
        {chips.map((c, i) => {
          const s = pop(f, B(19) + i * 3.5);
          return <span key={c} style={{fontFamily: FONT, fontWeight: 800, fontSize: 36, color: INK, background: i === 0 ? YELLOW : WHITE, padding: '8px 24px', borderRadius: 999, transform: `scale(${s}) translateY(${(1 - Math.min(1, s)) * 20}px)`, opacity: Math.min(1, s * 2), letterSpacing: -1}}>{c}</span>;
        })}
      </div>
      {/* 사진 카드 */}
      <div style={{position: 'absolute', left: (W - CARD.w) / 2, top: CARD.top + 24, width: CARD.w, height: cardH, transform: `translateY(${(1 - cardIn) * 260}px) scale(${0.8 + 0.2 * cardIn}) rotate(${-2.5 + (1 - cardIn) * 8}deg)`, opacity: Math.min(1, cardIn * 1.8), borderRadius: 22, border: `14px solid ${WHITE}`, boxShadow: '0 30px 70px rgba(0,0,0,.55)', overflow: 'hidden', background: INK}}>
        <Img src={staticFile('freeze.png')} style={{position: 'absolute', left: 0, top: -CARD.cropTop * k, width: W * k, height: H * k, transform: `scale(${kb})`, transformOrigin: '45% 35%'}} />
      </div>
      <Sparkles f={f} at={B(17) + 2} cx={W / 2} cy={280} spread={520} n={12} />
      <Stamp f={f} at={B(22)} />
    </AbsoluteFill>
  );
};

const Main: React.FC = () => {
  const f = useCurrentFrame();
  const sh = shakeAt(f);
  return (
    <AbsoluteFill style={{background: INK}}>
      <AbsoluteFill style={{transform: `translate(${sh.x}px, ${sh.y}px) rotate(${sh.r}deg) scale(${1 + (Math.abs(sh.x) + Math.abs(sh.y)) / 900})`}}>
        <VideoLayer />
        <TopTitle />
        <BottomWords />
        <Outro />
      </AbsoluteFill>
      <Flash f={f} at={B(8)} />
      <Flash f={f} at={B(16)} len={9} />
      <Flash f={f} at={B(22)} len={4} />
      <Audio src={staticFile('mix.wav')} />
    </AbsoluteFill>
  );
};

const Root: React.FC = () => (
  <Composition id="Short" component={Main} durationInFrames={DUR} fps={FPS} width={W} height={H} />
);
registerRoot(Root);
