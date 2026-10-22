// 스타일 음악 엔진 — 외부 파일·네트워크 없이 Web Audio 만으로 분위기별 배경음악을 합성합니다.
//
//  - MOODS                      분위기 10가지(id·이름·설명·템포·조성·느낌). 화면 목록은 이 배열을 그대로 읽으면 됩니다.
//  - renderMood(id, seconds)    OfflineAudioContext 로 seconds 길이 AudioBuffer 를 만듭니다.
//                               처음 0.3초 페이드인, 끝 1.2초 페이드아웃, 피크 -1dBFS 이하·평균 약 -17dBFS 로 맞춥니다. 같은 조건은 캐시.
//  - playMood(audioCtx, id)     미리듣기 — 마디에 맞춘 이음새 없는 루프를 렌더해 BufferSource loop 로 재생하고 { stop() } 을 돌려줍니다.
//  - moodCycleSeconds(id)       코드 진행 한 바퀴 길이(초). 루프 길이를 마디에 맞출 때 씁니다.
//  - audioBufferToWav(buffer)   저장·검사용 16비트 PCM WAV 바이트(ArrayBuffer).
//  - clearMoodCache()           캐시 비우기.
//
// 스타일→음악 매핑은 styles-data.js 의 music 필드가 가집니다(여기서는 하지 않음).
// 브라우저 전용이지만 import 자체는 부작용이 없습니다(window 는 함수 안에서만 만집니다).
//
// 합성 구조(분위기마다 레시피가 다름):
//   드럼·노이즈 효과(킥=사인 피치 드롭, 스네어=노이즈+밴드패스, 하이햇=노이즈 하이패스 짧게, 클랩·틱·셰이커·탐·심벌, 라이저, 레코드 잡음)
//     → 속도를 위해 표본 단위(JS)로 트랙에 바로 그려 BufferSource 하나로 재생
//   음정 악기(베이스·플럭·피아노·마림바·금관·휘파람·벨…) → 부분음을 PeriodicWave 하나로 합친 오실레이터 + 로우패스 + 엔벨로프
//   코드 패드 → 디튠 톱니 2~3개 + 로우패스(느린 LFO) + 느린 어택, 웅장은 옥타브 겹침
//   공간감: 노이즈 임펄스(1.5초) 컨볼루션 리버브 + 피드백 딜레이 → 마스터 DynamicsCompressor
//   렌더 후: RMS 정규화 → 소프트 리미터(-1dBFS) → 페이드.
//   같은 (분위기, 길이, 시드) 는 같은 소리(난수는 시드 고정. 크롬 컨볼버의 부동소수 반올림 차이 ~1e-7 만 남음).

export const MOODS = [
  { id: 'upbeat', name: '경쾌 팝', desc: '밝은 메이저 코드 위에 네 박 킥과 손뼉, 통통 튀는 아르페지오', bpm: 124, key: 'C', feel: '밝고 경쾌함' },
  { id: 'news', name: '긴박 뉴스', desc: '빠른 16분 베이스 펄스와 금관 스팁, 고음 티커가 쉴 틈 없이 달린다', bpm: 140, key: 'Dm', feel: '긴박·속보' },
  { id: 'calm', name: '잔잔 피아노', desc: '드럼 없이 피아노 분산화음과 긴 잔향, 메이저 7 코드의 포근함', bpm: 72, key: 'F', feel: '차분·따뜻함' },
  { id: 'lofi', name: '로파이 힙합', desc: '느긋한 스윙 드럼, 흔들리는 전자피아노, 레코드 잡음과 먹먹한 질감', bpm: 84, key: 'Eb', feel: '느긋·몽환' },
  { id: 'corporate', name: '깔끔 기업', desc: '맑은 플럭 아르페지오와 피아노 스탭, 가볍게 받쳐 주는 비트', bpm: 110, key: 'G', feel: '신뢰·깔끔' },
  { id: 'drama', name: '긴장 드라마', desc: '심장박동 킥과 낮은 드론, 반음으로 조이는 코드와 상승 노이즈', bpm: 90, key: 'Am', feel: '긴장·불안' },
  { id: 'quiz', name: '퀴즈 쇼', desc: '시계 틱 소리와 마림바 아르페지오, 걷는 베이스에 종소리 신호', bpm: 128, key: 'Bb', feel: '궁금·재미' },
  { id: 'warning', name: '경고 펄스', desc: '묵직한 킥 펄스와 경고음 비프, 반음이 부딪히는 어두운 패드', bpm: 100, key: 'Cm', feel: '경고·주의' },
  { id: 'epic', name: '웅장', desc: '옥타브로 겹친 패드와 큰 북, 금관풍 느린 선율이 넓게 울린다', bpm: 76, key: 'Dm', feel: '웅장·장엄' },
  { id: 'playful', name: '장난스러운 우쿨렐레풍', desc: '우쿨렐레 스트럼과 셰이커, 휘파람 선율이 깡총깡총 뛴다', bpm: 118, key: 'C', feel: '유쾌·장난' },
];

// ── 음악 기본 자료 ─────────────────────────────────────
const KEY_ROOT = { C: 60, Db: 61, D: 62, Eb: 63, E: 64, F: 65, Gb: 66, G: 67, Ab: 68, A: 69, Bb: 70, B: 71 };
const CHORDS = {
  maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7], sus4: [0, 5, 7], pow: [0, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], maj6: [0, 4, 7, 9], min9: [0, 3, 7, 10, 14],
};
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  pentaMaj: [0, 2, 4, 7, 9], pentaMin: [0, 3, 5, 7, 10],
};

// 음색: partials=[배음 번호(정수), 크기, 파형] 을 PeriodicWave 하나로 합칩니다.
//   inharmonic=[비정수 배음비, 크기] 는 사인 오실레이터를 따로 더함(벨), unison={count, cents} 는 살짝 어긋난 복제(금관·합창)
//   a/d/s/r=엔벨로프(초·비율), filter=로우패스(env=시작 배율, fall=내려오는 시간), vib=비브라토, octave=기준 옥타브 이동
const VOICES = {
  pluck: { partials: [[1, 1, 'triangle'], [2, 0.25, 'sine']], a: 0.003, d: 0.35, s: 0, r: 0.05, filter: { freq: 2400, q: 1, env: 2.5, fall: 0.12 } },
  piano: { partials: [[1, 1, 'sine'], [2, 0.4, 'sine'], [3, 0.15, 'triangle'], [4, 0.05, 'sine']], a: 0.004, d: 1.8, s: 0, r: 0.12, filter: { freq: 5000, q: 0.5, env: 1.6, fall: 0.3 } },
  epiano: { partials: [[1, 1, 'sine'], [2, 0.3, 'sine'], [4, 0.06, 'sine']], a: 0.006, d: 1.4, s: 0, r: 0.15, vib: { rate: 5.2, cents: 9 }, filter: { freq: 2000, q: 0.7, env: 1.3, fall: 0.25 } },
  bell: { partials: [[1, 1, 'sine']], inharmonic: [[2.76, 0.45], [5.4, 0.15]], a: 0.002, d: 1.2, s: 0, r: 0.1 },
  marimba: { partials: [[1, 1, 'sine'], [4, 0.3, 'sine'], [9, 0.06, 'sine']], a: 0.002, d: 0.28, s: 0, r: 0.05 },
  brass: { partials: [[1, 1, 'sawtooth']], unison: { count: 2, cents: 5 }, a: 0.06, d: 0.25, s: 0.7, r: 0.2, filter: { freq: 1200, q: 1.2, env: 2.2, fall: 0.18 } },
  whistle: { partials: [[1, 1, 'sine'], [3, 0.05, 'sine']], a: 0.05, d: 0.1, s: 0.8, r: 0.12, vib: { rate: 5.6, cents: 25 } },
  choir: { partials: [[1, 0.35, 'sine'], [2, 1, 'sawtooth'], [2, 0.7, 'triangle']], octave: -1, unison: { count: 2, cents: 7 }, a: 0.6, d: 0.3, s: 0.85, r: 0.8, vib: { rate: 4.4, cents: 12 }, filter: { freq: 1200, q: 0.8 } },
  lead: { partials: [[1, 1, 'triangle'], [2, 0.2, 'sine']], a: 0.01, d: 0.2, s: 0.7, r: 0.1, filter: { freq: 3000, q: 0.7 } },
  uke: { partials: [[1, 1, 'triangle'], [2, 0.5, 'triangle'], [3, 0.12, 'sine']], a: 0.002, d: 0.32, s: 0, r: 0.04, filter: { freq: 3200, q: 1.5, env: 2.0, fall: 0.08 } },
  ticker: { partials: [[1, 1, 'sine']], a: 0.002, d: 0.05, s: 0, r: 0.02 },
  beep: { partials: [[1, 1, 'square']], a: 0.003, d: 0.14, s: 0, r: 0.03, filter: { freq: 2600, q: 0.7 } },
};

