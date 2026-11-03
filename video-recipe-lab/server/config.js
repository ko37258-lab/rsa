// 환경설정 · 어떤 AI 공급자를 쓸 수 있는지 판단한다.
// 키가 하나도 없어도 "데모 모드"로 파이프라인 전체(대본→음성→자막→컷→썸네일→MP4)가 돈다.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryLabel, elevenVoiceCache } from './pipeline/eleven.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const OUTPUT_DIR = path.resolve(ROOT, process.env.OUTPUT_DIR || 'output');

const has = (k) => Boolean(process.env[k] && process.env[k].trim());

export const config = {
  port: Number(process.env.PORT || 8787),
  // 내 PC 에서만 접속되게 (같은 와이파이의 다른 기기가 API 키로 영상을 만들지 못하게)
  host: process.env.HOST || '127.0.0.1',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  openaiTtsModel: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  elevenModel: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
  width: Number(process.env.VIDEO_WIDTH || 1280),
  height: Number(process.env.VIDEO_HEIGHT || 720),
  fps: Number(process.env.VIDEO_FPS || 30),
  fontFile: process.env.FONT_FILE || '',
  // member = 회원용 「K-영상제작기」 화면만 (경쟁사 해부 탭 숨김), lab = 대표님용 전체
  appMode: process.env.APP_MODE === 'member' ? 'member' : 'lab',
};

export function providers() {
  const forceDemo = process.env.DEMO_MODE === '1';
  const claude = !forceDemo && (has('ANTHROPIC_API_KEY') || has('ANTHROPIC_AUTH_TOKEN') || process.env.USE_CLAUDE === '1');
  const gemini = !forceDemo && has('GEMINI_API_KEY');
  // 분석·대본을 맡을 AI: 화면에서 고른 것(TEXT_AI) 우선, 없으면 Claude → Gemini 순
  const pref = process.env.TEXT_AI;
  const text = pref === 'gemini' && gemini ? 'gemini' : pref === 'claude' && claude ? 'claude' : claude ? 'claude' : gemini ? 'gemini' : null;
  return {
    claude,
    gemini,
    text,
    openai: !forceDemo && has('OPENAI_API_KEY'),
    elevenlabs: !forceDemo && has('ELEVENLABS_API_KEY'),
  };
}

// ── 화면에서 입력한 API 키를 .env 에 저장 ──────────────────────
export const KEY_NAMES = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY'];
const SETTING_NAMES = ['TEXT_AI'];

// 마지막 연결 확인 결과 (화면 배지에 '키 오류' 표시용)
export const keyHealth = {};

const mask = (v) => (v ? `${v.slice(0, 7)}…${v.slice(-4)}` : null);
export function keyStatus() {
  return Object.fromEntries(KEY_NAMES.map((k) => [k, mask(process.env[k]?.trim())]));
}

/** values: { ANTHROPIC_API_KEY?: string, TEXT_AI?: 'claude'|'gemini', ... } — 빈 문자열이면 지운다, undefined 면 그대로 둔다 */
export function saveKeys(values) {
  const envPath = path.join(ROOT, '.env');
  const examplePath = path.join(ROOT, '.env.example');
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '';
  for (const k of [...KEY_NAMES, ...SETTING_NAMES]) {
    if (values[k] === undefined) continue;
    const v = String(values[k]).trim().replace(/[\r\n]/g, '');
    const re = new RegExp(`^#?\\s*${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.replace(/\s*$/, '\n')}${k}=${v}\n`;
    if (v) process.env[k] = v;
    else delete process.env[k];
  }
  fs.writeFileSync(envPath, text);
}

// 목소리 목록. ElevenLabs 는 화면에서 키를 등록하면 내 계정 목소리를 자동으로 불러온다
// (.env 의 ELEVENLABS_VOICES="이름:voiceId,이름:voiceId" 로 직접 추가도 가능)
export function voices() {
  const p = providers();
  const list = [{ id: 'silent', provider: 'none', label: '무음 · 자막만 (체험)', desc: '목소리 없이 자막만' }];
  if (p.elevenlabs) {
    const seen = new Set();
    for (const v of elevenVoiceCache()) {
      seen.add(v.id);
      list.push({ id: `eleven:${v.id}`, provider: 'elevenlabs', label: v.name, desc: `ElevenLabs · ${categoryLabel(v.category)}` });
    }
    const raw = process.env.ELEVENLABS_VOICES || '';
    for (const pair of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [label, id] = pair.split(':');
      if (id && !seen.has(id)) list.push({ id: `eleven:${id}`, provider: 'elevenlabs', label, desc: 'ElevenLabs' });
    }
  }
  if (p.openai) {
    for (const [v, label] of [
      ['onyx', '낮고 묵직한 남성'], ['ash', '차분한 남성'], ['echo', '또렷한 남성'],
      ['nova', '밝은 여성'], ['coral', '따뜻한 여성'], ['sage', '지적인 여성'],
    ]) list.push({ id: `openai:${v}`, provider: 'openai', label: `${label} (${v})`, desc: 'OpenAI TTS' });
  }
  return list;
}
