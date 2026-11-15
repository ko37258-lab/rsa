// 당첨자 발표 모션그래픽 (모션그래픽 영상꾸미기 스킬의 키네틱 타이포 문법 + 어두운 긴장 무대 → 밝은 총정리)
// src/timeline.json(내레이션 시점) + src/subs.json(가라오케 자막) 만 바꾸면 다음 추첨에도 그대로 씁니다.
import React from 'react';
import {
  AbsoluteFill, Composition, registerRoot, staticFile, useCurrentFrame,
  interpolate, spring, Easing, delayRender, continueRender,
} from 'remotion';
import TL from './timeline.json';
import SUBS from './subs.json';

type Winner = {n: number; name: string; ord: string; start: number; ordAt: number; nameAt: number; nameEnd: number; end: number};
const W = TL.winners as Winner[];
const FPS = 30;
const DUR = TL.durationSec;
const FONT = "'Pretendard','Malgun Gothic',sans-serif";
const MONO = "'JetBrains Mono','DejaVu Sans Mono',Consolas,monospace";
const INK = '#111111';
const GREEN = '#1fcf62';
const RED = '#ef4444';
const GOLD = '#f5c542';
const PAPER = '#e9e7e2';
const ez = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const appear = (t: number, at: number, d = 0.35) => interpolate(t, [at, at + d], [0, 1], {...clamp, easing: ez});
const sp = (t: number, at: number, damping = 14, stiffness = 140) => spring({frame: Math.max(0, Math.round((t - at) * FPS)), fps: FPS, config: {damping, stiffness}});
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const OUTRO = TL.outro.start;
const STAGE_CX = 1135; // 왼쪽 명단 레일을 뺀 무대 중심

// Pretendard 로드
if (typeof window !== 'undefined' && !(window as any).__ptd) {
  (window as any).__ptd = true;
  const h = delayRender('Pretendard');
  const ws: [string, string][] = [['Medium', '500'], ['SemiBold', '600'], ['Bold', '700'], ['ExtraBold', '800'], ['Black', '900']];
  Promise.all(ws.map(([n, w]) => new FontFace('Pretendard', `url(${staticFile(`fonts/Pretendard-${n}.otf`)})`, {weight: w}).load().then((ff) => { (document as any).fonts.add(ff); })))
    .then(() => continueRender(h)).catch(() => continueRender(h));
}

// 현재 장면 상태
const curWinner = (t: number) => W.find((w) => t >= w.start && t < w.end);
const revealedCount = (t: number) => W.filter((w) => t >= w.nameAt).length;
const isLastPhase = (t: number) => t >= TL.two.start && t < OUTRO;
// 심장박동 시점 (음악 스크립트와 같은 규칙)
const HEARTS: number[] = (() => {
  const out: number[] = [];
  W.forEach((w, i) => {
    const last = i === 9; let hb = w.ordAt - 0.2; let gap = last ? 1.0 : 0.95;
    while (hb < w.nameAt - 0.35) { out.push(hb); hb += gap; gap = Math.max(0.42, gap * (last ? 0.9 : 0.94)); }
  });
  for (const seg of [TL.half, TL.two]) { let hb = seg.start + 0.2; while (hb < seg.end - 0.4) { out.push(hb); hb += 0.85; } }
  return out;
})();
const heartPulse = (t: number) => {
  let v = 0;
  for (const h of HEARTS) { const d = t - h; if (d >= 0 && d < 0.6) v = Math.max(v, Math.exp(-d / 0.09) + 0.7 * (d > 0.2 ? Math.exp(-(d - 0.2) / 0.09) : 0)); }
  return Math.min(1, v);
};