// ── 분위기별 레시피 ─────────────────────────────────────
// 패턴 문자열은 한 마디 16칸(16분음표). x=치기 X=세게 .=쉼. 배열이면 마디마다 번갈아 씁니다.
// 베이스 패턴: r=근음 5=5도 o=옥타브 위 3=코드 3음 7=7음 l=옥타브 아래 -=이어감 .=쉼
// prog: [근음 반음 거리, 코드 종류] 배열, barsPerChord 마디마다 다음 코드로.
const RECIPES = {
  upbeat: {
    root: 'C', scale: 'major', prog: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']], barsPerChord: 1, swing: 0, humanize: 0.01,
    drums: { level: 1, rev: 0.12, kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', hat: '..x...x...x...x.', ohat: '......x.......x.' },
    bass: { wave: 'square', cutoff: 700, level: 0.55, sub: 0.45, pattern: 'r.o.r.o.r.o.5.o.', gate: 0.8 },
    pad: { waves: ['sawtooth', 'sawtooth', 'sawtooth'], detune: 9, cutoff: 2200, lfo: { rate: 0.25, depth: 600 }, level: 0.2, a: 0.08, r: 0.3, center: 64, octaves: [0], rev: 0.3 },
    arp: { voice: 'pluck', every: 1, pattern: 'up', octaves: 2, base: 72, level: 0.3, gate: 0.6, pan: 0.35, rev: 0.25, del: 0.2 },
    melody: null,
    extras: [],
    fx: { reverb: { decay: 0.35, damp: 0.45, level: 0.7 }, delay: { steps: 6, feedback: 0.3, level: 0.6 }, tone: 0 },
  },

  news: {
    root: 'D', scale: 'minor', prog: [[0, 'min'], [0, 'min'], [8, 'maj'], [7, 'maj']], barsPerChord: 1, swing: 0, humanize: 0,
    drums: { level: 1, rev: 0.1, kick: 'x.x.x.x.x.x.x.x.', snare: '....X.......X..x', hat: 'xxxxxxxxxxxxxxxx' },
    bass: { wave: 'square', cutoff: 1100, level: 0.6, sub: 0.3, pattern: 'rrrrrrrrrrrr5555', gate: 0.5 },
    pad: { waves: ['sawtooth', 'sawtooth'], detune: 6, cutoff: 900, lfo: { rate: 0.5, depth: 300 }, level: 0.25, a: 0.02, r: 0.15, center: 57, octaves: [0], rev: 0.25 },
    arp: null,
    melody: null,
    extras: ['ticker', 'sting', 'timpani'],
    fx: { reverb: { decay: 0.3, damp: 0.5, level: 0.5 }, delay: null, tone: 0 },
  },

  calm: {
    root: 'F', scale: 'pentaMaj', prog: [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']], barsPerChord: 2, swing: 0, humanize: 0.03,
    drums: null,
    bass: { wave: 'triangle', cutoff: 280, level: 0.4, sub: 0.6, pattern: 'r---------------', gate: 0.95, voice: 'soft' },
    pad: { waves: ['triangle', 'triangle'], detune: 5, cutoff: 1400, lfo: { rate: 0.12, depth: 300 }, level: 0.12, a: 1.2, r: 1.5, center: 62, octaves: [0], rev: 0.6 },
    arp: { voice: 'piano', every: 2, pattern: 'updown', octaves: 2, base: 60, level: 0.45, gate: 1.8, pan: -0.15, rev: 0.55, del: 0.1 },
    melody: {
      voice: 'piano', base: 77, level: 0.5, pan: 0.2, rev: 0.6, del: 0.15, gate: 1.4,
      bars: [
        [[0, 8, 2], [8, 4, 1], [12, 4, 0]],
        [[4, 8, 3], [12, 4, 4]],
        [[0, 6, 4], [6, 6, 3], [12, 4, 2]],
        [],
      ],
    },
    extras: [],
    fx: { reverb: { decay: 0.7, damp: 0.3, level: 1.1 }, delay: { steps: 6, feedback: 0.25, level: 0.3 }, tone: 0 },
  },

  lofi: {
    root: 'Eb', scale: 'dorian', prog: [[2, 'min7'], [7, 'dom7'], [0, 'maj7'], [9, 'min7']], barsPerChord: 1, swing: 0.28, humanize: 0.03,
    drums: { level: 0.55, rev: 0.08, kick: ['x.....x...x.....', 'x.....x.....x...'], snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    bass: { wave: 'triangle', cutoff: 320, level: 0.5, sub: 0.7, pattern: 'r-----r---5-----', gate: 0.9 },
    pad: null,
    arp: null,
    chords: { voice: 'epiano', pattern: 'x.......x.....x.', base: 60, level: 0.45, gate: 5, pan: -0.1, rev: 0.3, del: 0.25 },
    melody: {
      voice: 'epiano', base: 72, level: 0.3, pan: 0.25, rev: 0.3, del: 0.3, gate: 2.5,
      bars: [[[2, 4, 4], [6, 4, 2]], [], [[10, 4, 1], [14, 2, 2]], []],
    },
    extras: ['vinyl'],
    fx: { reverb: { decay: 0.35, damp: 0.6, level: 0.5 }, delay: { steps: 6, feedback: 0.35, level: 0.5 }, tone: 5200 },
  },

  corporate: {
    root: 'G', scale: 'major', prog: [[0, 'maj'], [5, 'maj'], [9, 'min'], [7, 'maj']], barsPerChord: 1, swing: 0, humanize: 0.005,
    drums: { level: 0.6, rev: 0.15, kick: 'x.......x.......', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    bass: { wave: 'triangle', cutoff: 420, level: 0.45, sub: 0.5, pattern: 'r...r...5...r...', gate: 0.9 },
    pad: { waves: ['sawtooth', 'triangle'], detune: 7, cutoff: 1500, lfo: { rate: 0.2, depth: 500 }, level: 0.16, a: 0.4, r: 0.6, center: 66, octaves: [0], rev: 0.4 },
    arp: { voice: 'pluck', every: 2, pattern: 'up', octaves: 2, base: 67, level: 0.4, gate: 0.9, pan: 0.3, rev: 0.4, del: 0.25 },
    chords: { voice: 'piano', pattern: 'x.......x.......', base: 60, level: 0.35, gate: 3, pan: -0.2, rev: 0.4, del: 0 },
    melody: null,
    extras: [],
    fx: { reverb: { decay: 0.5, damp: 0.4, level: 0.8 }, delay: { steps: 6, feedback: 0.25, level: 0.5 }, tone: 0 },
  },

  drama: {
    root: 'A', scale: 'minor', prog: [[0, 'min'], [8, 'maj'], [5, 'min'], [7, 'maj']], barsPerChord: 1, swing: 0, humanize: 0.01,
    drums: { level: 0.9, rev: 0.25, kick: 'x..x....x..x....', tom: ['', '..............x.'] },
    bass: { wave: 'sawtooth', cutoff: 180, level: 0.4, sub: 0.9, pattern: 'r---------------', gate: 1 },
    pad: { waves: ['sawtooth', 'sawtooth', 'sawtooth'], detune: 11, cutoff: 520, lfo: { rate: 0.18, depth: 220 }, level: 0.3, a: 0.5, r: 0.8, center: 50, octaves: [0], rev: 0.5 },
    arp: null,
    pulse: { voice: 'lead', every: 2, degreeOffset: 7, base: 57, level: 0.14, gate: 0.4, pan: 0.2, rev: 0.4 },
    melody: null,
    extras: ['riser', 'boom'],
    fx: { reverb: { decay: 0.6, damp: 0.4, level: 0.9 }, delay: null, tone: 0 },
  },

  quiz: {
    root: 'Bb', scale: 'major', prog: [[0, 'maj'], [9, 'min'], [2, 'min'], [7, 'dom7']], barsPerChord: 1, swing: 0, humanize: 0.005,
    drums: { level: 0.8, rev: 0.15, kick: 'x.......x.......', snare: '....x.......x...', tick: 'x.x.x.x.x.x.x.x.' },
    bass: { wave: 'square', cutoff: 600, level: 0.5, sub: 0.4, pattern: 'r.5.o.5.r.3.5.7.', gate: 0.7 },
    pad: null,
    arp: { voice: 'marimba', every: 2, pattern: 'updown', octaves: 2, base: 70, level: 0.45, gate: 0.9, pan: -0.3, rev: 0.25, del: 0.1 },
    melody: null,
    extras: ['ding'],
    fx: { reverb: { decay: 0.35, damp: 0.5, level: 0.6 }, delay: { steps: 4, feedback: 0.2, level: 0.35 }, tone: 0 },
  },

  warning: {
    root: 'C', scale: 'minor', prog: [[0, 'min'], [1, 'min']], barsPerChord: 2, swing: 0, humanize: 0,
    drums: { level: 1, rev: 0.15, kick: 'X...x...X...x...' },
    bass: { wave: 'square', cutoff: 260, level: 0.55, sub: 0.6, pattern: 'r.r.r.r.r.r.r.r.', gate: 0.55 },
    pad: { waves: ['sawtooth', 'sawtooth'], detune: 14, cutoff: 480, lfo: { rate: 0.7, depth: 260 }, level: 0.22, a: 0.3, r: 0.3, center: 55, octaves: [0], rev: 0.35, dissonance: 1 },
    arp: null,
    melody: null,
    extras: ['beep', 'descend'],
    fx: { reverb: { decay: 0.4, damp: 0.5, level: 0.6 }, delay: null, tone: 0 },
  },

  epic: {
    root: 'D', scale: 'minor', prog: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']], barsPerChord: 1, swing: 0, humanize: 0.01,
    drums: { level: 1, rev: 0.35, kick: 'x.......x.......', tom: ['......x.......x.', '......x.....x.x.'], boomKick: true },
    bass: { wave: 'triangle', cutoff: 200, level: 0.45, sub: 0.9, pattern: 'r-------r-------', gate: 0.98 },
    pad: { waves: ['sawtooth', 'sawtooth', 'sawtooth'], detune: 10, cutoff: 1500, lfo: { rate: 0.15, depth: 500 }, level: 0.22, a: 0.9, r: 1.2, center: 62, octaves: [-12, 0, 12], rev: 0.6 },
    arp: null,
    choir: { voice: 'choir', base: 69, level: 0.12, pan: 0.2, rev: 0.7 },
    melody: {
      voice: 'brass', base: 62, level: 0.32, pan: -0.1, rev: 0.55, del: 0, gate: 0.95,
      bars: [[[0, 8, 0], [8, 8, 4]], [[0, 8, 5], [8, 8, 4]], [[0, 12, 7], [12, 4, 6]], [[0, 16, 4]]],
    },
    extras: ['cymbal'],
    fx: { reverb: { decay: 0.9, damp: 0.35, level: 1.2 }, delay: null, tone: 0 },
  },

  playful: {
    root: 'C', scale: 'pentaMaj', prog: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']], barsPerChord: 1, swing: 0.18, humanize: 0.02,
    drums: { level: 0.6, rev: 0.12, kick: 'x.......x.......', clap: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' },
    bass: { wave: 'triangle', cutoff: 380, level: 0.45, sub: 0.3, pattern: 'r.......5.......', gate: 0.5, voice: 'pluck' },
    pad: null,
    arp: null,
    strum: { voice: 'uke', pattern: 'D.du.udu', base: 60, level: 0.4, gate: 0.6, pan: -0.25, rev: 0.25 },
    melody: {
      voice: 'whistle', base: 84, level: 0.22, pan: 0.3, rev: 0.35, del: 0.15, gate: 0.8,
      bars: [[[0, 2, 0], [2, 2, 1], [4, 4, 2], [8, 2, 4], [10, 2, 3], [12, 4, 2]], [[0, 2, 2], [2, 2, 3], [4, 4, 4], [8, 8, 2]], [[0, 2, 4], [2, 2, 3], [4, 2, 2], [6, 2, 1], [8, 8, 0]], []],
    },
    extras: ['glock'],
    fx: { reverb: { decay: 0.3, damp: 0.5, level: 0.6 }, delay: { steps: 6, feedback: 0.2, level: 0.35 }, tone: 0 },
  },
};

// ── 작은 도우미 ─────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const midiToHz = (n) => 440 * 2 ** ((n - 69) / 12);
const dbToGain = (db) => 10 ** (db / 20);

/** 결정적 난수(mulberry32) — 같은 시드면 같은 소리 */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function patternFor(pat, bar) {
  if (!pat) return '';
  return Array.isArray(pat) ? (pat[bar % pat.length] || '') : pat;
}

/** 코드 음(절대 MIDI)을 center±6 범위로 모아 정렬 */
function voiceChord(rootMidi, intervals, center) {
  const out = intervals.map((iv) => {
    let n = rootMidi + iv;
    while (n > center + 6) n -= 12;
    while (n < center - 6) n += 12;
    return n;
  });
  return [...new Set(out)].sort((a, b) => a - b);
}

/** 코드 음을 base 부터 octaves 옥타브에 걸쳐 위로 펼침(아르페지오용) */
function spreadChord(rootMidi, intervals, base, octaves) {
  const one = [...new Set(intervals.map((iv) => { let n = rootMidi + iv; while (n >= base + 12) n -= 12; while (n < base) n += 12; return n; }))].sort((a, b) => a - b);
  const out = [];
  for (let o = 0; o < octaves; o++) one.forEach((n) => out.push(n + 12 * o));
  return out;
}

/** 음계 도수(0=근음, 음수·7이상은 옥타브 넘김) → MIDI */
function degreeToMidi(base, scale, deg) {
  const len = scale.length;
  const oct = Math.floor(deg / len);
  const idx = ((deg % len) + len) % len;
  return base + 12 * oct + scale[idx];
}

/** 엔벨로프: 선형 어택 → 지수 디케이(서스테인) → dur 뒤 릴리즈. 끝나는 시각을 돌려줍니다. */
function envelope(param, t, { a = 0.005, d = 0.2, s = 0, r = 0.08, dur = 0.2, peak = 1 }) {
  const top = Math.max(1e-4, peak);
  const sus = Math.max(1e-4, top * s);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(top, t + a);
  param.exponentialRampToValueAtTime(sus, t + a + d);
  const off = t + Math.max(a + 0.005, dur);
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(off);
  else param.setValueAtTime(sus, off);
  param.exponentialRampToValueAtTime(1e-4, off + r);
  return off + r;
}

/** 컨볼루션 리버브용 임펄스(스테레오 노이즈, 지수 감쇠 + 한 극 로우패스로 부드럽게) */
function makeImpulse(ctx, rng, seconds, decay, damp) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const k = clamp(1 - damp, 0.05, 1); // damp 가 크면 고음이 빨리 죽음
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const x = (rng() * 2 - 1) * Math.exp(-t / decay);
      y += k * (x - y);
      ch[i] = y * (i < 200 ? i / 200 : 1); // 첫 5ms 는 살짝 올려서 클릭 방지
    }
  }
  return buf;
}

// ── 표본 단위 DSP(드럼·노이즈 효과용) ───────────────────
/** 2차 필터(RBJ 쿡북) */
class Biquad {
  constructor(type, f0, q, sr) {
    this.z1 = 0; this.z2 = 0;
    const w0 = (2 * Math.PI * Math.min(f0, sr * 0.45)) / sr;
    const cos = Math.cos(w0); const sin = Math.sin(w0); const alpha = sin / (2 * q);
    let b0; let b1; let b2;
    if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
    else if (type === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; } // bandpass(피크 0dB)
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** 스테레오 트랙: 소리 조각을 t초 위치에 더해 넣습니다(드럼·효과). 나중에 AudioBuffer 하나로 재생. */
class Track {
  constructor(sr, frames, rng) {
    this.sr = sr; this.rng = rng;
    this.L = new Float32Array(frames); this.R = new Float32Array(frames);
    this.used = false;
  }
  noise() { return this.rng() * 2 - 1; }
  /** gen(k) 가 k번째 표본을 돌려주는 조각을 n표본 길이로 더함 */
  add(t, n, gen, level = 1, pan = 0) {
    const start = Math.round(t * this.sr);
    const end = Math.min(this.L.length, start + n);
    if (end <= start) return;
    const ang = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
    const gl = level * Math.cos(ang); const gr = level * Math.sin(ang);
    const { L, R } = this;
    for (let i = start, k = 0; i < end; i++, k++) { const v = gen(k); L[i] += v * gl; R[i] += v * gr; }
    this.used = true;
  }

  // 킥: 사인 피치 드롭 + 짧은 클릭
  kick(t, { level = 1, pitch = 150, drop = 45, decay = 0.28 } = {}) {
    const sr = this.sr; let ph = 0;
    const n = Math.ceil((decay + 0.05) * sr);
    const click = new Biquad('highpass', 2000, 0.7, sr);
    this.add(t, n, (k) => {
      const s = k / sr;
      const f = drop + (pitch - drop) * Math.exp(-s / 0.022);
      ph += (2 * Math.PI * f) / sr;
      const body = Math.sin(ph) * Math.exp((-4.6 * s) / decay);
      const c = s < 0.012 ? click.run(this.noise()) * Math.exp(-s / 0.003) * 0.4 : 0;
      return body * 0.9 + c;
    }, level);
  }

  // 스네어: 노이즈 밴드패스 + 몸통 톤
  snare(t, { level = 1, tone = 1800, decay = 0.16 } = {}) {
    const sr = this.sr; let ph = 0;
    const bp = new Biquad('bandpass', tone, 0.7, sr);
    const n = Math.ceil((decay + 0.05) * sr);
    this.add(t, n, (k) => {
      const s = k / sr;
      const f = 120 + 80 * Math.exp(-s / 0.03);
      ph += (2 * Math.PI * f) / sr;
      return bp.run(this.noise()) * Math.exp((-4.6 * s) / decay) * 0.8 + Math.sin(ph) * Math.exp(-s / 0.03) * 0.45;
    }, level);
  }

  // 클랩: 노이즈 버스트 세 번
  clap(t, { level = 1 } = {}) {
    const sr = this.sr;
    const bp = new Biquad('bandpass', 1500, 1, sr);
    const n = Math.ceil(0.25 * sr);
    this.add(t, n, (k) => {
      const s = k / sr;
      let env = 0;
      for (let i = 0; i < 3; i++) { const d = s - i * 0.011; if (d >= 0) env = Math.max(env, Math.exp(-d / (i === 2 ? 0.06 : 0.008)) * (i === 2 ? 1 : 0.7)); }
      return bp.run(this.noise()) * env;
    }, level * 0.6, 0.1);
  }

  // 하이햇: 노이즈 하이패스 짧게(open 이면 길게)
  hat(t, { level = 1, open = false } = {}) {
    const sr = this.sr;
    const decay = open ? 0.28 : 0.045;
    const hp = new Biquad('highpass', 7000, 0.7, sr);
    const n = Math.ceil((decay + 0.03) * sr);
    this.add(t, n, (k) => hp.run(this.noise()) * Math.exp((-4.6 * (k / sr)) / decay), level * 0.3, 0.3);
  }

  // 시계 틱(나무 블록)
  tick(t, { level = 1 } = {}) {
    const sr = this.sr; let ph = 0;
    const bp = new Biquad('bandpass', 3500, 2, sr);
    const n = Math.ceil(0.05 * sr);
    this.add(t, n, (k) => {
      const s = k / sr;
      const f = 1500 + 600 * Math.exp(-s / 0.01);
      ph += (2 * Math.PI * f) / sr;
      return Math.sin(ph) * Math.exp(-s / 0.012) * 0.6 + bp.run(this.noise()) * Math.exp(-s / 0.004) * 0.5;
    }, level, -0.4);
  }

  // 셰이커
  shaker(t, { level = 1 } = {}) {
    const sr = this.sr;
    const bp = new Biquad('bandpass', 6500, 1.2, sr);
    const n = Math.ceil(0.12 * sr);
    this.add(t, n, (k) => {
      const s = k / sr;
      const env = s < 0.012 ? s / 0.012 : Math.exp(-(s - 0.012) / 0.025);
      return bp.run(this.noise()) * env;
    }, level * 0.3, 0.45);
  }

  // 탐(낮은 북)
  tom(t, { level = 1, pitch = 110, decay = 0.4 } = {}) {
    const sr = this.sr; let ph = 0;
    const lp = new Biquad('lowpass', 900, 0.7, sr);
    const n = Math.ceil((decay + 0.05) * sr);
    this.add(t, n, (k) => {
      const s = k / sr;
      const f = pitch * 0.8 + pitch * 0.6 * Math.exp(-s / 0.05);
      ph += (2 * Math.PI * f) / sr;
      return Math.sin(ph) * Math.exp((-4.6 * s) / decay) * 0.8 + (s < 0.06 ? lp.run(this.noise()) * Math.exp(-s / 0.015) * 0.35 : 0);
    }, level, -0.2);
  }

  // 심벌
  cymbal(t, { level = 1, decay = 1.4 } = {}) {
    const sr = this.sr;
    const hp = new Biquad('highpass', 4500, 0.7, sr);
    const n = Math.ceil((decay + 0.1) * sr);
    this.add(t, n, (k) => hp.run(this.noise()) * Math.exp((-4.6 * (k / sr)) / decay), level * 0.22, 0.2);
  }

  // 밴드패스 노이즈 상승(드라마 라이저)
  riser(t, dur, { level = 0.3 } = {}) {
    const sr = this.sr;
    const n = Math.ceil((dur + 0.1) * sr);
    const bp = new Biquad('bandpass', 220, 2.5, sr);
    let fPrev = 220;
    this.add(t, n, (k) => {
      const s = k / sr;
      const p = clamp(s / dur, 0, 1);
      const f = 220 * (3800 / 220) ** p;
      if (k % 256 === 0 && Math.abs(f - fPrev) > 2) { // 필터 계수를 가끔 갱신(상태는 유지)
        const nb = new Biquad('bandpass', f, 2.5, sr); nb.z1 = bp.z1; nb.z2 = bp.z2;
        bp.b0 = nb.b0; bp.b1 = nb.b1; bp.b2 = nb.b2; bp.a1 = nb.a1; bp.a2 = nb.a2; fPrev = f;
      }
      const env = s <= dur ? 0.0001 * (1 / 0.0001) ** p : Math.exp(-(s - dur) / 0.03);
      return bp.run(this.noise()) * env;
    }, level, 0.1);
  }

  // 레코드 잡음(랜덤 클릭) + 테이프 히스
  vinyl(t0, t1, { level = 0.12 } = {}) {
    const sr = this.sr;
    const lp = new Biquad('lowpass', 4000, 0.7, sr);
    this.add(t0, Math.ceil((t1 - t0) * sr), () => lp.run(this.noise()), level * 0.12);
    let t = t0 + this.rng() * 0.2;
    while (t < t1) {
      const bp = new Biquad('bandpass', 2500 + this.rng() * 2500, 1.5, sr);
      const d = 0.004 + this.rng() * 0.006;
      const amp = 0.5 + this.rng() * 0.5;
      this.add(t, Math.ceil(d * 4 * sr), (k) => bp.run(this.noise()) * Math.exp(-(k / sr) / d) * amp, level, this.rng() * 0.8 - 0.4);
      t += 0.05 + this.rng() * 0.35;
    }
  }
}

// ── 합성 장치(노드 그래프) ────────────────────────────────
const HARMONICS = 40;

/** 부분음 목록 → PeriodicWave 계수(실수·허수) */
function waveCoefficients(partials) {
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  for (const [h0, lvl, wave] of partials) {
    const base = Math.max(1, Math.round(h0));
    if (wave === 'sine') { if (base <= HARMONICS) imag[base] += lvl; continue; }
    for (let n = 1; base * n <= HARMONICS; n++) {
      const h = base * n;
      if (wave === 'sawtooth') imag[h] += (lvl * (2 / Math.PI) * (n % 2 ? 1 : -1)) / n;
      else if (wave === 'square') { if (n % 2) imag[h] += (lvl * (4 / Math.PI)) / n; }
      else if (wave === 'triangle') { if (n % 2) { const sign = ((n - 1) / 2) % 2 ? -1 : 1; imag[h] += (lvl * (8 / (Math.PI * Math.PI)) * sign) / (n * n); } }
    }
  }
  return { real, imag };
}

class Synth {
  constructor(ctx, recipe, rng, seconds, stepSec) {
    this.ctx = ctx;
    this.recipe = recipe;
    this.rng = rng;
    this.end = seconds;
    this.stepSec = stepSec;
    this.waves = new Map(); // 음색 → PeriodicWave
    this.strips = new Map(); // 악기 묶음(팬·센드 공유) → GainNode
    const frames = Math.ceil(seconds * ctx.sampleRate);
    this.drums = new Track(ctx.sampleRate, frames, rng);
    this.fxTrack = new Track(ctx.sampleRate, frames, rng);

    // 마스터: 합 → (로파이 톤) → 컴프레서 → 출력
    this.sum = ctx.createGain();
    let node = this.sum;
    if (recipe.fx.tone) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = recipe.fx.tone; lp.Q.value = 0.4;
      node.connect(lp); node = lp;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
    node.connect(comp);
    comp.connect(ctx.destination);

    // 리버브 버스
    const rv = recipe.fx.reverb;
    this.revBus = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, rng, 1.5, rv.decay, rv.damp);
    const revRet = ctx.createGain(); revRet.gain.value = rv.level;
    this.revBus.connect(conv); conv.connect(revRet); revRet.connect(this.sum);

    // 딜레이 버스(피드백 + 로우패스)
    const dl = recipe.fx.delay;
    this.delBus = null;
    if (dl) {
      this.delBus = ctx.createGain();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = dl.steps * stepSec;
      const fb = ctx.createGain(); fb.gain.value = dl.feedback;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const ret = ctx.createGain(); ret.gain.value = dl.level;
      this.delBus.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay);
      delay.connect(ret); ret.connect(this.sum);
    }
  }

  /** 같은 팬·센드를 쓰는 악기 묶음 하나(GainNode). 음 하나마다 노드를 늘리지 않으려고 공유합니다. */
  strip(name, { pan = 0, rev = 0, del = 0 } = {}) {
    const key = `${name}|${pan.toFixed(2)}|${rev}|${del}`;
    let g = this.strips.get(key);
    if (g) return g;
    const ctx = this.ctx;
    g = ctx.createGain();
    let last = g;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      g.connect(p); last = p;
    }
    last.connect(this.sum);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; last.connect(s); s.connect(this.revBus); }
    if (del > 0 && this.delBus) { const s = ctx.createGain(); s.gain.value = del; last.connect(s); s.connect(this.delBus); }
    this.strips.set(key, g);
    return g;
  }

  wave(name, partials) {
    let w = this.waves.get(name);
    if (!w) {
      const { real, imag } = waveCoefficients(partials);
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(name, w);
    }
    return w;
  }

  /** 표본 트랙(드럼·효과)을 BufferSource 하나로 그래프에 붙입니다. 모든 음을 다 그린 뒤 한 번 호출. */
  commitTracks() {
    const ctx = this.ctx;
    const attach = (track, opts) => {
      if (!track.used) return;
      const buf = ctx.createBuffer(2, track.L.length, ctx.sampleRate);
      buf.copyToChannel(track.L, 0); buf.copyToChannel(track.R, 1);
      const src = ctx.createBufferSource(); src.buffer = buf;
      src.connect(this.strip(opts.name, opts));
      src.start(0);
    };
    attach(this.drums, { name: 'drums', rev: this.recipe.drums?.rev ?? 0.15 });
    attach(this.fxTrack, { name: 'fx', rev: 0.4 });
  }

  /** 음정 악기 한 음. dur 는 서스테인 길이(초). */
  tone(t, dur, midi, voiceName, { level = 0.3, pan = 0, rev = 0.2, del = 0, glideFrom = null, detune = 0 } = {}) {
    const ctx = this.ctx;
    const v = VOICES[voiceName] || VOICES.lead;
    const hz = midiToHz(midi + 12 * (v.octave || 0));
    if (hz > ctx.sampleRate * 0.45) return;
    const env = ctx.createGain();
    const endAt = envelope(env.gain, t, { a: v.a, d: v.d, s: v.s, r: v.r, dur, peak: level });
    let head = env;
    if (v.filter) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = v.filter.q ?? 0.7;
      const base = Math.min(v.filter.freq, ctx.sampleRate * 0.45);
      if (v.filter.env) {
        f.frequency.setValueAtTime(Math.min(base * v.filter.env, ctx.sampleRate * 0.45), t);
        f.frequency.exponentialRampToValueAtTime(base, t + (v.filter.fall || 0.2));
      } else f.frequency.value = base;
      f.connect(env); head = f;
    }
    env.connect(this.strip(voiceName, { pan, rev, del }));
    let lfo = null;
    if (v.vib) {
      lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = v.vib.rate;
      const lg = ctx.createGain(); lg.gain.value = v.vib.cents; lfo.connect(lg);
      lfo.start(t); lfo.stop(endAt);
      lfo.depth = lg;
    }
    const startOsc = (osc, f0) => {
      if (glideFrom != null) {
        osc.frequency.setValueAtTime(midiToHz(glideFrom + 12 * (v.octave || 0)) * (f0 / hz), t);
        osc.frequency.exponentialRampToValueAtTime(f0, t + 0.08);
      } else osc.frequency.value = f0;
      if (lfo) lfo.depth.connect(osc.detune);
      osc.connect(head); osc.start(t); osc.stop(endAt);
    };
    const count = v.unison?.count || 1;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.wave(voiceName, v.partials));
      osc.detune.value = detune + (count > 1 ? (i - (count - 1) / 2) * v.unison.cents : 0);
      startOsc(osc, hz);
    }
    (v.inharmonic || []).forEach(([ratio, lvl]) => {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      const g = ctx.createGain(); g.gain.value = lvl;
      osc.connect(g); g.connect(head);
      osc.frequency.value = hz * ratio; osc.start(t); osc.stop(endAt);
    });
  }

  /** 베이스 한 음: 파형 + 서브 사인을 한 PeriodicWave 로 → 로우패스(살짝 열리고 닫힘) → 엔벨로프 */
  bass(t, dur, midi, spec) {
    const ctx = this.ctx;
    const hz = midiToHz(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
    lp.frequency.setValueAtTime(spec.cutoff * 2.2, t);
    lp.frequency.exponentialRampToValueAtTime(spec.cutoff, t + 0.12);
    const env = ctx.createGain();
    const soft = spec.voice === 'soft';
    const endAt = envelope(env.gain, t, { a: soft ? 0.08 : 0.004, d: soft ? 0.6 : 0.25, s: 0.75, r: soft ? 0.3 : 0.06, dur, peak: spec.level });
    lp.connect(env);
    env.connect(this.strip('bass', { rev: 0.03 }));
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave(`bass|${spec.wave}|${spec.sub}`, [[1, spec.wave === 'square' ? 0.45 : 0.8, spec.wave], [1, spec.sub, 'sine']]));
    osc.frequency.value = hz;
    osc.connect(lp); osc.start(t); osc.stop(endAt);
  }

  /** 코드 패드: 디튠 톱니 여러 개 → 로우패스(느린 LFO) → 느린 어택 */
  pad(t, dur, midis, spec) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = spec.cutoff; lp.Q.value = 0.9;
    const env = ctx.createGain();
    const endAt = envelope(env.gain, t, { a: spec.a, d: 0.4, s: 0.85, r: spec.r, dur, peak: spec.level });
    lp.connect(env);
    env.connect(this.strip('pad', { rev: spec.rev }));
    if (spec.lfo) {
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = spec.lfo.rate;
      const lg = ctx.createGain(); lg.gain.value = spec.lfo.depth;
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); lfo.stop(endAt);
    }
    const detunes = spec.waves.length === 1 ? [0] : spec.waves.map((_, i) => (i - (spec.waves.length - 1) / 2) * spec.detune);
    const octaves = spec.octaves || [0];
    const n = midis.length * detunes.length * octaves.length;
    const inner = ctx.createGain(); inner.gain.value = 1 / Math.sqrt(n); inner.connect(lp);
    const outer = ctx.createGain(); outer.gain.value = 0.6 / Math.sqrt(n); outer.connect(lp);
    midis.forEach((m) => octaves.forEach((oct) => spec.waves.forEach((wave, i) => {
      const osc = ctx.createOscillator(); osc.type = wave;
      osc.frequency.value = midiToHz(m + oct);
      osc.detune.value = detunes[i] + (spec.dissonance ? (i % 2 ? 30 : -30) * spec.dissonance : 0);
      osc.connect(oct === 0 ? inner : outer); osc.start(t); osc.stop(endAt);
    })));
  }
}

