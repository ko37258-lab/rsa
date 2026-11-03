// 웹판 연결부 — 화면(Studio.jsx)은 설치판과 똑같이 /api/* 를 부른다. 웹판에는 서버가 없으므로
// 그 요청을 여기서 가로채 브라우저 안에서 처리한다. 다른 주소(/api/gate 등)는 그대로 통과시킨다.
import { demoAnalysis, demoTranscript } from '../../server/pipeline/demo.js';
import {
  analyzeBenchmark, categoryLabel, elevenVoiceCache, friendlyError, loadElevenVoices, resetAi,
  verifyClaude, verifyEleven, verifyGemini, verifyOpenAI,
} from './ai.js';
import { clearKeys, keyStatus, providers, saveKeys } from './keys.js';
import { runPipeline, STEPS } from './pipeline.js';
import { browserSupported } from './render.js';

const keyHealth = {};

function voices() {
  const p = providers();
  const list = [{ id: 'silent', provider: 'none', label: '무음 · 자막만 (체험)', desc: '목소리 없이 자막만' }];
  if (p.elevenlabs) {
    for (const v of elevenVoiceCache()) list.push({ id: `eleven:${v.id}`, provider: 'elevenlabs', label: v.name, desc: `ElevenLabs · ${categoryLabel(v.category)}` });
  }
  if (p.openai) {
    for (const [v, label] of [
      ['onyx', '낮고 묵직한 남성'], ['ash', '차분한 남성'], ['echo', '또렷한 남성'],
      ['nova', '밝은 여성'], ['coral', '따뜻한 여성'], ['sage', '지적인 여성'],
    ]) list.push({ id: `openai:${v}`, provider: 'openai', label: `${label} (${v})`, desc: 'OpenAI TTS' });
  }
  return list;
}

function parseVideoId(url) {
  if (!url) return null;
  const s = url.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12);
    if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
    const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/);
    if (m) return m[2];
  } catch {
    /* 주소가 아님 */
  }
  return null;
}

