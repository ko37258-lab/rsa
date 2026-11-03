// ⑥ 장면 컷 그림 — OpenAI 이미지 생성, 키가 없으면 ffmpeg 로 "자리표시 카드"를 그린다
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, providers } from '../config.js';
import { ffmpeg } from './ffmpeg.js';

export const VISUAL_LABEL = { ai_image: 'AI 그림', stock: '스톡 영상', chart: '그래프', motion: '모션그래픽' };

const PALETTE = {
  ai_image: ['0x0d211c', '0x16634a'],
  stock: ['0x1b1f2a', '0x3a4a63'],
  chart: ['0x0f1a17', '0x2d5a3d'],
  motion: ['0x07120f', '0x4a6b10'],
};

async function openaiImage(prompt, outFile) {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.openaiImageModel,
      prompt: `${prompt}. 16:9 cinematic composition, no text, no letters, no watermark.`,
      size: '1536x1024',
      n: 1,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI 이미지 ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI 이미지 응답에 데이터가 없습니다');
  await fs.writeFile(outFile, Buffer.from(b64, 'base64'));
}

// 키 없이 쓰는 대체 카드: 장면 유형별 그라데이션 + 키워드
export async function placeholderCard({ dir, outName, text, visualType, font }) {
  const [c0, c1] = PALETTE[visualType] || PALETTE.ai_image;
  const { width: W, height: H } = config;
  const filters = [];
  if (font) {
    // 모션그래픽·그래프 장면은 렌더 단계에서 키워드를 애니메이션으로 올리므로 여기선 그리지 않는다
    if (text && visualType !== 'motion' && visualType !== 'chart') {
      const tf = `${outName}.txt`;
      await fs.writeFile(path.join(dir, tf), text);
      filters.push(
        `drawtext=expansion=none:fontfile=${font}:textfile=${tf}:fontsize=${Math.round(H / 9)}:fontcolor=white:borderw=5:bordercolor=black:x=(w-tw)/2:y=(h-th)/2`,
      );
    }
    if (visualType) {
      const lf = `${outName}.label.txt`;
      await fs.writeFile(path.join(dir, lf), `[대체 이미지] ${VISUAL_LABEL[visualType] || ''}`);
      filters.push(
        `drawtext=expansion=none:fontfile=${font}:textfile=${lf}:fontsize=${Math.round(H / 30)}:fontcolor=0xc8ff3e:x=${Math.round(W * 0.09)}:y=${Math.round(H * 0.09)}`,
      );
    }
  }
  if (visualType === 'chart') {
    // 그래프 유형은 막대 몇 개로 분위기만 낸다
    const base = Math.round(H * 0.86);
    [0.18, 0.32, 0.55, 0.8].forEach((r, i) => {
      const bh = Math.round(H * 0.5 * r);
      filters.unshift(`drawbox=x=${Math.round(W * (0.12 + i * 0.2))}:y=${base - bh}:w=${Math.round(W * 0.11)}:h=${bh}:color=0xc8ff3e@0.22:t=fill`);
    });
  }
  const args = ['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${W}:y1=${H}:nb_colors=2`, '-frames:v', '1'];
  if (filters.length) args.push('-vf', filters.join(','));
  args.push(`${outName}.png`);
  await ffmpeg(args, { cwd: dir });
  return `${outName}.png`;
}

/**
 * 장면 그림 파일명(작업 폴더 기준)을 돌려준다.
 * ai: { off: boolean, error?: string } — 한 작업 안에서 공유. AI 그림이 한 번 실패하면 나머지는 대체 카드로.
 */
export async function makeSceneImage({ dir, index, scene, font, ai = { off: false } }) {
  const outName = `scene_${String(index).padStart(3, '0')}`;
  if (providers().openai && !ai.off) {
    const file = `${outName}.png`;
    try {
      await openaiImage(scene.imagePrompt, path.join(dir, file));
      return { file, source: 'openai' };
    } catch (e) {
      ai.off = true;
      ai.error ??= String(e.message || e);
    }
  }
  const file = await placeholderCard({ dir, outName, text: scene.onScreenText, visualType: scene.visualType, font });
  return { file, source: 'placeholder' };
}

// 키 확인: 모델 목록 조회는 요금이 나가지 않는다
export async function verifyOpenAI() {
  try {
    const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    if (r.ok) return { ok: true, msg: '연결됨 (그림·목소리 사용 가능)' };
    if (r.status === 401) return { ok: false, msg: '키가 올바르지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 확인하세요.' };
    if (r.status === 429) return { ok: false, msg: '사용 한도 초과 또는 결제 미등록입니다. OpenAI 결제(Billing) 페이지를 확인하세요.' };
    return { ok: false, msg: `OpenAI 응답 오류 (${r.status})` };
  } catch {
    return { ok: false, msg: '인터넷 연결을 확인하세요 (OpenAI 서버에 연결 실패).' };
  }
}
