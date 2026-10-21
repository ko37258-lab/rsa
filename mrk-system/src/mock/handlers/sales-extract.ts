/**
 * 고객 메시지에서 문의 조건 읽기 — 원본 /api/inquiries/:id/drafts 의 「고객 메일에서 읽은 …」을
 * 규칙(정규식)으로 대신한다. 한국어·영어 메일을 둘 다 읽는다. 외부 AI 호출은 없다.
 */
import { plusMonth, ym } from "@/lib/dates";

export interface Found<T> {
  value: T;
  text: string; // 근거가 된 원문 조각
}

export interface Extracted {
  move_in: Found<string> | null; // yyyy-MM-dd
  months: Found<number> | null;
  budget: Found<number> | null; // 원
  people: Found<number> | null;
  phone: Found<string> | null;
  email: Found<string> | null;
  first_sentence: string | null;
}

const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const KO_COUNT: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 };
const EN_COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const pad = (n: number) => String(n).padStart(2, "0");

/** 월·일만 있으면 오늘 이후가 되도록 해를 정한다 */
function withYear(month: number, day: number, today: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let y = Number(today.slice(0, 4));
  let d = `${y}-${pad(month)}-${pad(day)}`;
  // 한 달 넘게 지난 날짜면 내년으로 본다(이번 달 초처럼 막 지난 날은 올해)
  if (d < `${plusMonth(ym(today), -1)}-01`) {
    y += 1;
    d = `${y}-${pad(month)}-${pad(day)}`;
  }
  return d;
}

function findMoveIn(text: string, today: string): Found<string> | null {
  let m = text.match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/);
  if (m) return { value: `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`, text: m[0] };
  m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m) {
    const v = withYear(Number(m[1]), Number(m[2]), today);
    if (v) return { value: v, text: m[0] };
  }
  m = text.match(/(다음|이번)\s*달\s*(\d{1,2})\s*일/);
  if (m) {
    const month = m[1] === "다음" ? plusMonth(ym(today), 1) : ym(today);
    return { value: `${month}-${pad(Number(m[2]))}`, text: m[0] };
  }
  // "1/5", "12/1" — 분수(1/2)·날짜(2026/10) 와 헷갈리지 않게 앞뒤가 숫자가 아닐 때만
  m = text.match(/(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (m) {
    const v = withYear(Number(m[1]), Number(m[2]), today);
    if (v) return { value: v, text: m[0].replace(/^[^\d]/, "") };
  }
  // "January 5", "Jan 5th", "5 January"
  const en = text.toLowerCase();
  m = en.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) {
    const v = withYear(EN_MONTHS.indexOf(m[1]) + 1, Number(m[2]), today);
    if (v) return { value: v, text: m[0] };
  }
  m = en.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (m) {
    const v = withYear(EN_MONTHS.indexOf(m[2]) + 1, Number(m[1]), today);
    if (v) return { value: v, text: m[0] };
  }
  m = en.match(/\b(?:in|from|starting|start of|early)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  if (m) {
    const v = withYear(EN_MONTHS.indexOf(m[1].slice(0, 3)) + 1, 1, today);
    if (v) return { value: v, text: m[0] };
  }
  m = text.match(/(\d{1,2})\s*월\s*(초|부터|중순|말)/);
  if (m) {
    const day = m[2] === "중순" ? 15 : m[2] === "말" ? 25 : 1;
    const v = withYear(Number(m[1]), day, today);
    if (v) return { value: v, text: m[0] };
  }
  return null;
}

function findMonths(text: string): Found<number> | null {
  let m = text.match(/(\d{1,2})\s*개월/);
  if (m) return { value: Number(m[1]), text: m[0] };
  m = text.match(/반\s*년/);
  if (m) return { value: 6, text: m[0] };
  m = text.match(/(일|1)\s*년\s*(?:정도|동안|간|계약|살)/);
  if (m) return { value: 12, text: m[0] };
  const en = text.toLowerCase();
  m = en.match(/\b(\d{1,2})\s*months?\b/);
  if (m) return { value: Number(m[1]), text: m[0] };
  m = en.match(/\b(one|two|three|four|five|six)\s+months?\b/);
  if (m) return { value: EN_COUNT[m[1]], text: m[0] };
  m = en.match(/\bhalf\s+a\s+year\b/);
  if (m) return { value: 6, text: m[0] };
  m = en.match(/\b(?:a|one)\s+year\b/);
  if (m) return { value: 12, text: m[0] };
  m = en.match(/\b(semester)\b/);
  if (m) return null;
  return null;
}

function findBudget(text: string): Found<number> | null {
  const cands: Array<Found<number> & { score: number; at: number }> = [];
  const push = (value: number, raw: string, at: number) => {
    if (value < 200000 || value > 5000000) return; // 월세로 보기 어려운 금액(보증금 등)
    const before = text.slice(Math.max(0, at - 8), at);
    const near = text.slice(Math.max(0, at - 12), at + raw.length + 8);
    // 바로 앞이 "보증금" 이면 월세가 아니다. 그 밖에는 월세·예산 단서가 가까이 있으면 높게 친다
    const score = /보증금|deposit/i.test(before) ? -2 : /월세|월\s|예산|budget|rent|안쪽|이하|이내|정도|around|max|under|per month|a month|\/month/i.test(near) ? 2 : 0;
    cands.push({ value, text: raw.trim(), score, at });
  };
  for (const m of text.matchAll(/(\d{1,3}(?:\.\d)?)\s*만\s*원?/g)) push(Math.round(Number(m[1]) * 10000), m[0], m.index ?? 0);
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d{6,7})\s*(?:원|krw|won|₩)/gi)) push(Number(m[1].replace(/,/g, "")), m[0], m.index ?? 0);
  for (const m of text.matchAll(/(?:₩|krw\s?)(\d{1,3}(?:,\d{3})+|\d{6,7})/gi)) push(Number(m[1].replace(/,/g, "")), m[0], m.index ?? 0);
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || a.at - b.at);
  return cands[0].score < 0 ? null : { value: cands[0].value, text: cands[0].text };
}

