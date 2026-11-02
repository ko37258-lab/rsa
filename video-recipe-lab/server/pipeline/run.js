// 파이프라인 오케스트레이터 — 원본 약관 제2조에 적힌 순서 그대로:
// 대본 작성 → TTS 음성 → SRT 자막 → 장면 컷 설계(그림) → 썸네일 편집 → 최종 MP4 렌더링
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT_DIR, providers } from '../config.js';
import { writeScript } from './claude.js';
import { demoScript } from './demo.js';
import { copyFontInto } from './ffmpeg.js';
import { makeSceneImage, VISUAL_LABEL } from './images.js';
import { composeThumbnail, concatAndBurn, renderSceneClip } from './render.js';
import { buildSrt } from './subtitles.js';
import { synthesize } from './tts.js';

export const STEPS = [
  { key: 'script', label: '대본 작성 · 장면 나누기' },
  { key: 'tts', label: 'TTS 음성 만들기' },
  { key: 'srt', label: 'SRT 자막 만들기' },
  { key: 'visuals', label: '장면 그림 만들기' },
  { key: 'thumbnail', label: '썸네일 편집' },
  { key: 'render', label: '최종 MP4 렌더링' },
];

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

/**
 * @param job  jobs.js 의 Job (step(), log() 를 가진 진행상황 기록기)
 * @param input { analysis, title, topic, minutes, voice, thumbnail: {line1,line2,imageConcept} }
 */
export async function runPipeline(job, input) {
  const dir = path.join(OUTPUT_DIR, job.id);
  await fs.mkdir(dir, { recursive: true });
  const font = copyFontInto(dir);
  if (!font) job.log('한글 폰트를 찾지 못해 화면 글자 없이 렌더합니다 (.env 의 FONT_FILE 로 지정 가능)');

  // 1) 대본
  job.step('script', 'running');
  let script;
  if (providers().claude && !input.demo) {
    script = await writeScript({ analysis: input.analysis, title: input.title, topic: input.topic, minutes: input.minutes });
  } else {
    script = { ...demoScript, title: input.title || demoScript.title };
    job.log('데모 모드: 미리 준비된 대본을 사용합니다');
  }
  await fs.writeFile(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
  job.step('script', 'done', `${script.scenes.length}개 장면`);

  // 2) TTS — 실제 길이를 재야 자막·컷 길이가 맞는다
  job.step('tts', 'running');
  let finished = 0;
  const durations = await pool(script.scenes, 3, async (sc, i) => {
    const d = await synthesize(sc.narration, input.voice || 'silent', path.join(dir, `voice_${String(i).padStart(3, '0')}.mp3`));
    job.step('tts', 'running', `${++finished}/${script.scenes.length}`);
    return d + 0.25; // 장면 사이 숨 고르기
  });
  let t = 0;
  const timeline = script.scenes.map((sc, i) => {
    const item = { ...sc, index: i, start: t, duration: durations[i] };
    t += durations[i];
    return item;
  });
  job.step('tts', 'done', `총 ${t.toFixed(1)}초`);

  // 3) 자막
  job.step('srt', 'running');
  await fs.writeFile(path.join(dir, 'subs.srt'), buildSrt(timeline));
  job.step('srt', 'done');

  // 4) 장면 그림
  job.step('visuals', 'running');
  finished = 0;
  const images = await pool(timeline, 2, async (sc) => {
    const r = await makeSceneImage({ dir, index: sc.index, scene: sc, font });
    job.step('visuals', 'running', `${++finished}/${timeline.length}`);
    return r;
  });
  job.step('visuals', 'done', images[0]?.source === 'openai' ? 'AI 이미지' : '대체 카드 (OPENAI_API_KEY 없음)');

  // 5) 썸네일
  job.step('thumbnail', 'running');
  const thumb = await composeThumbnail({
    dir,
    background: images[0]?.source === 'openai' ? images[0].file : null, // 대체 카드는 글자가 박혀 있어 배경으로 안 쓴다
    line1: input.thumbnail?.line1,
    line2: input.thumbnail?.line2,
    imagePrompt: input.thumbnail?.imageConcept,
    font,
  });
  job.step('thumbnail', 'done');

  // 6) 렌더
  job.step('render', 'running', '장면 클립 만드는 중');
  finished = 0;
  const clips = await pool(timeline, 2, async (sc) => {
    const c = await renderSceneClip({
      dir, index: sc.index, image: images[sc.index].file,
      audio: `voice_${String(sc.index).padStart(3, '0')}.mp3`, duration: sc.duration, scene: sc, font,
    });
    job.step('render', 'running', `장면 ${++finished}/${timeline.length}`);
    return c;
  });
  job.step('render', 'running', '이어붙이고 자막 입히는 중');
  const video = await concatAndBurn({ dir, clips, srtFile: 'subs.srt' });
  job.step('render', 'done');

  // 원본 랜딩의 "AI 그림 0:23 · 그래프 0:43" 같은 장면 바로가기 칩
  const chapters = [];
  for (const sc of timeline) {
    if (!chapters.find((c) => c.type === sc.visualType)) chapters.push({ type: sc.visualType, label: VISUAL_LABEL[sc.visualType], at: sc.start });
  }
  chapters.sort((a, b) => a.at - b.at);

  const base = `/output/${job.id}`;
  return {
    title: script.title,
    seconds: t,
    video: `${base}/${video}`,
    thumbnail: `${base}/${thumb}`,
    srt: `${base}/subs.srt`,
    script: `${base}/script.json`,
    chapters,
    scenes: timeline.map((s) => ({ start: s.start, duration: s.duration, narration: s.narration, visualType: s.visualType, image: `${base}/${images[s.index].file}` })),
  };
}
