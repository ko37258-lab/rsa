// 03 이미지 일괄 다운로드 — 엑셀 붙여넣기 목록 → 크기·용량·이름 맞춰 일괄 저장

import {
  $, clamp, sleep, store, toast, safeFileName, uniqueNamer, canvasToBlob, drawImageFit,
  MIME_BY_EXT, EXT_BY_MIME, uid,
} from './util.js';
import { inArtifact, canPickFolder, openSink, fetchImageBlob, serverInfo } from './platform.js';
import { DOWNLOAD_CASE } from './samples.js';

const DEFAULTS = {
  rename: true, prefix: 'mrk', suffix: 'main',
  resize: true, w: 1000, h: 1000,
  compress: '0.85', format: 'jpg', interval: '1-2', sink: 'zip',
};
const opt = { ...DEFAULTS, ...store.get('download', {}) };
const persist = () => store.set('download', opt);

/** 행: { id, code, url, file?, status: idle|wait|busy|done|fail, note, saved } */
let rows = [];
let running = null; // { abort: AbortController }

const blankRow = () => ({ id: uid(), code: '', url: '', file: null, status: 'idle', note: '', saved: '' });
const isUrl = (s) => /^https?:\/\/\S+$/i.test(String(s).trim());
const rowValid = (r) => !!r.file || isUrl(r.url);

function ensureRows(n) {
  while (rows.length < n) rows.push(blankRow());
}

// ── 표 그리기 ─────────────────────────────────────────
const STATUS_TEXT = { idle: '', wait: '대기', busy: '받는 중', done: '완료', fail: '실패' };

function render() {
  const tbody = $('#dlBody');
  tbody.textContent = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    const num = td('num', String(i + 1));
    const code = td('code');
    code.append(cellInput(r, 'code', i, '예: A1001'));
    const url = td(r.file ? 'local' : 'url');
    if (r.file) url.textContent = `PC 파일 · ${r.file.name}`;
    else url.append(cellInput(r, 'url', i, 'https://…'));
    const save = td('save', r.saved || previewName(r, i));
    const state = td('state');
    const st = document.createElement('span');
    st.className = `st ${r.status}`;
    st.textContent = STATUS_TEXT[r.status];
    st.title = r.note || '';
    if (r.status === 'fail' && r.note) st.textContent = `실패 · ${r.note}`;
    state.append(st);
    const del = td('del num');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '✕';
    b.setAttribute('aria-label', `${i + 1}번 행 지우기`);
    b.addEventListener('click', () => { rows.splice(i, 1); ensureRows(1); render(); });
    del.append(b);
    tr.append(num, code, url, save, state, del);
    tbody.append(tr);
  });
  updateCounts();
}

function td(cls, text) {
  const el = document.createElement('td');
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function cellInput(r, key, rowIndex, ph) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = r[key];
  inp.placeholder = ph;
  inp.dataset.row = rowIndex;
  inp.dataset.key = key;
  inp.setAttribute('aria-label', `${rowIndex + 1}번 행 ${key === 'code' ? '상품 코드' : '이미지 주소'}`);
  inp.addEventListener('input', () => {
    r[key] = inp.value.trim();
    r.status = 'idle';
    r.saved = '';
    const tr = inp.closest('tr');
    tr.querySelector('td.save').textContent = previewName(r, rowIndex);
    updateCounts();
  });
  inp.addEventListener('paste', (e) => onPaste(e, rowIndex, key));
  return inp;
}

/** 엑셀에서 여러 줄·여러 칸을 붙여 넣으면 아래 행으로 나눠 채웁니다. */
function onPaste(e, rowIndex, key) {
  const text = e.clipboardData?.getData('text/plain') ?? '';
  if (!/[\t\n]/.test(text.trim())) return; // 한 칸짜리는 그대로 붙여넣기
  e.preventDefault();
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  ensureRows(rowIndex + lines.length);
  lines.forEach((line, k) => {
    const cells = line.split('\t').map((c) => c.trim());
    const r = rows[rowIndex + k];
    if (r.file) return;
    if (cells.length >= 2) {
      // 두 칸 이상: 주소처럼 생긴 칸을 주소로, 나머지 첫 칸을 코드로
      const ui = cells.findIndex(isUrl);
      if (ui >= 0) {
        r.url = cells[ui];
        r.code = cells.find((c, j) => j !== ui && c) || r.code;
      } else {
        r.code = cells[0];
        r.url = cells[1];
      }
    } else if (key === 'url' || isUrl(cells[0])) {
      r.url = cells[0];
    } else {
      r.code = cells[0];
    }
    r.status = 'idle';
    r.saved = '';
  });
  render();
  toast(`${lines.length}줄을 붙여 넣었습니다.`);
}