// ── 시퀀서 ─────────────────────────────────────────────
function scheduleMood(synth, mood, recipe, seconds, rng) {
  const stepSec = 60 / mood.bpm / 4;
  const barSec = stepSec * 16;
  const rootMidi = KEY_ROOT[recipe.root];
  const scale = SCALES[recipe.scale];
  const totalBars = Math.ceil(seconds / barSec) + 1;
  const hum = recipe.humanize || 0;
  const swing = recipe.swing || 0;
  // 스텝 i 의 실제 시각(스윙·사람 느낌 반영)
  const at = (bar, step, extraHum = 1) => {
    let t = bar * barSec + step * stepSec;
    if (swing && step % 2 === 1) t += swing * stepSec;
    if (hum) t += (rng() - 0.5) * 2 * hum * stepSec * extraHum;
    return Math.max(0, t);
  };
  const vel = (ch, spread = 0.1) => (ch === 'X' ? 1.25 : 1) * (1 - spread + rng() * spread * 2);
  const dr = synth.drums;

  let arpIdx = 0;
  for (let bar = 0; bar < totalBars; bar++) {
    const t0 = bar * barSec;
    if (t0 >= seconds) break;
    const chordIdx = Math.floor(bar / recipe.barsPerChord) % recipe.prog.length;
    const [offset, type] = recipe.prog[chordIdx];
    const chordRoot = rootMidi + offset;
    const intervals = CHORDS[type];
    const chordStartsHere = bar % recipe.barsPerChord === 0;
    const chordDur = barSec * recipe.barsPerChord;

    // 드럼(표본 트랙에 바로 그림)
    const d = recipe.drums;
    if (d) {
      const lv = d.level ?? 1;
      const run = (name, fn) => {
        const pat = patternFor(d[name], bar);
        for (let i = 0; i < 16 && i < pat.length; i++) {
          const ch = pat[i];
          if (ch === '.' || ch === ' ' || !ch) continue;
          const t = at(bar, i, 0.5);
          if (t >= seconds) continue;
          fn(t, ch, i);
        }
      };
      run('kick', (t, ch) => dr.kick(t, d.boomKick
        ? { level: lv * vel(ch, 0.05), pitch: 110, drop: 36, decay: 0.75 }
        : { level: lv * vel(ch, 0.05) }));
      run('snare', (t, ch) => dr.snare(t, { level: lv * vel(ch) }));
      run('clap', (t, ch) => dr.clap(t, { level: lv * vel(ch) }));
      run('hat', (t, ch, i) => dr.hat(t, { level: lv * vel(ch, 0.25) * (i % 4 === 0 ? 1 : 0.7) }));
      run('ohat', (t, ch) => dr.hat(t, { level: lv * vel(ch) * 0.8, open: true }));
      run('tick', (t, ch, i) => dr.tick(t, { level: lv * vel(ch, 0.05) * (i % 4 === 0 ? 1 : 0.65) }));
      run('shaker', (t, ch, i) => dr.shaker(t, { level: lv * vel(ch, 0.2) * (i % 4 === 2 ? 1 : 0.6) }));
      run('tom', (t, ch, i) => dr.tom(t, { level: lv * vel(ch), pitch: i % 8 < 4 ? 95 : 75, decay: 0.5 }));
    }

    // 베이스
    const b = recipe.bass;
    if (b) {
      const pat = patternFor(b.pattern, bar);
      let bassRoot = chordRoot - 24;
      while (bassRoot > 50) bassRoot -= 12;
      while (bassRoot < 34) bassRoot += 12;
      for (let i = 0; i < 16 && i < pat.length; i++) {
        const ch = pat[i];
        if (ch === '.' || ch === '-') continue;
        let len = 1;
        while (i + len < pat.length && pat[i + len] === '-') len++;
        const t = at(bar, i, 0.3);
        if (t >= seconds) continue;
        const pick = { r: 0, 5: 7, o: 12, 3: intervals[1] ?? 4, 7: intervals[3] ?? 10, l: -12 }[ch] ?? 0;
        const midi = bassRoot + pick;
        const dur = Math.max(0.05, len * stepSec * b.gate);
        if (b.voice === 'pluck') synth.tone(t, dur, midi + 12, 'pluck', { level: b.level * 1.1, rev: 0.05 });
        else synth.bass(t, dur, midi, b);
      }
    }

    // 패드(코드가 바뀌는 마디에서 코드 길이만큼)
    if (recipe.pad && chordStartsHere) {
      const midis = voiceChord(chordRoot, intervals, recipe.pad.center);
      synth.pad(t0, chordDur * 0.98, midis, recipe.pad);
    }

    // 합창풍 패드(웅장)
    if (recipe.choir && chordStartsHere) {
      const c = recipe.choir;
      voiceChord(chordRoot, intervals, c.base).forEach((m, i) => synth.tone(t0, chordDur * 0.95, m, c.voice, { level: c.level, pan: c.pan * (i % 2 ? -1 : 1), rev: c.rev, detune: (i - 1) * 6 }));
    }

    // 코드 스탭(피아노·전자피아노)
    if (recipe.chords) {
      const c = recipe.chords;
      const pat = patternFor(c.pattern, bar);
      const midis = voiceChord(chordRoot, intervals, c.base);
      for (let i = 0; i < 16 && i < pat.length; i++) {
        if (pat[i] === '.') continue;
        const t = at(bar, i, 0.4);
        if (t >= seconds) continue;
        midis.forEach((m, k) => synth.tone(t + k * 0.008, c.gate * stepSec, m, c.voice, { level: c.level / Math.sqrt(midis.length), pan: c.pan, rev: c.rev, del: c.del }));
      }
    }

    // 아르페지오
    if (recipe.arp) {
      const a = recipe.arp;
      const notes = spreadChord(chordRoot, intervals, a.base, a.octaves);
      const len = notes.length;
      for (let i = 0; i < 16; i += a.every) {
        const t = at(bar, i, 0.5);
        if (t >= seconds) continue;
        let idx;
        if (a.pattern === 'down') idx = (len - 1) - (arpIdx % len);
        else if (a.pattern === 'updown') { const cyc = Math.max(1, 2 * len - 2); const k = arpIdx % cyc; idx = k < len ? k : cyc - k; }
        else if (a.pattern === 'random') idx = Math.floor(rng() * len);
        else idx = arpIdx % len;
        arpIdx++;
        synth.tone(t, a.gate * stepSec * a.every, notes[idx], a.voice, { level: a.level * (i % 4 === 0 ? 1 : 0.8), pan: a.pan * (idx % 2 ? -1 : 1), rev: a.rev, del: a.del });
      }
    }

    // 긴장 펄스(5도 반복음)
    if (recipe.pulse) {
      const p = recipe.pulse;
      let m = chordRoot + p.degreeOffset;
      while (m > p.base + 12) m -= 12;
      while (m < p.base) m += 12;
      for (let i = 0; i < 16; i += p.every) {
        const t = at(bar, i, 0.3);
        if (t >= seconds) continue;
        synth.tone(t, p.gate * stepSec * p.every, m, p.voice, { level: p.level * (i % 4 === 0 ? 1 : 0.7), pan: p.pan * (i % 4 ? -1 : 1), rev: p.rev });
      }
    }

    // 우쿨렐레 스트럼(8분음표 8칸: D=세게 아래 d=아래 u=위 .=쉼)
    if (recipe.strum) {
      const s = recipe.strum;
      const pat = patternFor(s.pattern, bar);
      const midis = voiceChord(chordRoot, intervals, s.base + 6);
      for (let i = 0; i < 8 && i < pat.length; i++) {
        const ch = pat[i];
        if (ch === '.') continue;
        const t = at(bar, i * 2, 0.5);
        if (t >= seconds) continue;
        const order = ch === 'u' ? [...midis].reverse() : midis;
        const lv = s.level * (ch === 'D' ? 1 : ch === 'u' ? 0.6 : 0.8);
        order.forEach((m, k) => synth.tone(t + k * 0.014, s.gate * stepSec * 2, m, s.voice, { level: lv / Math.sqrt(order.length), pan: s.pan + k * 0.08, rev: s.rev }));
      }
    }

    // 선율
    if (recipe.melody) {
      const ml = recipe.melody;
      const notesInBar = ml.bars[bar % ml.bars.length] || [];
      notesInBar.forEach(([step, len, deg]) => {
        const t = at(bar, step, 0.4);
        if (t >= seconds) return;
        const midi = degreeToMidi(ml.base, scale, deg);
        synth.tone(t, len * stepSec * ml.gate, midi, ml.voice, { level: ml.level, pan: ml.pan, rev: ml.rev, del: ml.del || 0 });
      });
    }

    // 분위기별 부가 효과
    for (const name of recipe.extras || []) {
      const fx = EXTRAS[name];
      if (fx) fx({ synth, bar, t0, at, chordRoot, intervals, stepSec, barSec, seconds, rng, chordStartsHere, chordDur });
    }
  }
  synth.commitTracks();
}