async function fetchMeta(videoId, realFetch) {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  try {
    const r = await realFetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`);
    if (!r.ok) throw new Error(`oEmbed ${r.status}`);
    const j = await r.json();
    return { videoId, url: watch, title: j.title, author: j.author_name, thumbnail };
  } catch {
    return { videoId, url: watch, title: null, author: null, thumbnail };
  }
}

// ---------- 작업 진행 ----------
const jobs = new Map();
let seq = 0;

class Job {
  constructor() {
    this.id = `web-${++seq}`;
    this.status = 'running';
    this.steps = STEPS.map((s) => ({ ...s, status: 'pending', detail: '' }));
    this.logs = [];
    this.result = null;
    this.error = null;
    this.startedAt = Date.now();
    this.listeners = new Set();
  }
  emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }
  step(key, status, detail = '') {
    const s = this.steps.find((x) => x.key === key);
    if (s) Object.assign(s, { status, detail });
    this.emit();
  }
  log(msg) {
    this.logs.push(msg);
    this.emit();
  }
  snapshot() {
    const done = this.steps.filter((s) => s.status === 'done').length;
    return {
      id: this.id, status: this.status, steps: this.steps.map((s) => ({ ...s })), logs: [...this.logs], result: this.result, error: this.error,
      progress: Math.round((done / this.steps.length) * 100), elapsed: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }
}

function startJob(input) {
  const job = new Job();
  jobs.set(job.id, job);
  runPipeline(job, input)
    .then((result) => {
      job.result = result;
      job.status = 'done';
      job.emit();
    })
    .catch((err) => {
      console.error(err);
      const running = job.steps.find((s) => s.status === 'running');
      if (running) running.status = 'error';
      job.status = 'error';
      job.error = friendlyError(err);
      job.emit();
    });
  return job;
}

// ---------- /api/* 처리 ----------
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function status() {
  return { providers: providers(), voices: voices(), ffmpeg: browserSupported(), keys: keyStatus(), keyHealth, appMode: 'member', web: true };
}

async function verifyAll() {
  const p = providers();
  const check = {};
  if (p.claude) check.anthropic = await verifyClaude();
  if (p.gemini) check.gemini = await verifyGemini();
  if (p.openai) check.openai = await verifyOpenAI();
  if (p.elevenlabs) check.elevenlabs = await verifyEleven();
  for (const k of ['anthropic', 'gemini', 'openai', 'elevenlabs']) keyHealth[k] = check[k]?.ok;
  return check;
}

async function analyze(body, realFetch) {
  const { url, transcript: pasted, topic, demo } = body;
  const videoId = parseVideoId(url);
  if (!videoId && !pasted && !demo) return json({ error: '유튜브 주소를 확인해 주세요.' }, 400);

  const meta = videoId ? await fetchMeta(videoId, realFetch) : { title: '(붙여넣은 대본)', author: null };
  const transcript = pasted?.trim() ? { text: pasted.trim(), source: 'pasted' } : null;
  const p = providers();
  if (!p.text || demo) return json({ mode: 'demo', meta, transcript: transcript ?? { text: demoTranscript, source: 'demo' }, analysis: demoAnalysis });

  // 브라우저는 유튜브 자막을 읽을 수 없다. 대본이 없으면 Gemini 는 영상을 직접 보고, Claude 는 붙여넣기를 부탁한다
  const watchVideo = !transcript && p.text === 'gemini' && videoId;
  if (!transcript && !watchVideo) {
    return json({ needTranscript: true, meta, error: 'Claude 로 분석하려면 원본 영상의 대본이 필요합니다. 아래에 대본을 붙여넣거나, Gemini 키를 등록하면 영상을 직접 보고 분석합니다.' }, 422);
  }
  try {
    const analysis = await analyzeBenchmark({
      meta,
      transcript: watchVideo ? '(대본 대신 첨부한 영상을 직접 보고 분석하세요.)' : transcript.text,
      topicHint: topic,
      videoUrl: watchVideo ? meta.url : undefined,
    });
    const used = watchVideo ? { text: `영상 ${meta.title || ''}`, source: 'Gemini가 영상을 직접 분석' } : transcript;
    return json({ mode: 'live', meta, transcript: used, analysis });
  } catch (e) {
    console.error(e);
    if (watchVideo) return json({ needTranscript: true, meta, error: `Gemini가 이 영상을 직접 보지 못했습니다. 아래에 대본을 붙여넣어 주세요. (${friendlyError(e).slice(0, 120)})` }, 422);
    return json({ error: friendlyError(e) }, 500);
  }
}

async function route(path, body, realFetch) {
  if (path === '/api/status') {
    if (providers().elevenlabs && !elevenVoiceCache().length) await loadElevenVoices().catch(() => {});
    return json(status());
  }
  if (path === '/api/keys') {
    if (body.clearAll) {
      clearKeys();
      for (const k of Object.keys(keyHealth)) delete keyHealth[k];
      resetAi();
      return json({ keys: keyStatus(), providers: providers(), check: {} });
    }
    saveKeys(body);
    resetAi();
    return json({ keys: keyStatus(), providers: providers(), check: await verifyAll() });
  }
  if (path === '/api/settings') {
    if (body.textAI !== 'claude' && body.textAI !== 'gemini') return json({ error: 'claude 또는 gemini 중에서 골라 주세요.' }, 400);
    saveKeys({ textAI: body.textAI });
    return json({ providers: providers() });
  }
  if (path === '/api/analyze') return analyze(body, realFetch);
  if (path === '/api/jobs') {
    if (!body.title) return json({ error: '제목을 골라 주세요.' }, 400);
    const job = startJob({
      analysis: body.analysis, title: body.title, topic: body.topic || body.title, minutes: Math.min(15, Math.max(1, Number(body.minutes) || 1)),
      voice: body.voice || 'silent', thumbnail: body.thumbnail, demo: Boolean(body.demo),
    });
    return json({ id: job.id });
  }
  return null;
}

const HANDLED = /^\/api\/(status|keys|settings|analyze|jobs)$/;

export function installShim() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const path = typeof input === 'string' ? input : '';
    if (HANDLED.test(path)) {
      const res = await route(path, init?.body ? JSON.parse(init.body) : {}, realFetch);
      if (res) return res;
    }
    return realFetch(input, init);
  };

  // 진행상황 받기(EventSource)도 같은 모양으로 흉내 낸다
  const RealEventSource = window.EventSource;
  window.EventSource = function ShimEventSource(url) {
    const m = String(url).match(/^\/api\/jobs\/([^/]+)\/events$/);
    if (!m) return new RealEventSource(url);
    const job = jobs.get(m[1]);
    const self = {
      onmessage: null,
      close() {
        job?.listeners.delete(listen);
      },
    };
    const listen = (snap) => self.onmessage?.({ data: JSON.stringify(snap) });
    job?.listeners.add(listen);
    setTimeout(() => job && listen(job.snapshot()), 0);
    return self;
  };
}