// ── 이름 · 변환 ───────────────────────────────────────
function outExt(r, srcType) {
  if (opt.format === 'keep') return EXT_BY_MIME[srcType] || guessExt(r) || 'jpg';
  return opt.format;
}

function guessExt(r) {
  const src = r.file ? r.file.name : (() => { try { return new URL(r.url).pathname; } catch { return ''; } })();
  const m = /\.(jpe?g|png|webp|gif|avif|bmp)$/i.exec(src);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : '';
}

function stemOf(r, i) {
  if (opt.rename) {
    const parts = [opt.prefix, r.code || String(i + 1).padStart(3, '0'), opt.suffix].map((s) => String(s || '').trim()).filter(Boolean);
    return safeFileName(parts.join('_'), `image_${i + 1}`);
  }
  if (r.file) return safeFileName(r.file.name.replace(/\.[^.]+$/, ''), `image_${i + 1}`);
  try {
    const last = decodeURIComponent(new URL(r.url).pathname.split('/').pop() || '');
    return safeFileName(last.replace(/\.[^.]+$/, '') || r.code, `image_${i + 1}`);
  } catch {
    return safeFileName(r.code, `image_${i + 1}`);
  }
}

function previewName(r, i) {
  if (!rowValid(r)) return '';
  const ext = opt.format === 'keep' ? guessExt(r) || '원본' : opt.format;
  return `${stemOf(r, i)}.${ext}`;
}

async function convert(blob) {
  const keepAsIs = opt.format === 'keep' && !opt.resize && opt.compress === '0.95';
  if (keepAsIs) return blob;
  let bmp;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    throw new Error('이미지가 아니거나 열 수 없는 형식');
  }
  const W = opt.resize ? clamp(Number(opt.w) || 1000, 300, 1500) : bmp.width;
  const H = opt.resize ? clamp(Number(opt.h) || 1000, 300, 1500) : bmp.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const ext = opt.format === 'keep' ? EXT_BY_MIME[blob.type] || 'jpg' : opt.format;
  const mime = MIME_BY_EXT[ext] || 'image/jpeg';
  if (mime === 'image/jpeg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }
  g.imageSmoothingQuality = 'high';
  if (opt.resize) drawImageFit(g, bmp, 0, 0, W, H, 'contain');
  else g.drawImage(bmp, 0, 0);
  bmp.close?.();
  return canvasToBlob(c, mime, mime === 'image/png' ? undefined : Number(opt.compress));
}

// ── 실행 ─────────────────────────────────────────────
async function start() {
  const todo = rows.map((r, i) => ({ r, i })).filter(({ r }) => rowValid(r));
  if (!todo.length) return toast('받을 이미지 주소나 PC 사진이 없습니다.');
  let sink;
  try {
    sink = await openSink(opt.sink, `이미지_${todo.length}개.zip`);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    return toast(e.message || '저장 위치를 열지 못했습니다.');
  }
  const abort = new AbortController();
  running = { abort };
  $('#dlStart').disabled = true;
  $('#dlStop').disabled = false;
  todo.forEach(({ r }) => { r.status = 'wait'; r.note = ''; r.saved = ''; });
  render();
  const nameOf = uniqueNamer();
  const [lo, hi] = opt.interval.split('-').map(Number);
  let done = 0;
  let ok = 0;
  setProgress(0, todo.length);
  for (const { r, i } of todo) {
    if (abort.signal.aborted) break;
    setStatus(r, 'busy');
    try {
      const src = r.file ? r.file : await fetchImageBlob(r.url, abort.signal);
      const out = await convert(src);
      const name = nameOf(`${stemOf(r, i)}.${outExt(r, src.type)}`);
      await sink.add(name, out);
      r.saved = name;
      setStatus(r, 'done');
      ok++;
    } catch (e) {
      if (e?.name === 'AbortError') { setStatus(r, 'idle'); break; }
      r.note = e.message || '알 수 없는 오류';
      setStatus(r, 'fail');
    }
    done++;
    setProgress(done, todo.length);
    const next = todo[done];
    if (next && !next.r.file && !r.file && !abort.signal.aborted) await sleep((lo + Math.random() * (hi - lo)) * 1000);
  }
  rows.forEach((r) => { if (r.status === 'wait') r.status = 'idle'; });
  render();
  try {
    if (ok) {
      $('#dlProgressText').textContent = `${ok}개 저장 중…`;
      const saved = await sink.finish();
      toast(saved === false ? '저장을 취소했습니다.' : `${ok}개 저장 완료 → ${sink.label}${done - ok ? ` · 실패 ${done - ok}개` : ''}`);
    } else {
      toast('저장된 이미지가 없습니다. 상태 칸의 실패 이유를 확인하세요.');
    }
  } catch (e) {
    toast(e.message || '저장하지 못했습니다.');
  }
  setProgress(done, todo.length);
  running = null;
  $('#dlStart').disabled = false;
  $('#dlStop').disabled = true;
}

