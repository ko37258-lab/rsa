// 영상 생성 API 서버 (Express). 프런트(Vite/React)는 /api 로 이 서버를 부른다.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, OUTPUT_DIR, providers, ROOT, voices } from './config.js';
import { getJob, startJob } from './jobs.js';
import { analyzeBenchmark } from './pipeline/claude.js';
import { demoAnalysis, demoTranscript } from './pipeline/demo.js';
import { checkFfmpeg, resolveFont } from './pipeline/ffmpeg.js';
import { fetchMeta, fetchTranscript, parseVideoId } from './pipeline/youtube.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
app.use('/output', express.static(OUTPUT_DIR));

app.get('/api/status', (_req, res) => {
  res.json({ providers: providers(), voices: voices(), ffmpeg: checkFfmpeg(), font: resolveFont(), model: config.claudeModel });
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

  const live = providers().claude && !demo;
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
    res.status(500).json({ error: String(e.message || e) });
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

app.listen(config.port, () => {
  const p = providers();
  console.log(`\n🎬 Video Recipe Lab API → http://localhost:${config.port}`);
  console.log(`   Claude: ${p.claude ? 'ON' : 'OFF(데모)'} · OpenAI(그림/음성): ${p.openai ? 'ON' : 'OFF'} · ElevenLabs: ${p.elevenlabs ? 'ON' : 'OFF'}`);
  console.log(`   ffmpeg: ${checkFfmpeg() ? 'OK' : '없음 — 렌더 불가'} · 한글 폰트: ${resolveFont() ?? '못 찾음'}\n`);
});
