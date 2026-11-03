// ⑤ SRT 자막 — 장면 내레이션을 짧은 줄로 쪼개고, 글자 수 비례로 시간을 나눈다
const MAX_CHARS = 22;

export function splitLines(text) {
  const sentences = text.split(/(?<=[.?!。])\s+/).filter(Boolean);
  const lines = [];
  for (const s of sentences) {
    if (s.length <= MAX_CHARS) {
      lines.push(s);
      continue;
    }
    // 쉼표·띄어쓰기 기준으로 22자 안쪽에서 끊는다
    let buf = '';
    for (const word of s.split(/\s+/)) {
      if ((buf + ' ' + word).trim().length > MAX_CHARS && buf) {
        lines.push(buf.trim());
        buf = word;
      } else buf = `${buf} ${word}`;
    }
    if (buf.trim()) lines.push(buf.trim());
  }
  return lines;
}

const ts = (sec) => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

/** scenes: [{narration, start, duration}] → SRT 문자열 */
export function buildSrt(scenes) {
  const cues = [];
  for (const sc of scenes) {
    const lines = splitLines(sc.narration);
    const total = lines.reduce((a, l) => a + l.length, 0) || 1;
    let t = sc.start;
    for (const l of lines) {
      const d = (sc.duration * l.length) / total;
      cues.push({ start: t, end: t + d - 0.05, text: l });
      t += d;
    }
  }
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join('\n');
}