function setStatus(r, s) {
  r.status = s;
  const tr = document.querySelector(`#dlBody tr[data-id="${r.id}"]`);
  if (!tr) return;
  const st = tr.querySelector('.st');
  st.className = `st ${s}`;
  st.textContent = s === 'fail' && r.note ? `실패 · ${r.note}` : STATUS_TEXT[s];
  st.title = r.note || '';
  if (r.saved) tr.querySelector('td.save').textContent = r.saved;
}

function setProgress(done, total) {
  $('#dlProgress').firstElementChild.style.transform = `scaleX(${total ? done / total : 0})`;
  $('#dlProgressText').textContent = `${done} / ${total}`;
}

function updateCounts() {
  const filled = rows.filter((r) => r.file || r.url || r.code).length;
  const valid = rows.filter(rowValid).length;
  $('#dlCountIn').textContent = `입력 ${filled}개`;
  $('#dlCountOk').textContent = `유효 ${valid}개`;
}

// ── 옵션 연결 ─────────────────────────────────────────
const BIND = [
  ['dlRename', 'rename', 'check'], ['dlPrefix', 'prefix'], ['dlSuffix', 'suffix'],
  ['dlResize', 'resize', 'check'], ['dlW', 'w', Number], ['dlH', 'h', Number],
  ['dlCompress', 'compress'], ['dlFormat', 'format'], ['dlInterval', 'interval'], ['dlSink', 'sink'],
];

export async function initDownloader() {
  if (!canPickFolder) {
    $('#dlSink').querySelector('option[value=folder]').disabled = true;
    if (opt.sink === 'folder') opt.sink = 'zip';
  }
  for (const [id, key, kind] of BIND) {
    const el = document.getElementById(id);
    if (kind === 'check') el.checked = !!opt[key];
    else el.value = opt[key];
    el.addEventListener('input', () => {
      opt[key] = kind === 'check' ? el.checked : kind ? kind(el.value) : el.value;
      persist();
      $('#dlPrefix').disabled = $('#dlSuffix').disabled = !opt.rename;
      $('#dlW').disabled = $('#dlH').disabled = !opt.resize;
      if (!running) render();
    });
  }
  $('#dlPrefix').disabled = $('#dlSuffix').disabled = !opt.rename;
  $('#dlW').disabled = $('#dlH').disabled = !opt.resize;

  $('#dlSample').addEventListener('click', () => {
    // 같은 폴더의 예시 이미지를 절대 주소로(어느 환경에서든 같은 출처라 바로 받아집니다)
    rows = rows.filter((r) => r.file || r.url || r.code);
    for (const [code, url] of DOWNLOAD_CASE) rows.push({ ...blankRow(), code, url: new URL(url, location.href).href });
    ensureRows(6);
    render();
  });
  $('#dlAddRows').addEventListener('click', () => { ensureRows(rows.length + 5); render(); });
  $('#dlClear').addEventListener('click', () => { if (running) return; rows = []; ensureRows(6); render(); });
  $('#dlLocalBtn').addEventListener('click', () => $('#dlLocal').click());
  $('#dlLocal').addEventListener('change', (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    rows = rows.filter((r) => r.file || r.url || r.code);
    files.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    for (const f of files) rows.push({ ...blankRow(), file: f, code: f.name.replace(/\.[^.]+$/, '') });
    ensureRows(6);
    render();
    toast(`PC 사진 ${files.length}장을 목록에 넣었습니다.`);
  });
  $('#dlStart').addEventListener('click', start);
  $('#dlStop').addEventListener('click', () => running?.abort.abort());

  const info = await serverInfo();
  const notice = $('#dlNotice');
  if (inArtifact) {
    notice.hidden = false;
    notice.textContent = '이 미리보기 화면에서는 외부 사이트 이미지를 받을 수 없습니다(예시 이미지와 “PC 사진 추가”는 동작합니다). 다른 사이트 주소로 받는 기능은 인터넷 배포 버전에서 동작합니다.';
  } else if (!info.proxy) {
    notice.hidden = false;
    notice.textContent = '서버 프록시 없이 실행 중입니다. 다른 사이트 이미지 중 직접 받기를 막아 둔 곳(CORS)은 실패할 수 있습니다. Vercel로 배포하면 서버 프록시가 함께 켜집니다.';
  }

  ensureRows(6);
  render();
}
