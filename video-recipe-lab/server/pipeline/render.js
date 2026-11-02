// ⑦ 썸네일 편집 + ⑧ 최종 MP4 렌더링 (ffmpeg)
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, providers } from '../config.js';
import { ffmpeg, subtitleFontName } from './ffmpeg.js';
import { makeSceneImage, placeholderCard } from './images.js';

// 장면 1개 = 정지 그림 + 켄번스(천천히 확대/축소) + 내레이션
export async function renderSceneClip({ dir, index, image, audio, duration, scene, font }) {
  const { width: W, height: H, fps } = config;
  const N = Math.max(1, Math.round(duration * fps));
  const zoom = index % 2 === 0 ? `1+0.10*on/${N}` : `1.10-0.10*on/${N}`; // 짝수 장면 확대, 홀수 장면 축소
  const chain = [
    `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
    `crop=${W * 2}:${H * 2}`,
    `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}`,
  ];
  // 모션그래픽·그래프 장면은 키워드를 화면에 띄운다 (원본 프로그램의 "모션그래픽" 컷 흉내)
  if (font && scene.onScreenText && (scene.visualType === 'motion' || scene.visualType === 'chart')) {
    const tf = `scene_${String(index).padStart(3, '0')}.kw.txt`;
    await fs.writeFile(path.join(dir, tf), scene.onScreenText);
    const y = scene.visualType === 'motion' ? '(h-th)/2-h*0.06' : 'h*0.10';
    chain.push(
      `drawtext=expansion=none:fontfile=${font}:textfile=${tf}:fontsize=${Math.round(H / 9)}:fontcolor=0xc8ff3e:borderw=6:bordercolor=black:x=(w-tw)/2:y=${y}:alpha='min(1,t/0.4)'`,
    );
  }
  chain.push('format=yuv420p');
  const out = `clip_${String(index).padStart(3, '0')}.mp4`;
  await ffmpeg(
    [
      '-loop', '1', '-framerate', String(fps), '-t', duration.toFixed(3), '-i', image,
      '-i', audio,
      '-filter_complex', `[0:v]${chain.join(',')}[v]`,
      '-map', '[v]', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2',
      '-t', duration.toFixed(3),
      out,
    ],
    { cwd: dir },
  );
  return out;
}

export async function concatAndBurn({ dir, clips, srtFile }) {
  await fs.writeFile(path.join(dir, 'clips.txt'), clips.map((c) => `file '${c}'`).join('\n'));
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'clips.txt', '-c', 'copy', 'joined.mp4'], { cwd: dir });
  const style = [
    `FontName=${subtitleFontName()}`, 'FontSize=18', 'Bold=1',
    'PrimaryColour=&H00FFFFFF', 'OutlineColour=&H00000000', 'BorderStyle=1', 'Outline=2.2', 'Shadow=0', 'MarginV=28',
  ].join(',');
  await ffmpeg(
    [
      '-i', 'joined.mp4',
      '-vf', `subtitles=${srtFile}:fontsdir=.:force_style='${style}'`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'copy', '-movflags', '+faststart',
      'final.mp4',
    ],
    { cwd: dir },
  );
  return 'final.mp4';
}

// 썸네일: 배경 그림 + 아래쪽 어둡게 + 두 줄 큰 글씨(흰색 / 강조색) — 정보채널 썸네일 공식
export async function composeThumbnail({ dir, background, line1, line2, font, imagePrompt }) {
  let bg = background;
  if (providers().openai && imagePrompt) {
    try {
      // 썸네일 전용 배경을 따로 뽑는다. 실패하면 첫 장면 그림을 쓴다
      const r = await makeSceneImage({ dir, index: 999, scene: { imagePrompt, onScreenText: '', visualType: 'ai_image' }, font });
      bg = r.file;
    } catch {
      /* 장면 그림으로 대체 */
    }
  }
  if (!bg) bg = await placeholderCard({ dir, outName: 'thumb_bg', text: '', visualType: null, font: null });
  const W = 1280;
  const H = 720;
  const chain = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
    `drawbox=x=0:y=${Math.round(H * 0.42)}:w=${W}:h=${Math.round(H * 0.58)}:color=black@0.55:t=fill`,
  ];
  if (font) {
    await fs.writeFile(path.join(dir, 'thumb_l1.txt'), line1 || '');
    await fs.writeFile(path.join(dir, 'thumb_l2.txt'), line2 || '');
    chain.push(
      `drawtext=expansion=none:fontfile=${font}:textfile=thumb_l1.txt:fontsize=86:fontcolor=white:borderw=8:bordercolor=black:x=(w-tw)/2:y=${Math.round(H * 0.47)}`,
      `drawtext=expansion=none:fontfile=${font}:textfile=thumb_l2.txt:fontsize=128:fontcolor=0xffe600:borderw=10:bordercolor=black:x=(w-tw)/2:y=${Math.round(H * 0.64)}`,
    );
  }
  await ffmpeg(['-i', bg, '-frames:v', '1', '-vf', chain.join(','), 'thumbnail.jpg'], { cwd: dir });
  return 'thumbnail.jpg';
}
