// "절약한 시간"은 추정치입니다.
// 한글 타자 약 300타/분 ≈ 120자/분, 말하기 약 350자/분을 기준으로 계산합니다.
export const TYPING_CHARS_PER_MIN = 120;
export const SPEAKING_CHARS_PER_MIN = 350;

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("ko", { granularity: "grapheme" }) : null;

/** 공백을 뺀 글자 수. 이모지(👨‍👩‍👧)나 풀어 쓴 한글도 눈에 보이는 한 글자로 셉니다. */
export function countChars(text: string): number {
  const s = text.normalize("NFC").replace(/\s/g, "");
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(s)) n++;
    return n;
  }
  return [...s].length;
}

export function estimateSavedMs(resultText: string, rawText: string, spokenMs?: number): number {
  const typingMs = (countChars(resultText) / TYPING_CHARS_PER_MIN) * 60_000;
  const speakingMs = spokenMs && spokenMs > 0 ? spokenMs : (countChars(rawText) / SPEAKING_CHARS_PER_MIN) * 60_000;
  return Math.max(0, Math.round(typingMs - speakingMs));
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}초`;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

export function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
