// ffmpeg / ffprobe 실행 도우미 + 한글 폰트 찾기
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export function run(cmd, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-20000);
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 실패 (code ${code})\n${err.slice(-1500)}`))));
  });
}

export const ffmpeg = (args, opts) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

export function probeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
  return Number.parseFloat(out) || 0;
}

export function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 한글이 나오는 굵은 폰트를 찾는다. 찾은 폰트는 작업 폴더에 font.ttf 로 복사해서
// ffmpeg 필터에 상대경로로 넘긴다 (Windows 의 "C:\" 경로 이스케이프 지옥을 피하는 요령).
let cachedFont;
export function resolveFont() {
  if (cachedFont !== undefined) return cachedFont;
  const candidates = [
    config.fontFile,
    'C:/Windows/Fonts/malgunbd.ttf',
    'C:/Windows/Fonts/malgun.ttf',
    '/System/Library/Fonts/AppleSDGothicNeo.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
  ].filter(Boolean);
  cachedFont = candidates.find((f) => fs.existsSync(f)) || null;
  if (!cachedFont) {
    try {
      const f = execFileSync('fc-match', ['-f', '%{file}', 'sans:lang=ko:weight=bold']).toString().trim();
      if (f && fs.existsSync(f)) cachedFont = f;
    } catch {
      /* fontconfig 없음 */
    }
  }
  return cachedFont;
}

// 자막(libass)은 폰트 "이름"이 필요하다
export function subtitleFontName() {
  if (process.env.SUBTITLE_FONT) return process.env.SUBTITLE_FONT;
  if (process.platform === 'win32') return 'Malgun Gothic';
  if (process.platform === 'darwin') return 'Apple SD Gothic Neo';
  try {
    return execFileSync('fc-match', ['-f', '%{family[0]}', 'sans:lang=ko']).toString().trim() || 'sans-serif';
  } catch {
    return 'sans-serif';
  }
}

export function copyFontInto(dir) {
  const f = resolveFont();
  if (!f) return null;
  const ext = path.extname(f).toLowerCase() === '.ttc' ? '.ttc' : '.ttf';
  const dest = path.join(dir, `font${ext}`);
  if (!fs.existsSync(dest)) fs.copyFileSync(f, dest);
  return path.basename(dest);
}
