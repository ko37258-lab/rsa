// 웹판 작업 흐름 — 서버판 run.js 와 같은 순서를 브라우저 안에서 돌린다:
// 대본 작성 → 음성 → 자막 → 장면 그림 → 썸네일 → MP4
import { demoScript } from '../../server/pipeline/demo.js';
import { buildSrt } from '../../server/pipeline/subtitles.js';
import { elevenTts, openaiImage, openaiTts, writeScript } from './ai.js';
import { providers } from './keys.js';
import { composeThumbnail, placeholderCard, renderVideo, VISUAL_LABEL } from './render.js';

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

// 한국어 내레이션은 초당 6~7음절 안팎. 무음일 때 길이를 추정한다
function estimateSeconds(text) {
  const syllables = text.replace(/[^가-힣a-zA-Z0-9]/g, '').length;
  return Math.max(2.5, syllables / 6.5 + 0.6);
}

const decoder = () => new OfflineAudioContext(2, 1, 44100);

async function synthesize(text, voiceId, state) {
  if (voiceId !== 'silent' && !state.off) {
    try {
      const data = voiceId.startsWith('openai:') ? await openaiTts(text, voiceId.slice(7)) : await elevenTts(text, voiceId.slice(7));
      const buffer = await decoder().decodeAudioData(data);
      return { buffer, seconds: buffer.duration };
    } catch (e) {
      state.off = true;
      state.error ??= String(e.message || e);
    }
  }
  return { buffer: null, seconds: estimateSeconds(text) };
}

async function sceneImage(scene, ai) {
  if (providers().openai && !ai.off) {
    try {
      return { blob: await openaiImage(scene.imagePrompt), source: 'openai' };
    } catch (e) {
      ai.off = true;
      ai.error ??= String(e.message || e);
    }
  }
  return { blob: await placeholderCard({ text: scene.onScreenText, visualType: scene.visualType }), source: 'placeholder' };
}

/**
 * @param job   jobs(shim.js) 의 진행상황 기록기
 * @param input { analysis, title, topic, minutes, voice, thumbnail: {line1,line2,imageConcept}, demo }
 */
export async function runPipeline(job, input) {
  // 1) 대본
  job.step('script', 'running');
  let script;
  if (providers().text && !input.demo) {
    script = await writeScript({ analysis: input.analysis, title: input.title, topic: input.topic, minutes: input.minutes });
  } else {
    script = { ...demoScript, title: input.title || demoScript.title };
    job.log('체험 모드: 미리 준비된 예시 대본을 사용합니다');
  }
  job.step('script', 'done', `${script.scenes.length}개 장면`);

  // 2) 음성 — 실제 길이를 재야 자막·컷 길이가 맞는다
  job.step('tts', 'running');
  const voiceState = { off: false };
  let finished = 0;
  const speech = await pool(script.scenes, 3, async (sc) => {
    const r = await synthesize(sc.narration, input.voice || 'silent', voiceState);
    job.step('tts', 'running', `${++finished}/${script.scenes.length}`);
    return r;
  });
  let t = 0;
  const timeline = script.scenes.map((sc, i) => {
    const duration = speech[i].seconds + 0.25; // 장면 사이 숨 고르기
    const item = { ...sc, index: i, start: t, duration };
    t += duration;
    return item;
  });
  if (voiceState.error) job.log(`목소리 생성 실패 → 무음으로 대체했습니다: ${voiceState.error.slice(0, 160)}`);
  job.step('tts', 'done', `총 ${t.toFixed(1)}초${voiceState.error ? ' (무음 대체)' : ''}`);

  // 3) 자막
  job.step('srt', 'running');
  const srt = buildSrt(timeline);
  job.step('srt', 'done');

  // 4) 장면 그림
  job.step('visuals', 'running');
  const ai = { off: false };
  finished = 0;
  const images = await pool(timeline, 2, async (sc) => {
    const r = await sceneImage(sc, ai);
    job.step('visuals', 'running', `${++finished}/${timeline.length}`);
    return r;
  });
  const aiCount = images.filter((r) => r.source === 'openai').length;
  if (ai.error) job.log(`AI 그림 생성 실패 → 대체 카드로 만들었습니다: ${ai.error.slice(0, 160)}`);
  job.step('visuals', 'done', aiCount ? `AI 그림 ${aiCount}장${aiCount < images.length ? ` + 대체 ${images.length - aiCount}장` : ''}` : ai.error ? '대체 카드 (AI 그림 실패)' : '대체 카드 (OpenAI 키 없음)');

  // 5) 썸네일 — 전용 배경을 따로 뽑고, 안 되면 첫 장면 AI 그림을 쓴다
  job.step('thumbnail', 'running');
  let background = images[0]?.source === 'openai' ? images[0].blob : null;
  if (providers().openai && !ai.off && input.thumbnail?.imageConcept) {
    try {
      background = await openaiImage(input.thumbnail.imageConcept);
    } catch {
      /* 장면 그림으로 대체 */
    }
  }
  const thumb = await composeThumbnail({ background, line1: input.thumbnail?.line1, line2: input.thumbnail?.line2 });
  job.step('thumbnail', 'done');

  // 6) 렌더
  job.step('render', 'running', '영상 만드는 중');
  const { blob, audioCodec } = await renderVideo({
    timeline,
    images: images.map((r) => r.blob),
    voices: speech.map((s) => s.buffer),
    total: t,
    onProgress: (p) => job.step('render', 'running', `${Math.round(p * 100)}%`),
  });
  if (audioCodec !== 'aac') job.log('이 브라우저는 AAC 소리를 만들지 못해 Opus 로 넣었습니다. 유튜브에는 올라가지만 일부 사이트에서는 소리가 안 될 수 있습니다.');
  job.step('render', 'done');

  const chapters = [];
  for (const sc of timeline) {
    if (!chapters.find((c) => c.type === sc.visualType)) chapters.push({ type: sc.visualType, label: VISUAL_LABEL[sc.visualType], at: sc.start });
  }
  chapters.sort((a, b) => a.at - b.at);

  const url = (b) => URL.createObjectURL(b);
  return {
    title: script.title,
    seconds: t,
    video: url(blob),
    thumbnail: url(thumb),
    srt: url(new Blob([srt], { type: 'text/plain;charset=utf-8' })),
    script: url(new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' })),
    chapters,
    scenes: timeline.map((s) => ({ start: s.start, duration: s.duration, narration: s.narration, visualType: s.visualType, image: url(images[s.index].blob) })),
  };
}
