// 스타일 음악 엔진 점검(Playwright + ffmpeg).
//   node tests/music-check.cjs
// 1) http://127.0.0.1:5173/ 을 열어 `import('/js/music.js')` → MOODS 10개 확인
// 2) 분위기마다 8초 렌더(시간 측정) → WAV 로 바꿔 tests/out/music/<id>.wav 저장
// 3) ffmpeg volumedetect 로 mean/max 볼륨, 2~6초 구간의 5밴드 에너지 지문 + astats 영교차율
// 4) 10개가 서로 다른지(md5 모두 다름, 지문 거리), 피크 ≤ -1dB, 평균 -24~-14dB, 8초 렌더 2초 이내 확인
// 5) 캐시(같은 조건 두 번째 호출은 같은 버퍼), 루프 렌더 길이, playMood 가 { stop } 을 돌려주는지 확인
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out', 'music');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SECONDS = 8;
const EXPECTED_IDS = ['upbeat', 'news', 'calm', 'lofi', 'corporate', 'drama', 'quiz', 'warning', 'epic', 'playful'];
const BANDS = [[20, 150], [150, 500], [500, 2000], [2000, 6000], [6000, 16000]];

// 정적 서버엔 없는 것들: 예시 사진과 Vercel 함수 /api/health 의 404 는 예상된 것
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/health$/;

function watch(page, bucket) {
  const pending404 = [];
  page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/404/.test(m.text())) {
      const url = pending404.shift() || '';
      if (EXPECTED_404.test(url)) return;
      bucket.push(`console.error: ${m.text()} ${url}`);
      return;
    }
    bucket.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => bucket.push(`pageerror: ${e.message}`));
}

