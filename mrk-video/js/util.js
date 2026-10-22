// 여러 화면이 함께 쓰는 작은 도구 모음

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => Math.random().toString(36).slice(2, 10);

export function debounce(fn, ms = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** 00:12.3 형식 */
export function formatTime(sec) {
  sec = Math.max(0, sec || 0);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/** SRT 시간 형식 00:00:01,250 */
export function srtTime(sec) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function baseName(name = '') {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/** 파일 이름에 못 쓰는 글자를 지웁니다. */
export function safeFileName(name, fallback = 'image') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** 같은 이름이 겹치면 (2), (3)을 붙입니다. */
export function uniqueNamer() {
  const used = new Set();
  return (name) => {
    let out = name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 2; used.has(out.toLowerCase()); n++) out = `${stem} (${n})${ext}`;
    used.add(out.toLowerCase());
    return out;
  };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 열 수 없습니다.'));
    img.src = src;
  });
}

/** 사용자가 고른 파일 → <img> (object URL 사용) */
export async function imageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    img.dataset.name = file.name;
    return img;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error(`${file.name}: 이미지 파일이 아니거나 손상되었습니다.`);
  }
}

export function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지로 저장하지 못했습니다.'))), type, quality);
  });
}

export const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
export const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp' };

/** 이미지를 사각형 안에 맞춰 그립니다. mode: contain | cover. zoom·ox·oy로 켄번스 움직임을 줍니다. */
export function drawImageFit(ctx, img, x, y, w, h, mode = 'cover', zoom = 1, ox = 0, oy = 0) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const base = mode === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const s = base * zoom;
  const dw = iw * s;
  const dh = ih * s;
  const slackX = Math.abs(dw - w) / 2;
  const slackY = Math.abs(dh - h) / 2;
  const dx = x + (w - dw) / 2 + ox * slackX;
  const dy = y + (h - dh) / 2 + oy * slackY;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let toastTimer;
export function toast(msg, ms = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** 브라우저 저장소(없거나 막혀 있어도 동작) */
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('mrk:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('mrk:' + key, JSON.stringify(value)); } catch { /* 저장소 사용 불가 */ }
  },
};

/** 끌어다 놓기 영역에 파일 드롭을 연결합니다. */
export function wireDrop(label, onFiles) {
  const input = label.querySelector('input[type=file]');
  input?.addEventListener('change', () => {
    if (input.files?.length) onFiles([...input.files]);
    input.value = '';
  });
  label.addEventListener('dragover', (e) => { e.preventDefault(); label.classList.add('over'); });
  label.addEventListener('dragleave', () => label.classList.remove('over'));
  label.addEventListener('drop', (e) => {
    e.preventDefault();
    label.classList.remove('over');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) onFiles(files);
  });
}

/** 예시용 그림을 캔버스로 그려 <img>로 돌려줍니다(외부 파일 없이 첫 화면을 채우기 위함). */
export async function makeSampleImage(kind, w = 1200, h = 1200) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  const palettes = {
    land: ['#8ec5ff', '#dff1ff', '#7fb36a'],
    road: ['#f7c59f', '#ffe8d2', '#9c8f7a'],
    permit: ['#9aa7ff', '#e6e9ff', '#6f9d6a'],
    city: ['#1c2a5a', '#46609b', '#2b2f3a'],
    product: ['#f4efe9', '#ffffff', '#e8e1d8'],
    tag: ['#1d47c9', '#3d67e6', '#1d47c9'],
  };
  const [a, b, ground] = palettes[kind] || palettes.land;
  sky.addColorStop(0, a); sky.addColorStop(0.62, b);
  g.fillStyle = sky; g.fillRect(0, 0, w, h);

  if (kind === 'product') {
    g.fillStyle = ground; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath(); g.ellipse(w / 2, h * 0.76, w * 0.24, h * 0.04, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e5c8a'; roundRectPath(g, w * 0.32, h * 0.26, w * 0.36, h * 0.5, w * 0.04); g.fill();
    g.fillStyle = '#f6f2ea'; roundRectPath(g, w * 0.36, h * 0.38, w * 0.28, h * 0.2, w * 0.02); g.fill();
    g.fillStyle = '#2e5c8a'; g.font = `700 ${w * 0.05}px "IBM Plex Sans KR", sans-serif`; g.textAlign = 'center';
    g.fillText('SAMPLE', w / 2, h * 0.5);
  } else if (kind === 'tag') {
    await document.fonts?.load?.(`${w * 0.2}px "Black Han Sans"`, '1+1').catch(() => null);
    g.fillStyle = '#fff'; g.font = `${w * 0.2}px "Black Han Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('1+1', w / 2, h / 2);
  } else {
    // 땅·도로·건물을 단순한 도형으로
    const horizon = h * 0.58;
    g.fillStyle = ground; g.fillRect(0, horizon, w, h - horizon);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = w * 0.004;
    for (let i = 1; i < 6; i++) {
      g.beginPath(); g.moveTo(w * (i / 6) - w * 0.25, h); g.lineTo(w * 0.5 + (i - 3) * w * 0.05, horizon); g.stroke();
    }
    g.beginPath(); g.moveTo(0, horizon + (h - horizon) * 0.45); g.lineTo(w, horizon + (h - horizon) * 0.3); g.stroke();
    if (kind === 'road' || kind === 'city') {
      g.fillStyle = '#4a4d55';
      g.beginPath(); g.moveTo(w * 0.42, h); g.lineTo(w * 0.49, horizon); g.lineTo(w * 0.51, horizon); g.lineTo(w * 0.62, h); g.closePath(); g.fill();
      g.strokeStyle = '#f2d14b'; g.setLineDash([w * 0.03, w * 0.03]);
      g.beginPath(); g.moveTo(w * 0.52, h); g.lineTo(w * 0.5, horizon); g.stroke(); g.setLineDash([]);
    }
    if (kind === 'city' || kind === 'permit') {
      const n = kind === 'city' ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const bw = w * (0.06 + (i % 3) * 0.02);
        const bh = h * (0.12 + ((i * 37) % 5) * 0.05);
        const bx = w * 0.04 + i * (w * 0.92 / n);
        g.fillStyle = kind === 'city' ? `hsl(225 30% ${22 + (i % 3) * 7}%)` : '#ffffff';
        g.fillRect(bx, horizon - bh, bw, bh);
        g.fillStyle = kind === 'city' ? 'rgba(255,214,120,0.8)' : 'rgba(29,71,201,0.35)';
        for (let yy = horizon - bh + bh * 0.1; yy < horizon - bh * 0.1; yy += bh * 0.16) {
          g.fillRect(bx + bw * 0.2, yy, bw * 0.2, bh * 0.06);
          g.fillRect(bx + bw * 0.6, yy, bw * 0.2, bh * 0.06);
        }
      }
    }
    if (kind === 'land' || kind === 'permit') {
      g.strokeStyle = '#e8473c'; g.lineWidth = w * 0.008; g.setLineDash([w * 0.02, w * 0.014]);
      g.strokeRect(w * 0.3, horizon + (h - horizon) * 0.18, w * 0.4, (h - horizon) * 0.5); g.setLineDash([]);
    }
  }
  const url = c.toDataURL('image/jpeg', 0.86);
  const img = await loadImage(url);
  img.dataset.name = `예시-${kind}.jpg`;
  img.dataset.sample = '1';
  return img;
}