function findPeople(text: string): Found<number> | null {
  let m = text.match(/(\d{1,2})\s*(?:명|인(?![가-힣]))/);
  if (m && Number(m[1]) > 0) return { value: Number(m[1]), text: m[0] };
  m = text.match(/(한|두|세|네|다섯|여섯)\s*명/);
  if (m) return { value: KO_COUNT[m[1]], text: m[0] };
  m = text.match(/둘이|둘\s*이서/);
  if (m) return { value: 2, text: m[0] };
  const en = text.toLowerCase();
  m = en.match(/\b(\d{1,2})\s*(?:people|persons|guests|tenants|of us|employees|staff)\b/);
  if (m) return { value: Number(m[1]), text: m[0] };
  m = en.match(/\b(one|two|three|four|five|six)\s+(?:people|persons|guests|of us|employees)\b/);
  if (m) return { value: EN_COUNT[m[1]], text: m[0] };
  m = en.match(/\b(?:my|with my)\s+(?:partner|wife|husband|friend|girlfriend|boyfriend)\b/);
  if (m) return { value: 2, text: m[0] };
  return null;
}

function findPhone(text: string): Found<string> | null {
  const m = text.match(/(?:\+82[\s-]?|0)(1[016789])[\s.-]?(\d{3,4})[\s.-]?(\d{4})/) ?? text.match(/\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  if (!m) return null;
  if (m.length >= 4 && m[1]) return { value: `0${m[1]}-${m[2]}-${m[3]}`, text: m[0] };
  return { value: m[0].replace(/\s+/g, " ").trim(), text: m[0] };
}

function findEmail(text: string): Found<string> | null {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? { value: m[0], text: m[0] } : null;
}

const GREETING = /^(안녕하세요|안녕하십니까|hello|hi|dear|good (morning|afternoon|evening)|to whom)/i;

/** 고객이 쓴 첫 문장(인사말만 있는 문장은 건너뛴다) */
export function firstSentence(text: string): string | null {
  const parts = text
    .split(/(?<=[.!?。？！])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pick = parts.find((s) => !(GREETING.test(s) && s.length <= 30)) ?? parts[0];
  if (!pick) return null;
  return pick.length > 120 ? `${pick.slice(0, 118)}…` : pick;
}

export function extract(text: string, today: string): Extracted {
  return {
    move_in: findMoveIn(text, today),
    months: findMonths(text),
    budget: findBudget(text),
    people: findPeople(text),
    phone: findPhone(text),
    email: findEmail(text),
    first_sentence: firstSentence(text),
  };
}
