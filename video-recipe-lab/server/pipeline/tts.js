// ④ TTS 음성 — 장면별 mp3 를 만들고 실제 길이를 잰다 (자막 타이밍의 기준)
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { ffmpeg, probeDuration } from './ffmpeg.js';

// 한국어 내레이션은 초당 6~7음절 안팎. 무음 데모에서 길이를 추정할 때 쓴다
export function estimateSeconds(text) {
  const syllables = text.replace(/[^가-힣a-zA-Z0-9]/g, '').length;
  return Math.max(2.5, syllables / 6.5 + 0.6);
}

async function openaiTts(text, voice, outFile) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.openaiTtsModel,
      voice,
      input: text,
      response_format: 'mp3',
      instructions: '한국어 유튜브 정보 채널 내레이터처럼, 또렷하고 리듬감 있게 읽어 주세요.',
    }),
  });
  if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  await fs.writeFile(outFile, Buffer.from(await r.arrayBuffer()));
}

async function elevenTts(text, voiceId, outFile) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: config.elevenModel }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
  await fs.writeFile(outFile, Buffer.from(await r.arrayBuffer()));
}

async function silent(seconds, outFile) {
  await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', seconds.toFixed(2), '-c:a', 'libmp3lame', '-b:a', '128k', outFile]);
}

/**
 * @param state { off: boolean, error?: string } — 한 작업 안에서 공유. 목소리가 한 번 실패하면 나머지는 무음으로.
 * @returns {Promise<number>} 오디오 길이(초)
 */
export async function synthesize(text, voiceId, outFile, state = { off: false }) {
  if (voiceId !== 'silent' && !state.off) {
    try {
      if (voiceId.startsWith('openai:')) await openaiTts(text, voiceId.slice(7), outFile);
      else if (voiceId.startsWith('eleven:')) await elevenTts(text, voiceId.slice(7), outFile);
      return probeDuration(outFile);
    } catch (e) {
      state.off = true;
      state.error ??= String(e.message || e);
    }
  }
  await silent(estimateSeconds(text), outFile);
  return probeDuration(outFile);
}