// ───────────── 배경: 어두운 무대 + 조명 + 필름 그레인 ─────────────
const DarkStage: React.FC = () => {
  const frame = useCurrentFrame(); const t = frame / FPS;
  const w = curWinner(t);
  const sus = w && t >= w.ordAt - 0.2 && t < w.nameAt ? interpolate(t, [w.ordAt - 0.2, w.nameAt], [0, 1], clamp) : 0;
  const last = isLastPhase(t);
  const hp = heartPulse(t);
  const beam = 0.05 + 0.1 * sus + 0.04 * Math.sin(t * 1.3);
  const beamCol = last ? '255,70,70' : '120,255,170';
  return (
    <AbsoluteFill style={{background: 'radial-gradient(1300px 900px at 59% 45%, #1b1c20 0%, #0d0d10 55%, #050506 100%)'}}>
      {[-1, 1].map((s) => (
        <div key={s} style={{position: 'absolute', left: STAGE_CX - 450 + s * 520, top: -200, width: 900, height: 1500,
          transformOrigin: '450px 0px', transform: `rotate(${s * (14 + 9 * Math.sin(t * 0.7 + s))}deg)`,
          background: `linear-gradient(180deg, rgba(${beamCol},${beam}) 0%, rgba(${beamCol},0) 80%)`,
          clipPath: 'polygon(46% 0%, 54% 0%, 100% 100%, 0% 100%)', mixBlendMode: 'screen'}} />
      ))}
      {/* 심장박동 비네트 (마지막 구간은 빨강) */}
      <AbsoluteFill style={{background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(${last ? '190,20,20' : '0,0,0'},${0.35 + 0.3 * hp * (last ? 1 : 0.5)}) 100%)`}} />
      <AbsoluteFill style={{backgroundImage: `url(${staticFile('noise.png')})`, backgroundPosition: `${Math.floor(hash(frame) * 256)}px ${Math.floor(hash(frame + 9) * 256)}px`, opacity: 0.05, mixBlendMode: 'screen'}} />
    </AbsoluteFill>
  );
};

// ───────────── 상단: 진행선 + 모노 라벨 + WINNER n/10 점 ─────────────
const Header: React.FC<{light?: boolean}> = ({light}) => {
  const t = useCurrentFrame() / FPS;
  const done = revealedCount(t);
  const lab = light ? '#6f6b63' : '#8a877f';
  const ink = light ? INK : '#fff';
  const k = appear(t, 0.3, 0.6);
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, height: 5, width: `${(t / DUR) * 100}%`, background: GREEN, boxShadow: light ? 'none' : `0 0 12px ${GREEN}`}} />
      <div style={{position: 'absolute', left: 70, right: 70, top: 26, display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: 17, color: lab, letterSpacing: 1.5, opacity: k}}>
        <span style={{fontFamily: FONT, fontWeight: 900, fontSize: 22, color: ink, letterSpacing: -0.5, marginRight: 16}}>MR.K</span>
        LUCKY DRAW — {light ? '최종 당첨자 명단' : '당첨자 발표'}
        <div style={{flex: 1}} />
        <span style={{marginRight: 18}}>WINNER {String(done).padStart(2, '0')} / 10</span>
        {Array.from({length: 10}, (_, i) => {
          const at = W[i].nameAt; const pop = t >= at ? sp(t, at, 10, 200) : 0;
          return <div key={i} style={{width: 9, height: 9, borderRadius: 5, marginLeft: 7, background: i < done ? GREEN : (light ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.18)'), transform: `scale(${1 + 0.8 * (1 - pop) * (t >= at ? 1 : 0)})`}} />;
        })}
      </div>
    </>
  );
};

// ───────────── 왼쪽 명단 레일 (공개될 때마다 채워짐) ─────────────
const Rail: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const inT = TL.intro.reveal;
  if (t < inT) return null;
  const out = interpolate(t, [OUTRO - 0.2, OUTRO + 0.3], [1, 0], clamp);
  const cw = curWinner(t);
  return (
    <div style={{position: 'absolute', left: 70, top: 168, width: 290, opacity: out, transform: `translateX(${-60 * (1 - out)}px)`}}>
      <div style={{fontFamily: MONO, fontSize: 15, color: '#8a877f', letterSpacing: 3, marginBottom: 14, opacity: appear(t, inT, 0.4)}}>WINNERS BOARD</div>
      {W.map((w, i) => {
        const k = appear(t, inT + 0.15 + i * 0.09, 0.4);
        const got = t >= w.nameAt + 0.35;
        const fl = got ? Math.exp(-(t - w.nameAt - 0.35) / 0.35) : 0;
        const active = cw && cw.n === w.n && t < w.nameAt;
        const lastSeats = !got && t >= TL.two.start && t < TL.two.end;
        const halfSeats = !got && t >= TL.half.remain && t < TL.half.end;
        const pulse = 0.5 + 0.5 * Math.sin(t * 9);
        const border = active ? (w.n === 10 ? RED : GREEN) : lastSeats ? RED : halfSeats ? GOLD : got ? 'rgba(31,207,98,.45)' : 'rgba(255,255,255,.08)';
        const nk = got ? sp(t, w.nameAt + 0.35, 12, 160) : 0;
        return (
          <div key={w.n} style={{height: 62, marginBottom: 8, borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 18px',
            background: got ? `rgba(31,207,98,${0.1 + 0.55 * fl})` : 'rgba(255,255,255,.035)',
            border: `2px solid ${border}`, boxShadow: active || lastSeats ? `0 0 ${10 + 14 * pulse}px ${active ? (w.n === 10 ? RED : GREEN) : RED}` : 'none',
            opacity: k, transform: `translateX(${(1 - k) * -40}px)`, fontFamily: FONT}}>
            <span style={{fontFamily: MONO, fontSize: 18, fontWeight: 700, color: got ? GREEN : '#6d6a64', width: 44}}>{String(w.n).padStart(2, '0')}</span>
            {got ? (
              <span style={{fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: interpolate(nk, [0, 1], [10, -1]), opacity: Math.min(1, nk * 1.5), filter: `blur(${(1 - Math.min(1, nk)) * 6}px)`}}>{w.name}</span>
            ) : (
              <span style={{fontSize: 26, fontWeight: 800, color: active ? '#fff' : '#4b4945', letterSpacing: 6, opacity: active ? 0.5 + 0.5 * pulse : 1}}>{active ? '? ? ?' : '· · ·'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ───────────── 키네틱 글자 (흐림 + 넓은 자간 → 좁은 자간) ─────────────
const Kin: React.FC<{t: number; at: number; size: number; color: string; children: string; from?: 'up' | 'right'; weight?: number; ls?: number}> = ({t, at, size, color, children, from = 'up', weight = 900, ls = -3}) => {
  const k = sp(t, at, 15, 140);
  const kk = Math.min(1, k);
  return (
    <span style={{display: 'inline-block', whiteSpace: 'pre', fontFamily: FONT, fontSize: size, fontWeight: weight, color, lineHeight: 1.05,
      letterSpacing: interpolate(k, [0, 1], [size * 0.18, ls]), opacity: t < at ? 0 : Math.min(1, k * 1.4),
      filter: `blur(${(1 - kk) * 14}px)`, transform: from === 'up' ? `translateY(${(1 - k) * 50}px)` : `translateX(${(1 - k) * 90}px)`}}>{children}</span>
  );
};
const exitStyle = (t: number, end: number, d = 0.35): React.CSSProperties => {
  const e = interpolate(t, [end - d, end], [0, 1], clamp);
  return {opacity: 1 - e, transform: `translateX(${-60 * e}px)`, filter: `blur(${8 * e}px)`};
};

// ───────────── 인트로 ─────────────
const Intro: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const I = TL.intro;
  if (t >= I.end) return null;
  const titleOut = I.count;
  return (
    <AbsoluteFill style={{fontFamily: FONT}}>
      {t < titleOut && (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', ...exitStyle(t, titleOut, 0.4)}}>
          <div style={{fontFamily: MONO, color: '#8a877f', fontSize: 24, letterSpacing: 6, opacity: appear(t, 0.2, 0.6)}}>MR.K LUCKY DRAW — WINNER ANNOUNCEMENT</div>
          <div style={{marginTop: 22}}><Kin t={t} at={0.3} size={200} color="#fff" ls={-8}>당첨자 발표</Kin></div>
          <div style={{height: 8, background: GREEN, width: 900 * appear(t, 0.9, 0.8), boxShadow: `0 0 24px ${GREEN}`, marginTop: 6}} />
          <div style={{marginTop: 30}}><Kin t={t} at={I.title} size={104} color={GREEN} from="right" ls={-5}>드디어 공개합니다</Kin></div>
        </AbsoluteFill>
      )}
      {t >= I.count && t < I.who && (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', ...exitStyle(t, I.who, 0.35)}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 70}}>
            <div style={{textAlign: 'center'}}>
              <Kin t={t} at={I.count} size={330} color="#fff" ls={-14}>35</Kin>
              <div style={{fontSize: 46, fontWeight: 800, color: '#9b978f', opacity: appear(t, I.count + 0.3)}}>명 중</div>
            </div>
            <div style={{fontSize: 110, fontWeight: 900, color: '#fff', marginBottom: 60, opacity: appear(t, I.only, 0.25), transform: `scale(${t >= I.only ? 1 + 0.4 * (1 - sp(t, I.only, 10, 220)) : 1})`}}>단</div>
            <div style={{textAlign: 'center', transform: `scale(${t >= I.ten ? 1 + 0.6 * (1 - sp(t, I.ten, 9, 220)) : 1})`}}>
              <span style={{display: 'inline-block', fontSize: 330, fontWeight: 900, color: GREEN, letterSpacing: -14, lineHeight: 1.05, opacity: t >= I.ten ? 1 : 0, textShadow: `0 0 60px rgba(31,207,98,.55)`}}>10</span>
              <div style={{fontSize: 46, fontWeight: 800, color: GREEN, opacity: appear(t, I.ten + 0.2)}}>명 당첨</div>
            </div>
          </div>
        </AbsoluteFill>
      )}
      {t >= I.who && t < I.reveal && (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', ...exitStyle(t, I.reveal, 0.35)}}>
          <div style={{fontSize: 420, fontWeight: 900, color: '#fff', lineHeight: 1, opacity: appear(t, I.who, 0.4), transform: `scale(${1 + 0.05 * Math.sin(t * 8)})`, textShadow: `0 0 ${40 + 30 * Math.sin(t * 8)}px rgba(255,255,255,.35)`}}>?</div>
          <div style={{marginTop: 10}}><Kin t={t} at={I.who + 0.3} size={84} color="#fff">행운의</Kin><Kin t={t} at={I.who + 0.5} size={84} color={GREEN} from="right"> 주인공은?</Kin></div>
        </AbsoluteFill>
      )}
      {t >= I.reveal && (
        <div style={{position: 'absolute', left: STAGE_CX - 700, width: 1400, top: 360, textAlign: 'center', ...exitStyle(t, I.end, 0.35)}}>
          <div style={{fontFamily: MONO, fontSize: 24, color: '#8a877f', letterSpacing: 6, opacity: appear(t, I.reveal)}}>10 SEATS · 1 BY 1</div>
          <div style={{marginTop: 18}}><Kin t={t} at={I.reveal + 0.1} size={120} color="#fff" ls={-5}>지금부터</Kin></div>
          <div><Kin t={t} at={I.reveal + 0.6} size={120} color={GREEN} from="right" ls={-5}>한 분씩 공개</Kin></div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ───────────── 슬롯 릴 타일 ─────────────
const SYL = '김이박최정강조윤장임한오서신권황안송류홍민서준지현영수진하은우성혜아인도연주희재경태소예원나유선미';
const TILE_W = 230, TILE_H = 270;
const Reel: React.FC<{t: number; start: number; stopAt: number; ch: string; seed: number; color: string; won: boolean}> = ({t, start, stopAt, ch, seed, color, won}) => {
  const V = 13, TD = 0.75, TARGET = 400;
  let D: number;
  if (t < stopAt - TD) D = V * (stopAt - t) - (V * TD) / 2;
  else if (t < stopAt) D = (V * (stopAt - t) ** 2) / (2 * TD);
  else { const d = t - stopAt; D = -0.16 * Math.sin(d * 18) * Math.exp(-d * 7); }
  const p = TARGET - D;
  const speed = t < stopAt - TD ? V : t < stopAt ? (V * (stopAt - t)) / TD : 0;
  const base = Math.floor(p);
  const cells = [base - 1, base, base + 1, base + 2];
  const enter = appear(t, start, 0.45);
  const wonK = won ? sp(t, stopAt, 10, 180) : 0;
  return (
    <div style={{width: TILE_W, height: TILE_H, borderRadius: 26, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(180deg, #1d1e23 0%, #121317 50%, #1d1e23 100%)',
      border: `3px solid ${won ? color : 'rgba(255,255,255,.14)'}`,
      boxShadow: won ? `0 0 ${30 + 30 * (1 - Math.min(1, wonK))}px ${color}, inset 0 0 30px rgba(31,207,98,.25)` : 'inset 0 0 30px rgba(0,0,0,.6), 0 20px 50px rgba(0,0,0,.5)',
      opacity: enter, transform: `translateY(${(1 - enter) * 60}px) scale(${won ? 1 + 0.08 * (1 - Math.min(1, wonK)) : 1})`}}>
      {cells.map((k) => {
        const y = (k - p) * TILE_H;
        const c = k === TARGET ? ch : SYL[Math.floor(hash(k * 7.3 + seed * 91.7) * SYL.length)];
        return (
          <div key={k} style={{position: 'absolute', left: 0, top: y, width: TILE_W, height: TILE_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT, fontWeight: 900, fontSize: 170, color: won && k === TARGET ? '#fff' : '#d9d6cf', letterSpacing: -4,
            filter: `blur(${Math.min(10, speed * 0.75)}px)`, textShadow: won && k === TARGET ? `0 0 30px ${color}` : 'none'}}>{c}</div>
        );
      })}
      {/* 유리 반사 + 위아래 그늘 */}
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 74%, rgba(0,0,0,.75) 100%)'}} />
      <div style={{position: 'absolute', left: -TILE_W, top: 0, width: TILE_W * 0.5, height: TILE_H, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.18), rgba(255,255,255,0))',
        transform: `translateX(${((t * 1.4 + seed * 0.21) % 1.6) * TILE_W * 2.4}px) skewX(-18deg)`}} />
    </div>
  );
};

// ───────────── 꽃가루 / 충격파 / 섬광 ─────────────
const Confetti: React.FC<{t: number; at: number; n?: number; cx: number; cy: number; big?: boolean}> = ({t, at, n = 90, cx, cy, big}) => {
  const d = t - at;
  if (d < 0 || d > 3.4) return null;
  const cols = big ? [GREEN, GOLD, '#fff', RED, GOLD] : [GREEN, GOLD, '#fff', GREEN];
  return (
    <>
      {Array.from({length: n}, (_, i) => {
        const a = hash(i + at) * Math.PI * 2; const v = (big ? 900 : 700) * (0.35 + hash(i * 3.1 + at) * 0.9);
        const vx = Math.cos(a) * v * 1.3, vy = Math.sin(a) * v - 420;
        const drag = Math.exp(-d * 1.4);
        const x = cx + (vx * (1 - drag)) / 1.4; const y = cy + (vy * (1 - drag)) / 1.4 + 380 * d * d * 0.5 + 60 * d;
        const rot = (hash(i * 5.7) - 0.5) * 1400 * d;
        const flip = Math.cos(d * (6 + hash(i) * 10) + i);
        const op = interpolate(d, [2.4, 3.4], [1, 0], clamp);
        const w = 10 + hash(i * 2.2) * 10, h = 16 + hash(i * 4.4) * 14;
        return <div key={i} style={{position: 'absolute', left: x, top: y, width: w, height: h, background: cols[i % cols.length], borderRadius: i % 5 === 0 ? '50%' : 2, transform: `rotate(${rot}deg) scaleY(${flip})`, opacity: op}} />;
      })}
    </>
  );
};
const Shock: React.FC<{t: number; at: number; cx: number; cy: number; color: string}> = ({t, at, cx, cy, color}) => {
  const d = t - at; if (d < 0 || d > 0.9) return null;
  const r = interpolate(d, [0, 0.9], [60, 1100], {...clamp, easing: Easing.out(Easing.cubic)});
  return <div style={{position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `${10 * (1 - d / 0.9) + 2}px solid ${color}`, opacity: 1 - d / 0.9, boxShadow: `0 0 40px ${color}`}} />;
};

// ───────────── 당첨자 장면 ─────────────
const WinnerScene: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const w = curWinner(t);
  if (!w) return null;
  const last = w.n === 10;
  const accent = last ? RED : GREEN;
  const won = t >= w.nameAt;
  const lastIntro = last && t < w.ordAt - 0.15;
  // 카메라 흔들림: 공개 직전 커짐 + 공개 순간 충격
  const pre = interpolate(t, [w.nameAt - 0.9, w.nameAt], [0, 1], clamp) * (won ? 0 : 1);
  const hit = won ? Math.exp(-(t - w.nameAt) / 0.18) : 0;
  const amp = (last ? 9 : 5) * pre + (last ? 26 : 16) * hit;
  const fr = Math.floor(t * FPS);
  const sx = (hash(fr * 1.7) - 0.5) * 2 * amp, sy = (hash(fr * 2.9 + 3) - 0.5) * 2 * amp;
  const hp = heartPulse(t);
  const tilesY = 470;
  const cy = tilesY + TILE_H / 2;
  const chars = w.name.split('');
  const ordWord = w.ord.split(' ')[0];
  const dim = won ? interpolate(t, [w.nameAt, w.nameAt + 0.4], [1, 0.38], clamp) : 1;
  const stampK = won ? sp(t, w.nameAt + 0.28, 9, 260) : 0;
  const chipK = won ? sp(t, w.nameAt + 0.45, 13, 170) : 0;
  return (
    <AbsoluteFill style={{...exitStyle(t, w.end, 0.35)}}>
      <AbsoluteFill style={{transform: `translate(${sx}px, ${sy}px)`}}>
        {/* 뒤 배경 큰 번호 */}
        <div style={{position: 'absolute', left: STAGE_CX - 700, width: 1400, top: 90, textAlign: 'center', fontFamily: FONT, fontWeight: 900, fontSize: 620, lineHeight: 1,
          color: 'transparent', WebkitTextStroke: `3px rgba(255,255,255,${0.07 + 0.08 * hp})`, letterSpacing: -20, transform: `scale(${1 + 0.035 * hp})`, opacity: appear(t, w.start, 0.6)}}>{String(w.n).padStart(2, '0')}</div>
        {lastIntro ? (
          <div style={{position: 'absolute', left: STAGE_CX - 700, width: 1400, top: 300, textAlign: 'center'}}>
            <div style={{fontFamily: MONO, fontSize: 26, color: RED, letterSpacing: 8, opacity: appear(t, w.start + 0.2)}}>FINAL SEAT</div>
            <div style={{marginTop: 10}}><Kin t={t} at={w.start + 0.3} size={260} color={RED} ls={-6}>LAST</Kin></div>
            <div style={{marginTop: 6}}><Kin t={t} at={w.start + 0.75} size={84} color="#fff">마지막</Kin><Kin t={t} at={w.start + 0.95} size={84} color={RED} from="right"> 한 자리</Kin></div>
          </div>
        ) : (
          <>
            <div style={{position: 'absolute', left: STAGE_CX - 700, width: 1400, top: 210, textAlign: 'center', opacity: dim}}>
              <div style={{fontFamily: MONO, fontSize: 24, color: last ? RED : '#8a877f', letterSpacing: 6, opacity: appear(t, w.ordAt - 0.3)}}>{last ? 'FINAL WINNER' : 'WINNER'} No.{String(w.n).padStart(2, '0')} / 10</div>
              <div style={{marginTop: 14}}>
                <Kin t={t} at={w.ordAt - 0.15} size={96} color="#fff">{ordWord + ' 번째'}</Kin>
                <Kin t={t} at={w.ordAt + 0.15} size={96} color={accent} from="right">{' 당첨자는...'}</Kin>
              </div>
            </div>
            <div style={{position: 'absolute', left: STAGE_CX - (TILE_W * 3 + 30 * 2) / 2, top: tilesY, display: 'flex', gap: 30}}>
              {chars.map((c, i) => (
                <Reel key={i} t={t} start={w.ordAt - 0.25 + i * 0.08} stopAt={w.nameAt + i * 0.1} ch={c} seed={w.n * 10 + i} color={GREEN} won={t >= w.nameAt + i * 0.1} />
              ))}
              {/* 당첨 도장 */}
              {won && (
                <div style={{position: 'absolute', right: -70, top: -70, width: 170, height: 170, borderRadius: '50%', border: `8px solid ${RED}`, color: RED,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontWeight: 900, fontSize: 58, letterSpacing: -2, background: 'rgba(239,68,68,.08)',
                  transform: `rotate(${-14 + 10 * (1 - stampK)}deg) scale(${1 + 1.6 * (1 - Math.min(1, stampK))})`, opacity: Math.min(1, stampK * 2), boxShadow: `0 0 30px rgba(239,68,68,.45)`}}>당첨</div>
              )}
            </div>
            {won && (
              <div style={{position: 'absolute', left: STAGE_CX - 500, width: 1000, top: tilesY + TILE_H + 46, display: 'flex', justifyContent: 'center'}}>
                <div style={{background: GREEN, color: INK, fontFamily: FONT, fontWeight: 900, fontSize: 46, padding: '14px 40px', borderRadius: 999, letterSpacing: -1,
                  transform: `translateY(${(1 - chipK) * 40}px) scale(${0.8 + 0.2 * Math.min(1, chipK)})`, opacity: Math.min(1, chipK * 1.5), boxShadow: `0 0 40px rgba(31,207,98,.5)`}}>
                  {w.name} 님, 축하드립니다!
                </div>
              </div>
            )}
            {/* 공개 효과 */}
            <Shock t={t} at={w.nameAt} cx={STAGE_CX} cy={cy} color={last ? GOLD : GREEN} />
            {last && <Shock t={t} at={w.nameAt + 0.18} cx={STAGE_CX} cy={cy} color={GREEN} />}
            <Confetti t={t} at={w.nameAt + 0.05} cx={STAGE_CX} cy={cy} n={last ? 160 : 90} big={last} />
          </>
        )}
      </AbsoluteFill>
      {/* 섬광 */}
      {won && t - w.nameAt < 0.35 && <AbsoluteFill style={{background: last ? '#fff7d6' : '#ffffff', opacity: 0.75 * (1 - (t - w.nameAt) / 0.35)}} />}
    </AbsoluteFill>
  );
};

// ───────────── 중간 멘트: 절반 / 두 자리 ─────────────
const BeatScene: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const H = TL.half, T2 = TL.two;
  const hp = heartPulse(t);
  if (t >= H.start && t < H.end) {
    const phaseB = t >= H.remain;
    const fill = interpolate(t, [H.start + 0.2, H.start + 1.2], [0, 0.5], {...clamp, easing: ez});
    return (
      <div style={{position: 'absolute', left: STAGE_CX - 700, width: 1400, top: 250, textAlign: 'center', ...exitStyle(t, H.end, 0.35)}}>
        {!phaseB ? (
          <div style={exitStyle(t, H.remain, 0.25)}>
            <div style={{fontFamily: MONO, fontSize: 24, color: '#8a877f', letterSpacing: 6, opacity: appear(t, H.start)}}>HALF TIME</div>
            <div style={{marginTop: 10}}><Kin t={t} at={H.start + 0.1} size={150} color="#fff" ls={-6}>절반</Kin><Kin t={t} at={H.start + 0.35} size={150} color={GREEN} from="right" ls={-6}> 통과</Kin></div>
            <div style={{margin: '40px auto 0', width: 900, height: 22, borderRadius: 11, background: 'rgba(255,255,255,.1)', overflow: 'hidden'}}>
              <div style={{width: `${fill * 100}%`, height: '100%', background: GREEN, boxShadow: `0 0 20px ${GREEN}`}} />
            </div>
            <div style={{marginTop: 18, fontFamily: MONO, fontSize: 30, color: GREEN}}>{Math.round(fill * 10)} / 10</div>
          </div>
        ) : (
          <div>
            <div style={{fontFamily: MONO, fontSize: 24, color: GOLD, letterSpacing: 6, opacity: appear(t, H.remain)}}>SEATS LEFT</div>
            <div style={{fontFamily: FONT, fontWeight: 900, fontSize: 380, lineHeight: 1, color: '#fff', letterSpacing: -10, transform: `scale(${1 + 0.5 * (1 - sp(t, H.remain + 0.6, 9, 220)) * (t >= H.remain + 0.6 ? 1 : 0) + 0.03 * hp})`, opacity: appear(t, H.remain, 0.3), textShadow: `0 0 50px rgba(245,197,66,.45)`}}>5</div>
            <div style={{marginTop: -10}}><Kin t={t} at={H.remain + 0.2} size={70} color={GOLD}>남은 자리</Kin></div>
          </div>
        )}
      </div>
    );
  }
  if (t >= T2.start && t < T2.end) {
    return (
      <div style={{position: 'absolute', left: STAGE_CX - 700, width: 1400, top: 230, textAlign: 'center', ...exitStyle(t, T2.end, 0.35)}}>
        <div style={{fontFamily: MONO, fontSize: 26, color: RED, letterSpacing: 8, opacity: appear(t, T2.start)}}>ONLY 2 SEATS LEFT</div>
        <div style={{fontFamily: FONT, fontWeight: 900, fontSize: 440, lineHeight: 1, color: RED, letterSpacing: -10, transform: `scale(${1 + 0.06 * hp})`, opacity: appear(t, T2.start + 0.25, 0.3), textShadow: `0 0 ${50 + 50 * hp}px rgba(239,68,68,.7)`}}>2</div>
        <div><Kin t={t} at={T2.start + 0.6} size={76} color="#fff">딱 두 자리</Kin><Kin t={t} at={T2.start + 0.85} size={76} color={RED} from="right"> 남았습니다</Kin></div>
      </div>
    );
  }
  return null;
};

// ───────────── 총정리 (밝은 종이 배경, 스킬 기본 스타일) ─────────────
const Summary: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  if (t < OUTRO) return null;
  const r = interpolate(t, [OUTRO, OUTRO + 0.75], [0, 1500], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const k3 = sp(t, OUTRO + 0.9, 15, 140);
  const col = (i: number) => (i < 5 ? 0 : 1), row = (i: number) => i % 5;
  const gx = 70, gy = 222, cw = 875, ch = 124, gapX = 30, gapY = 18;
  return (
    <AbsoluteFill style={{clipPath: `circle(${r}px at ${STAGE_CX}px 540px)`}}>
      <AbsoluteFill style={{background: `radial-gradient(1400px 900px at ${50 + Math.sin(t / 6) * 4}% 45%, #f4f2ee 0%, ${PAPER} 55%, #dcd9d2 100%)`}}>
        <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(60,50,30,.16) 100%)'}} />
      </AbsoluteFill>
      <Header light />
      <div style={{position: 'absolute', left: 70, top: 66, fontFamily: FONT}}>
        <div style={{display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap'}}>
          <span style={{fontFamily: MONO, fontSize: 22, color: GREEN, fontWeight: 700, marginRight: 22, opacity: appear(t, OUTRO + 0.6)}}>FINAL</span>
          <Kin t={t} at={OUTRO + 0.6} size={78} color={INK}>당첨자</Kin>
          <Kin t={t} at={OUTRO + 0.85} size={78} color={GREEN} from="right">{' 10명 총정리'}</Kin>
          <span style={{marginLeft: 26, alignSelf: 'center', background: RED, color: '#fff', fontSize: 26, fontWeight: 800, padding: '8px 18px', borderRadius: 999, transform: `scale(${sp(t, OUTRO + 1.3, 11, 200)})`}}>최종 확정</span>
        </div>
        <div style={{height: 5, background: INK, width: `${Math.min(1, k3) * 100}%`, marginTop: 2}} />
      </div>
      {W.map((w, i) => {
        const at = OUTRO + 1.0 + i * 0.14;
        const k = sp(t, at, 14, 150);
        const kk = Math.min(1, k);
        return (
          <div key={w.n} style={{position: 'absolute', left: gx + col(i) * (cw + gapX), top: gy + row(i) * (ch + gapY), width: cw, height: ch, borderRadius: 18, background: '#fff',
            boxShadow: '0 18px 40px rgba(40,32,20,.12), 0 2px 6px rgba(0,0,0,.05)', border: '1px solid rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', padding: '0 36px',
            opacity: t < at ? 0 : Math.min(1, k * 1.4), transform: `translateY(${(1 - k) * 40}px)`, filter: `blur(${(1 - kk) * 8}px)`, fontFamily: FONT}}>
            <span style={{fontFamily: MONO, fontSize: 30, fontWeight: 800, color: GREEN, width: 90}}>{String(w.n).padStart(2, '0')}</span>
            <span style={{fontSize: 64, fontWeight: 900, color: INK, letterSpacing: interpolate(k, [0, 1], [14, -2])}}>{w.name}</span>
            <span style={{fontSize: 34, fontWeight: 800, color: '#8a877f', marginLeft: 12, marginTop: 14}}>님</span>
            <div style={{flex: 1}} />
            <div style={{display: 'flex', alignItems: 'center', gap: 10, background: INK, color: '#fff', borderLeft: `8px solid ${GREEN}`, borderRadius: 12, padding: '8px 20px', fontSize: 26, fontWeight: 800,
              transform: `scale(${sp(t, at + 0.25, 11, 200)})`}}>당첨</div>
          </div>
        );
      })}
      <Confetti t={t} at={OUTRO + 0.9} cx={STAGE_CX} cy={-80} n={70} />
    </AbsoluteFill>
  );
};

// ───────────── 가라오케 자막 ─────────────
type Sub = {s: number; e: number; w: {t: string; s: number; e: number}[]};
const Subtitle: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const s = (SUBS as Sub[]).find((x) => t >= x.s && t < x.e);
  if (!s) return null;
  const light = t >= OUTRO + 0.5;
  const k = appear(t, s.s, 0.18);
  const ink = light ? INK : '#ffffff';
  const gray = light ? '#a8a59d' : '#55524c';
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 30, display: 'flex', justifyContent: 'center', fontFamily: FONT}}>
      <div style={{fontSize: 50, fontWeight: 800, padding: '8px 20px', whiteSpace: 'nowrap', opacity: k, transform: `translateY(${(1 - k) * 14}px)`, filter: `blur(${(1 - k) * 6}px)`, letterSpacing: -1.2, display: 'flex', gap: 14}}>
        {s.w.map((w, i) => {
          const fill = Math.max(0, Math.min(1, (t - w.s) / Math.max(0.05, w.e - w.s)));
          const p = fill * 100;
          const active = fill > 0 && fill < 1;
          return (
            <span key={i} style={{display: 'inline-block', position: 'relative', backgroundImage: `linear-gradient(90deg, ${active ? GREEN : ink} ${p - 5}%, ${gray} ${p + 5}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              transform: `translateY(${active ? -4 : 0}px) scale(${active ? 1.06 : 1})`, fontWeight: active || fill >= 1 ? 900 : 700}}>
              {w.t}{active && <span style={{position: 'absolute', left: 0, bottom: -4, height: 4, width: `${p}%`, background: GREEN}} />}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Main: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#0b0b0d'}}>
    <DarkStage />
    <Header />
    <Rail />
    <Intro />
    <BeatScene />
    <WinnerScene />
    <Summary />
    <Subtitle />
  </AbsoluteFill>
);

const Root: React.FC = () => (
  <Composition id="Winner" component={Main} durationInFrames={Math.round(DUR * FPS)} fps={FPS} width={1920} height={1080} />
);
registerRoot(Root);