// 부가 효과: 마디마다 호출됩니다.
const EXTRAS = {
  // 뉴스 티커: 고음 사인 16분음표 펄스, 좌우 번갈아
  ticker({ synth, bar, at, chordRoot, seconds }) {
    for (let i = 0; i < 16; i++) {
      const t = at(bar, i, 0);
      if (t >= seconds) continue;
      synth.tone(t, 0.02, chordRoot + 36 + (i % 4 === 0 ? 0 : i % 4 === 2 ? 7 : 12), 'ticker', { level: 0.11, pan: i % 2 ? 0.5 : -0.5, rev: 0.1 });
    }
  },
  // 뉴스 금관 스팁: 두 마디마다 첫 박, 네 마디마다 3박에 한 번 더
  sting({ synth, bar, t0, chordRoot, intervals, stepSec, seconds }) {
    if (bar % 2 !== 0 || t0 >= seconds) return;
    voiceChord(chordRoot, intervals, 62).forEach((m, k) => synth.tone(t0 + k * 0.01, stepSec * 3, m, 'brass', { level: 0.22, pan: (k - 1) * 0.3, rev: 0.4 }));
    if (bar % 4 === 0) synth.tone(t0 + stepSec * 8, stepSec * 2, chordRoot + 12, 'brass', { level: 0.2, rev: 0.4 });
  },
  // 팀파니(뉴스): 두 마디마다 첫 박 저음 북
  timpani({ synth, bar, t0, seconds }) {
    if (bar % 2 !== 0 || t0 >= seconds) return;
    synth.drums.tom(t0, { level: 1, pitch: 70, decay: 0.7 });
  },
  // 드라마 라이저: 4마디 주기의 3·4번째 마디 동안 상승
  riser({ synth, bar, t0, barSec, seconds }) {
    if (bar % 4 !== 2 || t0 >= seconds) return;
    synth.fxTrack.riser(t0, barSec * 2, { level: 0.28 });
  },
  // 드라마 붐: 4마디 주기 첫 박 깊은 북 + 심벌
  boom({ synth, bar, t0, seconds }) {
    if (bar % 4 !== 0 || t0 >= seconds) return;
    synth.drums.kick(t0, { level: 1.1, pitch: 95, drop: 34, decay: 0.9 });
    synth.drums.cymbal(t0, { level: 0.5, decay: 1.8 });
  },
  // 퀴즈 종: 4마디마다 첫 박 벨 두 음
  ding({ synth, bar, t0, chordRoot, stepSec, seconds }) {
    if (bar % 4 !== 0 || t0 >= seconds) return;
    synth.tone(t0, stepSec * 2, chordRoot + 24, 'bell', { level: 0.35, pan: 0.3, rev: 0.5 });
    synth.tone(t0 + stepSec * 2, stepSec * 2, chordRoot + 31, 'bell', { level: 0.3, pan: -0.3, rev: 0.5 });
  },
  // 경고 비프: 박마다, 마디에 따라 두 음 번갈아
  beep({ synth, bar, at, seconds }) {
    const midi = bar % 2 ? 78 : 81; // F#5 / A5
    for (let i = 0; i < 16; i += 4) {
      const t = at(bar, i, 0);
      if (t >= seconds) continue;
      synth.tone(t, 0.1, midi, 'beep', { level: 0.16, pan: i % 8 ? 0.4 : -0.4, rev: 0.3 });
      if (i === 0 || i === 8) synth.tone(t + 0.16, 0.08, midi, 'beep', { level: 0.12, pan: i % 8 ? 0.4 : -0.4, rev: 0.3 });
    }
  },
  // 경고 하강음: 두 마디마다 반음 내려가는 금관
  descend({ synth, bar, t0, chordRoot, stepSec, seconds }) {
    if (bar % 2 !== 1 || t0 >= seconds) return;
    const t = t0 + stepSec * 8;
    if (t >= seconds) return;
    synth.tone(t, stepSec * 6, chordRoot + 7, 'brass', { level: 0.18, rev: 0.4, glideFrom: chordRoot + 9 });
  },
  // 웅장 심벌: 4마디마다 첫 박
  cymbal({ synth, bar, t0, seconds }) {
    if (bar % 4 !== 0 || t0 >= seconds) return;
    synth.drums.cymbal(t0, { level: 0.8, decay: 2 });
  },
  // 로파이 레코드 잡음(마디 단위로 깔아 둠)
  vinyl({ synth, t0, barSec, seconds }) {
    synth.fxTrack.vinyl(t0, Math.min(seconds, t0 + barSec), { level: 0.14 });
  },
  // 장난스러운 글로켄: 두 마디마다 4박째 반짝
  glock({ synth, bar, at, chordRoot, intervals, stepSec, seconds, rng }) {
    if (bar % 2 !== 1) return;
    const t = at(bar, 12, 0);
    if (t >= seconds) return;
    const m = chordRoot + 24 + intervals[Math.floor(rng() * intervals.length)];
    synth.tone(t, stepSec * 2, m, 'bell', { level: 0.18, pan: 0.4, rev: 0.4 });
  },
};

