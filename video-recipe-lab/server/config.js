// 환경설정 · 어떤 AI 공급자를 쓸 수 있는지 판단한다.
// 키가 하나도 없어도 "데모 모드"로 파이프라인 전체(대본→음성→자막→컷→썸네일→MP4)가 돈다.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const OUTPUT_DIR = path.resolve(ROOT, process.env.OUTPUT_DIR || 'output');

const has = (k) => Boolean(process.env[k] && process.env[k].trim());

export const config = {
  port: Number(process.env.PORT || 8787),
  claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  openaiTtsModel: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  elevenModel: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
  width: Number(process.env.VIDEO_WIDTH || 1280),
  height: Number(process.env.VIDEO_HEIGHT || 720),
  fps: Number(process.env.VIDEO_FPS || 30),
  fontFile: process.env.FONT_FILE || '',
};

export function providers() {
  const forceDemo = process.env.DEMO_MODE === '1';
  return {
    claude: !forceDemo && (has('ANTHROPIC_API_KEY') || has('ANTHROPIC_AUTH_TOKEN') || process.env.USE_CLAUDE === '1'),
    openai: !forceDemo && has('OPENAI_API_KEY'),
    elevenlabs: !forceDemo && has('ELEVENLABS_API_KEY'),
  };
}

// 목소리 목록. ElevenLabs 목소리는 .env 의 ELEVENLABS_VOICES="이름:voiceId,이름:voiceId" 로 등록
export function voices() {
  const p = providers();
  const list = [{ id: 'silent', provider: 'none', label: '무음 · 자막만 (데모)', desc: 'API 키 없이 렌더 테스트용' }];
  if (p.openai) {
    for (const [v, label] of [
      ['onyx', '낮고 묵직한 남성'], ['ash', '차분한 남성'], ['echo', '또렷한 남성'],
      ['nova', '밝은 여성'], ['coral', '따뜻한 여성'], ['sage', '지적인 여성'],
    ]) list.push({ id: `openai:${v}`, provider: 'openai', label: `${label} (${v})`, desc: 'OpenAI TTS' });
  }
  if (p.elevenlabs) {
    const raw = process.env.ELEVENLABS_VOICES || '';
    for (const pair of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [label, id] = pair.split(':');
      if (id) list.push({ id: `eleven:${id}`, provider: 'elevenlabs', label, desc: 'ElevenLabs' });
    }
  }
  return list;
}
