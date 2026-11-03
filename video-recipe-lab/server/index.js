// 영상 생성 API 서버 (Express). 프런트(Vite/React)는 /api 로 이 서버를 부른다.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, keyHealth, keyStatus, OUTPUT_DIR, providers, ROOT, saveKeys, voices } from './config.js';
import { getJob, startJob } from './jobs.js';
import { friendlyError, resetClient, verifyClaude } from './pipeline/claude.js';
import { resetGemini, verifyGemini } from './pipeline/gemini.js';
import { analyzeBenchmark } from './pipeline/llm.js';
import { demoAnalysis, demoTranscript } from './pipeline/demo.js';
import { checkFfmpeg, resolveFont } from './pipeline/ffmpeg.js';
import { verifyOpenAI } from './pipeline/images.js';
import { loadElevenVoices, verifyEleven } from './pipeline/eleven.js';
import { fetchMeta, fetchTranscript, parseVideoId } from './pipeline/youtube.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
app.use('/output', express.static(OUTPUT_DIR));

app.get('/api/status', (_req, res) => {
  res.json({ providers: providers(), voices: voices(), ffmpeg: checkFfmpeg(), font: resolveFont(), model: config.claudeModel, keys: keyStatus(), keyHealth });
});

// 화면에서 API 키 등록 → .env 에 저장하고 바로 연결 확인 (요금 안 나가는 조회만 함)
app.post('/api/keys', async (req, res) => {
  const b = req.body || {};
  const values = {};
  if (typeof b.anthropic === 'string') values.ANTHROPIC_API_KEY = b.anthropic;
  if (typeof b.openai === 'string') values.OPENAI_API_KEY = b.openai;
  if (typeof b.elevenlabs === 'string') values.ELEVENLABS_API_KEY = b.elevenlabs;
  if (typeof b.gemini === 'string') values.GEMINI_API_KEY = b.gemini;
  if (b.textAI === 'claude' || b.textAI === 'gemini') values.TEXT_AI = b.textAI;
  try {
    saveKeys(values);
  } catch (e) {
    return res.status(500).json({ error: `설정 파일 저장 실패: ${e.message}` });
  }
  resetClient();
  resetGemini();
  const check = {};
  if (process.env.ANTHROPIC_API_KEY) check.anthropic = await verifyClaude();
  if (process.env.GEMINI_API_KEY) check.gemini = await verifyGemini();
  if (process.env.OPENAI_API_KEY) check.openai = await verifyOpenAI();
  if (process.env.ELEVENLABS_API_KEY) check.elevenlabs = await verifyEleven();
  keyHealth.anthropic = check.anthropic?.ok;
  keyHealth.gemini = check.gemini?.ok;
  keyHealth.openai = check.openai?.ok;
  keyHealth.elevenlabs = check.elevenlabs?.ok;
  res.json({ keys: keyStatus(), providers: providers(), check });
});

// 분석·대본 AI 선택 (Claude / Gemini) — 키 확인 없이 설정만 바꾼다
app.post('/api/settings', (req, res) => {
  const v = req.body?.textAI;
  if (v !== 'claude' && v !== 'gemini') return res.status(400).json({ error: 'claude 또는 gemini 중에서 골라 주세요.' });
  saveKeys({ TEXT_AI: v });
  res.json({ providers: providers() });
});

// ① 잘된 영상 주소 넣기 → 분석 + 제목/썸네일 후보
app.post('/api/analyze', async (req, res) => {
  const { url, transcript: pasted, topic, demo } = req.body || {};
  const videoId = parseVideoId(url);
  if (!videoId && !pasted && !demo) return res.status(400).json({ error: '유튜브 주소를 확인해 주세요.' });

  const meta = videoId ? await fetchMeta(videoId) : { title: '(붙여넣은 대본)', author: null };
  let transcript = pasted?.trim() ? { text: pasted.trim(), source: 'pasted' } : null;
  if (!transcript && videoId) {
    const t = await fetchTranscript(videoId);
    if (t) transcript = { text: t.text, source: `youtube:${t.lang}` };
  }

  const live = Boolean(providers().text) && !demo;
  if (!live) {
    return res.json({
      mode: 'demo', meta,
      transcript: transcript ?? { text: demoTranscript, source: 'demo' },
      analysis: demoAnalysis,
    });
  }
  if (!transcript) {
    return res.status(422).json({ needTranscript: true, meta, error: '이 영상의 자막을 가져오지 못했습니다. 대본을 직접 붙여넣어 주세요.' });
  }
  try {
    const analysis = await analyzeBenchmark({ meta, transcript: transcript.text, topicHint: topic });
    res.json({ mode: 'live', meta, transcript, analysis });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: friendlyError(e) });
  }
});

// ③ 기다리기 — 작업 시작
app.post('/api/jobs', (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: '제목을 골라 주세요.' });
  const job = startJob({
    analysis: b.analysis, title: b.title, topic: b.topic || b.title, minutes: Math.min(15, Math.max(1, Number(b.minutes) || 1)),
    voice: b.voice || 'silent', thumbnail: b.thumbnail, demo: Boolean(b.demo),
  });
  res.json({ id: job.id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job.snapshot());
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).end();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (snap) => res.write(`data: ${JSON.stringify(snap)}\n\n`);
  send(job.snapshot());
  const tick = setInterval(() => send(job.snapshot()), 1000); // 경과 시간 갱신
  job.on('update', send);
  req.on('close', () => {
    clearInterval(tick);
    job.off('update', send);
  });
});

// 빌드된 프런트 제공 (npm start)
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/(api|output)\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (providers().elevenlabs) {
  loadElevenVoices().catch(() => {
    keyHealth.elevenlabs = false;
  });
}

const server = app.listen(config.port, config.host, () => {
  const p = providers();
  console.log(`\n🎬 Video Recipe Lab API → http://localhost:${config.port}`);
  const textName = p.text === 'claude' ? 'Claude' : p.text === 'gemini' ? 'Gemini' : 'OFF(데모)';
  console.log(`   분석·대본 AI: ${textName} · OpenAI(그림/음성): ${p.openai ? 'ON' : 'OFF'} · ElevenLabs: ${p.elevenlabs ? 'ON' : 'OFF'}`);
  console.log(`   ffmpeg: ${checkFfmpeg() ? 'OK' : '없음 — 렌더 불가'} · 한글 폰트: ${resolveFont() ?? '못 찾음'}\n`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n⚠️  프로그램이 이미 다른 검은 창에서 실행 중입니다 (포트 ${config.port}).`);
    console.error('    이 창과 예전 검은 창을 모두 닫은 뒤, 한 번만 다시 실행하세요.\n');
  } else console.error(e);
  process.exit(1);
});