// ── 렌더 후처리(표본 단위) ──────────────────────────────
const TARGET_RMS_DB = -17;
const CEILING = dbToGain(-1); // 피크 상한(-1dBFS)

/** 모든 채널의 RMS·피크 */
function measure(chs) {
  let sum = 0; let peak = 0; let n = 0;
  for (const ch of chs) {
    for (let i = 0; i < ch.length; i++) { const v = ch[i]; sum += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
    n += ch.length;
  }
  return { rms: Math.sqrt(sum / Math.max(1, n)), peak };
}

/** 상한의 60% 위부터 부드럽게 눌러 ceiling 아래로 */
function softLimit(v, ceiling) {
  const knee = 0.6 * ceiling;
  const a = Math.abs(v);
  if (a <= knee) return v;
  const span = ceiling - knee;
  const y = knee + span * Math.tanh((a - knee) / span);
  return v < 0 ? -y : y;
}

/**
 * 렌더 결과를 정리합니다: (루프면 꼬리를 머리에 접기) → RMS 정규화 → 소프트 리미터 → 페이드.
 * @returns {AudioBuffer} 정확히 frames 길이
 */
function finalize(ctx, rendered, frames, { fadeIn, fadeOut, loop, sampleRate }) {
  const out = ctx.createBuffer(rendered.numberOfChannels, frames, sampleRate);
  const chs = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const src = rendered.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, frames));
    if (loop) {
      // 꼬리(잔향·딜레이)를 머리에 겹쳐 이음새 없는 루프로
      const tail = src.length - frames;
      for (let i = 0; i < tail && i < frames; i++) dst[i] += src[frames + i] * (1 - i / tail);
    }
    chs.push(dst);
  }
  const m = measure(chs);
  let gain = m.rms > 1e-6 ? dbToGain(TARGET_RMS_DB) / m.rms : 1;
  gain = Math.min(gain, (CEILING * 1.35) / Math.max(1e-6, m.peak)); // 리미터가 눌러줄 여유만큼만 허용
  for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] = softLimit(ch[i] * gain, CEILING);
  const after = measure(chs);
  if (after.peak > CEILING) { const s = CEILING / after.peak; for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= s; }
  if (!loop) {
    const fi = Math.min(frames, Math.floor(fadeIn * sampleRate));
    const fo = Math.min(frames, Math.floor(fadeOut * sampleRate));
    for (const ch of chs) {
      for (let i = 0; i < fi; i++) ch[i] *= i / fi;
      for (let i = 0; i < fo; i++) { const k = i / fo; ch[frames - 1 - i] *= k * k; }
    }
  }
  return out;
}