function ffmpeg(args) {
  // ffmpeg 는 분석 결과를 stderr 로 내보내므로 종료 코드와 상관없이 stdout+stderr 를 함께 읽습니다
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
}
function volumeDetect(file, extraFilters = '', seek = null) {
  const af = (extraFilters ? extraFilters + ',' : '') + 'volumedetect';
  const args = [];
  if (seek) args.push('-ss', String(seek[0]), '-t', String(seek[1]));
  args.push('-i', file, '-af', af, '-f', 'null', '-');
  const txt = ffmpeg(args);
  const mean = Number((/mean_volume:\s*(-?[\d.]+|inf)/.exec(txt) || [])[1]);
  const max = Number((/max_volume:\s*(-?[\d.]+|inf)/.exec(txt) || [])[1]);
  return { mean, max };
}
function zeroCrossing(file, seek) {
  // 이 ffmpeg(6.1)에서는 영교차율·크레스트가 채널별 측정에만 있어 모노로 합친 뒤 채널별로 읽습니다
  const txt = ffmpeg(['-ss', String(seek[0]), '-t', String(seek[1]), '-i', file, '-af', 'aformat=channel_layouts=mono,astats=measure_perchannel=all:measure_overall=none', '-f', 'null', '-']);
  return {
    zcr: Number((/Zero crossings rate:\s*([\d.]+)/.exec(txt) || [])[1]),
    crest: Number((/Crest factor:\s*([\d.]+)/.exec(txt) || [])[1]),
  };
}
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });
  const report = { ok: true, problems: [], consoleErrors: [], moods: [], pairs: null, cache: null, loop: null, play: null };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watch(page, report.consoleErrors);
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // 1) 모듈·MOODS
    const moods = await page.evaluate(async () => {
      const m = await import('/js/music.js');
      return m.MOODS.map(({ id, name, desc, bpm, key, feel }) => ({ id, name, desc, bpm, key, feel }));
    });
    if (moods.length !== 10) report.problems.push(`MOODS 가 ${moods.length}개 (10개여야 함)`);
    const ids = moods.map((m) => m.id);
    EXPECTED_IDS.forEach((id) => { if (!ids.includes(id)) report.problems.push(`MOODS 에 '${id}' 없음`); });
    moods.forEach((m) => {
      if (!(m.bpm >= 70 && m.bpm <= 150)) report.problems.push(`${m.id} 템포 ${m.bpm} 가 70~150 밖`);
      if (!m.name || !m.desc || !m.key || !m.feel) report.problems.push(`${m.id} 이름·설명·키·느낌 중 빈 값`);
    });

    // 2) 분위기마다 8초 렌더 → WAV
    for (const mood of moods) {
      const r = await page.evaluate(async ({ id, seconds }) => {
        const m = await import('/js/music.js');
        const t0 = performance.now();
        const buf = await m.renderMood(id, seconds);
        const renderMs = performance.now() - t0;
        // 같은 조건은 캐시 → 같은 버퍼 객체가 바로 돌아와야 함
        const t1 = performance.now();
        const again = await m.renderMood(id, seconds);
        const cachedMs = performance.now() - t1;
        let peak = 0; let sum = 0; let n = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const ch = buf.getChannelData(c);
          for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; sum += ch[i] * ch[i]; }
          n += ch.length;
        }
        const wav = m.audioBufferToWav(buf);
        const bytes = new Uint8Array(wav);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return {
          renderMs, cachedMs, sameObject: again === buf,
          duration: buf.duration, channels: buf.numberOfChannels, sampleRate: buf.sampleRate,
          peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 20 * Math.log10(Math.sqrt(sum / n) || 1e-9),
          // 페이드 확인: 첫 20ms·마지막 100ms 의 최대 진폭
          headPeak: Math.max(...Array.from(buf.getChannelData(0).subarray(0, Math.floor(buf.sampleRate * 0.02))).map(Math.abs)),
          tailPeak: Math.max(...Array.from(buf.getChannelData(0).subarray(buf.length - Math.floor(buf.sampleRate * 0.1))).map(Math.abs)),
          wavB64: btoa(bin),
        };
      }, { id: mood.id, seconds: SECONDS });
      const file = path.join(OUT, `${mood.id}.wav`);
      const data = Buffer.from(r.wavB64, 'base64');
      fs.writeFileSync(file, data);
      delete r.wavB64;

      // 3) ffmpeg 측정
      const vol = volumeDetect(file);
      const bands = BANDS.map(([lo, hi]) => volumeDetect(file, `highpass=f=${lo},lowpass=f=${hi}`, [2, 4]).mean);
      const stats = zeroCrossing(file, [2, 4]);
      const md5 = crypto.createHash('md5').update(data).digest('hex');

      const row = { ...mood, file, md5, renderMs: r.renderMs, cachedMs: r.cachedMs, sameObject: r.sameObject, duration: r.duration, channels: r.channels, sampleRate: r.sampleRate, peakDb: r.peakDb, rmsDb: r.rmsDb, headPeak: r.headPeak, tailPeak: r.tailPeak, mean: vol.mean, max: vol.max, bands, zcr: stats.zcr, crest: stats.crest };
      report.moods.push(row);

      // 4) 기준 확인
      if (!(vol.max <= -1 + 0.05)) report.problems.push(`${mood.id} 피크 ${fmt(vol.max)} dB > -1 dB`);
      if (!(vol.mean >= -24 && vol.mean <= -14)) report.problems.push(`${mood.id} 평균 ${fmt(vol.mean)} dB 가 -24~-14 밖`);
      if (!(r.renderMs <= 2000)) report.problems.push(`${mood.id} 8초 렌더 ${fmt(r.renderMs, 0)}ms > 2000ms`);
      if (Math.abs(r.duration - SECONDS) > 0.01) report.problems.push(`${mood.id} 길이 ${fmt(r.duration, 3)}s ≠ ${SECONDS}s`);
      if (!r.sameObject) report.problems.push(`${mood.id} 캐시가 같은 버퍼를 돌려주지 않음`);
      if (!(r.headPeak < 0.08)) report.problems.push(`${mood.id} 페이드인 약함(첫 20ms 피크 ${fmt(r.headPeak, 3)})`);
      if (!(r.tailPeak < 0.08)) report.problems.push(`${mood.id} 페이드아웃 약함(마지막 100ms 피크 ${fmt(r.tailPeak, 3)})`);
      if (!(vol.mean > -60)) report.problems.push(`${mood.id} 거의 무음`);
    }

    // 서로 다른지: md5 + 지문 거리(밴드 dB L1 합 + 영교차율 차이)
    const md5s = new Set(report.moods.map((m) => m.md5));
    if (md5s.size !== report.moods.length) report.problems.push('동일한 WAV 파일이 있음');
    const pairs = [];
    for (let i = 0; i < report.moods.length; i++) {
      for (let j = i + 1; j < report.moods.length; j++) {
        const a = report.moods[i]; const b = report.moods[j];
        const bandDist = a.bands.reduce((s, v, k) => s + Math.abs(v - b.bands[k]), 0);
        const zcrDist = Math.abs(a.zcr - b.zcr);
        pairs.push({ a: a.id, b: b.id, bandDist, zcrDist });
      }
    }
    pairs.sort((x, y) => x.bandDist - y.bandDist);
    report.pairs = { closest: pairs.slice(0, 5), minBandDist: pairs[0]?.bandDist };
    pairs.forEach((p) => { if (p.bandDist < 3 && p.zcrDist < 0.01) report.problems.push(`${p.a}·${p.b} 지문이 너무 비슷함(밴드 ${fmt(p.bandDist)} dB, 영교차 ${fmt(p.zcrDist, 3)})`); });

    // 5) 루프 렌더 길이 + playMood
    report.loop = await page.evaluate(async () => {
      const m = await import('/js/music.js');
      const out = [];
      for (const id of ['upbeat', 'calm']) {
        const cyc = m.moodCycleSeconds(id);
        const buf = await m.renderMood(id, 16, { loop: true });
        const cycles = buf.duration / cyc;
        out.push({ id, cycleSeconds: cyc, duration: buf.duration, cycles, wholeCycles: Math.abs(cycles - Math.round(cycles)) < 0.001 });
      }
      return out;
    });
    report.loop.forEach((l) => { if (!l.wholeCycles) report.problems.push(`${l.id} 루프 길이 ${fmt(l.duration, 2)}s 가 주기 ${fmt(l.cycleSeconds, 2)}s 의 배수가 아님`); });

    // 48kHz(실제 AudioContext 가 흔히 쓰는 값) 렌더와 모르는 id 거부
    report.misc = await page.evaluate(async () => {
      const m = await import('/js/music.js');
      const b48 = await m.renderMood('upbeat', 4, { sampleRate: 48000 });
      let rejected = false;
      try { await m.renderMood('no-such-mood', 4); } catch { rejected = true; }
      return { sr48: b48.sampleRate, len48: b48.length, rejected };
    });
    if (report.misc.sr48 !== 48000 || report.misc.len48 !== 192000) report.problems.push(`48kHz 렌더가 ${report.misc.sr48}Hz/${report.misc.len48}프레임 (48000/192000 이어야 함)`);
    if (!report.misc.rejected) report.problems.push('모르는 분위기 id 가 거부되지 않음');

    report.play = await page.evaluate(async () => {
      const m = await import('/js/music.js');
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return { skipped: 'AudioContext 없음' };
      const ctx = new AC();
      const h = m.playMood(ctx, 'quiz', { gain: 0.3, loopSeconds: 8 });
      const shape = { hasStop: typeof h.stop === 'function', hasReady: !!h.ready, hasSetGain: typeof h.setGain === 'function' };
      await h.ready;
      await new Promise((r) => setTimeout(r, 250));
      const state = ctx.state;
      h.setGain(0.1);
      h.stop();
      await new Promise((r) => setTimeout(r, 450));
      await ctx.close();
      return { ...shape, state, ok: shape.hasStop && shape.hasReady };
    });
    if (report.play && !report.play.skipped && !report.play.ok) report.problems.push('playMood 가 { stop, ready } 를 돌려주지 않음');

    await page.close();
  } finally {
    await browser.close();
  }

  if (report.consoleErrors.length) report.problems.push(...report.consoleErrors);
  report.ok = report.problems.length === 0;

  // 표
  const lines = [];
  lines.push('| id | 이름 | bpm | 렌더(ms) | 캐시(ms) | 평균(dB) | 피크(dB) | 밴드 20-150 / 150-500 / 500-2k / 2k-6k / 6k-16k (dB, 2~6초) | 영교차 | 크레스트 | md5 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of report.moods) {
    lines.push(`| ${m.id} | ${m.name} | ${m.bpm} | ${fmt(m.renderMs, 0)} | ${fmt(m.cachedMs, 1)} | ${fmt(m.mean)} | ${fmt(m.max)} | ${m.bands.map((b) => fmt(b)).join(' / ')} | ${fmt(m.zcr, 3)} | ${fmt(m.crest, 2)} | ${m.md5.slice(0, 8)} |`);
  }
  lines.push('');
  lines.push(`가장 가까운 쌍(밴드 dB 거리): ${report.pairs.closest.map((p) => `${p.a}·${p.b} ${fmt(p.bandDist)}dB(영교차 차 ${fmt(p.zcrDist, 3)})`).join(', ')}`);
  lines.push(`루프: ${report.loop.map((l) => `${l.id} ${fmt(l.duration, 2)}s = ${fmt(l.cycles, 2)}주기`).join(', ')}`);
  lines.push(`48kHz·거부: ${JSON.stringify(report.misc)}`);
  lines.push(`playMood: ${JSON.stringify(report.play)}`);
  lines.push(`결과: ${report.ok ? '통과' : '문제 ' + report.problems.length + '건'}`);
  report.problems.forEach((p) => lines.push(`  - ${p}`));
  console.log(lines.join('\n'));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