// ── 공개 API ───────────────────────────────────────────
const cache = new Map(); // key → Promise<AudioBuffer>
const CACHE_MAX = 12;

function offlineCtx(channels, frames, sampleRate) {
  const Ctor = (typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext))
    || (typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null);
  if (!Ctor) throw new Error('이 브라우저는 OfflineAudioContext 를 지원하지 않습니다.');
  return new Ctor(channels, frames, sampleRate);
}

/** 분위기 하나의 코드 진행 한 바퀴 길이(초) — 루프 길이를 마디에 맞출 때 씁니다. */
export function moodCycleSeconds(moodId) {
  const mood = MOODS.find((m) => m.id === moodId);
  const recipe = RECIPES[moodId];
  if (!mood || !recipe) return 0;
  return (60 / mood.bpm) * 4 * recipe.barsPerChord * recipe.prog.length;
}

/**
 * 분위기 배경음악을 seconds 길이 AudioBuffer 로 렌더합니다(오프라인, 캐시).
 * @param {string} moodId MOODS 의 id
 * @param {number} seconds 길이(초, 1~600)
 * @param {{ sampleRate?: number, seed?: number|string, loop?: boolean }} [o]
 *   loop=true 면 길이를 코드 진행 주기에 맞추고 페이드 없이 꼬리를 머리에 접어 이음새 없는 루프를 만듭니다(playMood 가 씀).
 * @returns {Promise<AudioBuffer>}
 */
export async function renderMood(moodId, seconds, { sampleRate = 44100, seed, loop = false } = {}) {
  const mood = MOODS.find((m) => m.id === moodId);
  const recipe = RECIPES[moodId];
  if (!mood || !recipe) throw new Error(`모르는 분위기입니다: ${moodId}`);
  let length = clamp(Number(seconds) || 0, 1, 600);
  if (loop) {
    const cyc = moodCycleSeconds(moodId);
    length = Math.max(1, Math.round(length / cyc)) * cyc;
  }
  const key = `${moodId}|${length.toFixed(4)}|${sampleRate}|${seed ?? ''}|${loop ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const frames = Math.round(length * sampleRate);
    const tailSec = loop ? 1.0 : 0; // 루프는 잔향 꼬리를 더 렌더해 머리에 접는다
    const ctx = offlineCtx(2, frames + Math.round(tailSec * sampleRate), sampleRate);
    const rng = makeRng(seed == null ? hashSeed(moodId) : typeof seed === 'number' ? seed : hashSeed(seed));
    const stepSec = 60 / mood.bpm / 4;
    const synth = new Synth(ctx, recipe, rng, length + tailSec, stepSec);
    scheduleMood(synth, mood, recipe, length, rng);
    const rendered = await ctx.startRendering();
    return finalize(ctx, rendered, frames, { fadeIn: 0.3, fadeOut: 1.2, loop, sampleRate });
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return job;
}

/**
 * 실시간 미리듣기: 마디에 맞춘 루프를 렌더해 audioCtx.destination 으로 반복 재생합니다.
 * 바로 { stop(), setGain(v), ready } 를 돌려주고, 렌더가 끝나면(ready) 소리가 시작됩니다.
 */
export function playMood(audioCtx, moodId, { gain = 0.35, loopSeconds = 16 } = {}) {
  let stopped = false;
  let src = null;
  const g = audioCtx.createGain();
  g.gain.value = 0;
  g.connect(audioCtx.destination);
  const ready = renderMood(moodId, loopSeconds, { sampleRate: audioCtx.sampleRate, loop: true }).then((buf) => {
    if (stopped) return;
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') audioCtx.resume().catch(() => {});
    src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(g);
    const now = audioCtx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.4);
    src.start(now);
  });
  ready.catch(() => {});
  return {
    ready,
    setGain(v) { gain = clamp(Number(v) || 0, 0, 1); if (src) g.gain.setTargetAtTime(gain, audioCtx.currentTime, 0.05); },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = audioCtx.currentTime;
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        if (src) src.stop(now + 0.3);
      } catch { /* 이미 멈춤 */ }
      setTimeout(() => { try { src?.disconnect(); g.disconnect(); } catch { /* 무시 */ } }, 400);
    },
  };
}

/** AudioBuffer → 16비트 PCM WAV(ArrayBuffer). 저장·검사용. */
export function audioBufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const rate = buffer.sampleRate;
  const bytes = 44 + frames * channels * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, frames * channels * 2, true);
  const chs = [];
  for (let c = 0; c < channels; c++) chs.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = clamp(chs[c][i], -1, 1);
      v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
      o += 2;
    }
  }
  return ab;
}

/** 캐시 비우기(메모리 회수용) */
export function clearMoodCache() { cache.clear(); }
