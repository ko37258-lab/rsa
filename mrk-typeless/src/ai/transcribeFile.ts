// 녹음 파일 받아쓰기: 휴대폰 녹음(m4a)·강의 녹음(mp3)·영상(mp4)을 올리면 글로 바꿉니다.
//
// - Gemini: 14MB 이하는 요청에 바로 담고(한 요청 20MB 한도, base64로 33% 늘어남), 더 크면 Files API로 올립니다.
//   Files API는 구글 공식 JS SDK(@google/genai)의 브라우저 업로드와 같은 방식입니다:
//   resumable 시작 → x-goog-upload-url로 8MB씩 → 'upload, finalize' → ACTIVE가 될 때까지 기다림.
// - 20분이 넘는 녹음은 같은 파일을 20분씩 나눠 받아쓰고 이어 붙입니다. 한 번에 시키면 출력 한도에 걸려 잘립니다.
//   서버가 바쁘면(429·5xx) 잠시 뒤 다시 하고, 그래도 안 되는 구간은 표시만 남기고 나머지를 이어 받아씁니다.
// - ElevenLabs(3GB·10시간까지)·OpenAI(25MB까지)는 파일을 그대로 보냅니다. 크레딧·키 문제나 크기 한도에 걸리면
//   Gemini 키가 있을 때 Gemini로 넘깁니다.

import {
  blobToBase64,
  failureMessage,
  GEMINI_STT_MODEL,
  isBlocked,
  isTruncated,
  readFailure,
  textOf,
  thinkingLevelFor,
  type GeminiResponse,
} from "./gemini";
import { canSwitchStt, LANG_NAMES, SttError, transcribe, type SttProvider } from "./transcribe";

const API_ROOT = "https://generativelanguage.googleapis.com";
/** 요청에 바로 담을 수 있는 크기. 한 요청 20MB 한도에서 base64(×4/3)와 프롬프트 몫을 뺐습니다. */
export const INLINE_MAX_BYTES = 14 * 1024 * 1024;
/** Files API로 한 번에 보내는 조각 (공식 SDK와 같음) */
const CHUNK_BYTES = 8 * 1024 * 1024;
/** 한 번에 받아쓰는 길이. 20분 말은 대개 6~8천 자라 출력 한도에 넉넉합니다. */
export const SEGMENT_SECONDS = 20 * 60;
/**
 * OpenAI 받아쓰기 한도: 파일 25MB. gpt-4o-transcribe는 한 번에 2,000토큰까지만 돌려주므로
 * 10분이 넘는 녹음은 뒷부분이 잘립니다 (길이 한도 1,500초보다 먼저 걸림).
 */
const OPENAI_MAX_BYTES = 25 * 1024 * 1024;
const OPENAI_MAX_SECONDS = 600;
/** 서버가 바쁠 때 다시 해 보는 횟수와, 이보다 오래 기다리라고 하면 기다리지 않는 한도 */
const MAX_TRIES = 3;
const MAX_RETRY_WAIT_MS = 60_000;
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
/** 이 앱이 받는 가장 큰 파일 (Gemini Files API 한 파일 2GB) */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

export type FileStage = "upload" | "prepare" | "transcribe";
export interface FileProgress {
  stage: FileStage;
  /** upload: 보낸 바이트, transcribe: 끝낸 구간 수 */
  done: number;
  total: number;
}

export interface FileTranscribeOptions {
  provider: SttProvider;
  apiKey: string;
  /** ElevenLabs·OpenAI가 막히면 넘겨받을 Gemini 키 */
  geminiKey?: string;
  lang: string;
  hints?: string[];
  /** 녹음 길이(초). 모르면 비워 둡니다. */
  durationSec?: number | null;
  signal?: AbortSignal;
  onProgress?: (p: FileProgress) => void;
}

export interface FileTranscript {
  text: string;
  /** 다른 서비스로 넘겼으면 원래 서비스와 그 이유 */
  switchedFrom?: SttProvider;
  reason?: string;
  /** 크레딧·키·차단 문제라 앞으로도 Gemini를 쓰는 게 좋은지 (크기 한도 때문이면 false) */
  switchForGood?: boolean;
  /** 받아쓰지 못하고 [표시]만 남긴 구간 수 */
  missed?: number;
  /** 키·하루 한도 문제로 중간에서 멈췄으면 그 이유 */
  stopped?: string;
}

const EXT_MIME: Record<string, string> = {
  m4a: "audio/m4a",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/mov",
  mp3: "audio/mp3",
  mpeg: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
  aiff: "audio/aiff",
  aif: "audio/aiff",
};

const MIME_ALIAS: Record<string, string> = {
  "video/quicktime": "video/mov",
  "video/x-m4v": "video/mp4",
  "audio/x-flac": "audio/flac",
  "audio/x-aac": "audio/aac",
  "audio/aacp": "audio/aac",
  "audio/vnd.dlna.adts": "audio/aac", // Windows의 Chrome·Edge가 .aac에 붙이는 이름
  "audio/x-aiff": "audio/aiff",
};

/** Gemini 문서에 적힌 녹음·영상 형식 */
const GEMINI_MIME = new Set([
  "audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac", "audio/m4a", "audio/webm",
  "video/mp4", "video/mpeg", "video/mov", "video/avi", "video/x-flv", "video/mpg", "video/webm", "video/wmv", "video/3gpp",
]);

/** 파일 형식을 Gemini가 받는 MIME으로 맞춥니다. 브라우저가 형식을 비워 두는 경우(m4a 등)는 확장자로 봅니다. */
export function fileMime(name: string, type: string): string | null {
  const base = (type.split(";")[0] || "").trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") return "audio/m4a";
  if (base === "audio/mpeg" || base === "audio/mp3") return "audio/mp3";
  if (base === "audio/x-wav" || base === "audio/wave" || base === "audio/vnd.wave") return "audio/wav";
  // Gemini 문서에 적힌 이름으로 맞춥니다 (아이폰 영상은 video/quicktime으로 옵니다).
  const known = MIME_ALIAS[base] ?? base;
  if (GEMINI_MIME.has(known)) return known;
  // 브라우저·운영체제마다 다른 이름(audio/vnd.… 등)은 확장자로 다시 봅니다.
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EXT_MIME[ext] ?? (base.startsWith("audio/") || base.startsWith("video/") ? base : null);
}

/** 'mm:ss' (한 시간이 넘으면 분이 60을 넘습니다. Gemini 문서의 타임스탬프 형식) */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 녹음을 SEGMENT_SECONDS씩 나눕니다. 마지막 조각이 2분보다 짧으면 앞 조각에 붙입니다. */
export function planSegments(durationSec: number | null | undefined): [number, number][] {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= SEGMENT_SECONDS * 1.25) return [];
  const out: [number, number][] = [];
  for (let start = 0; start < durationSec; start += SEGMENT_SECONDS) out.push([start, Math.min(durationSec, start + SEGMENT_SECONDS)]);
  const last = out[out.length - 1];
  if (out.length > 1 && last[1] - last[0] < 120) {
    out.pop();
    out[out.length - 1][1] = durationSec;
  }
  return out;
}

/** range의 끝이 null이면 '그 시각부터 녹음이 끝날 때까지' (마지막 구간: 길이를 조금 잘못 읽어도 끝을 놓치지 않게) */
export function filePrompt(lang: string, hints: string[] = [], range?: [number, number | null]): string {
  const language = LANG_NAMES[lang.split("-")[0]] ?? lang;
  const terms = hints.slice(0, 100);
  return [
    !range
      ? `이 녹음을 처음부터 끝까지 ${language}로 들리는 그대로 받아쓰세요.`
      : range[1] === null
        ? `이 녹음의 ${clock(range[0])}부터 녹음이 끝날 때까지 ${language}로 들리는 그대로 받아쓰세요. 그 앞부분은 적지 마세요.`
        : `이 녹음의 ${clock(range[0])}부터 ${clock(range[1])}까지만 ${language}로 들리는 그대로 받아쓰세요. 그 앞뒤 부분은 적지 마세요.`,
    "말을 고치거나 요약하지 마세요. 빠뜨리는 부분 없이 모두 적으세요.",
    "말하는 사람이 바뀌면 새 줄에서 시작하세요. 시간 표시나 설명은 붙이지 마세요.",
    "받아쓴 글만 출력하세요. 말소리가 없으면 아무것도 출력하지 마세요.",
    terms.length ? `이런 용어가 나올 수 있습니다: ${terms.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 브라우저로 녹음 길이를 읽습니다. 못 읽으면 null. */
export function mediaDurationSec(file: Blob, timeoutMs = 8000): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    let settled = false;
    const done = (v: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
      resolve(v && Number.isFinite(v) && v > 0 ? v : null);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (el.duration !== Infinity) return done(el.duration);
      // 브라우저로 녹음한 webm은 길이가 비어 있습니다. 끝으로 건너뛰면 브라우저가 길이를 계산해 알려 줍니다.
      el.ondurationchange = () => {
        if (Number.isFinite(el.duration)) done(el.duration);
      };
      el.currentTime = 1e101;
    };
    el.onerror = () => done(null);
    el.src = url;
  });
}

/** 멈추기를 눌렀으면 다음 단계(조각 올리기·구간 받아쓰기)로 넘어가지 않습니다. */
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("받아쓰기를 멈췄습니다.", "AbortError");
}

/** 기다리는 중에도 멈추기를 누르면 바로 그만둡니다. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("받아쓰기를 멈췄습니다.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 바쁘다는 응답(429 등)이 알려 준 것: 기다릴 시간(RetryInfo의 "30s"나 Retry-After)과 하루 한도인지.
 * 하루 한도(무료 등급의 …PerDay…)는 30초쯤 기다리라고 하지만 기다려도 오늘은 풀리지 않습니다.
 */
async function retryInfo(res: Response): Promise<{ delayMs: number | null; daily: boolean }> {
  let delayMs: number | null = null;
  let daily = false;
  const header = Number(res.headers.get("retry-after"));
  if (header > 0) delayMs = header * 1000;
  try {
    const body = (await res.clone().json()) as { error?: { message?: string; details?: { retryDelay?: string }[] } };
    const sec = parseFloat(body.error?.details?.find((d) => d.retryDelay)?.retryDelay ?? "");
    if (delayMs === null && sec > 0) delayMs = sec * 1000;
    daily = /per ?day|daily/i.test(`${body.error?.message ?? ""} ${JSON.stringify(body.error?.details ?? [])}`);
  } catch {
    // 본문이 JSON이 아니면 헤더만 봅니다.
  }
  return { delayMs, daily };
}

function isAbort(e: unknown): boolean {
  return (e as DOMException)?.name === "AbortError";
}

function connectionError(e: unknown): never {
  if (isAbort(e)) throw e;
  throw new SttError("받아쓰기 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
}

async function geminiFail(res: Response, daily = false): Promise<never> {
  const f = await readFailure(res);
  if (/mime|unsupported|invalid argument.*(audio|file)/i.test(f.message) && f.status === 400)
    throw new SttError("이 파일 형식은 받아쓸 수 없습니다. m4a·mp3·wav·mp4 같은 녹음·영상 파일을 올려 주세요.");
  // 키·권한·하루 한도 문제는 다음 구간에서도 똑같이 막히므로 표시해 둡니다 (구간 받아쓰기를 거기서 멈춤).
  const kind =
    f.status === 401 || f.status === 403 || f.status === 404 || /API_KEY/.test(f.reason)
      ? "key"
      : f.status === 429 && daily
        ? "quota"
        : f.status === 429 || f.status >= 500
          ? "busy"
          : "other";
  throw new SttError(failureMessage(f, "받아쓰기"), kind);
}

/** 이 이유로 실패한 구간 뒤로는 받아써 봐야 똑같이 막힙니다. */
function stopsEverything(e: unknown): boolean {
  return e instanceof SttError && (e.kind === "key" || e.kind === "quota");
}

interface UploadedFile {
  name: string;
  uri: string;
  mimeType: string;
}

/** Files API에 올리고 ACTIVE가 될 때까지 기다립니다. */
export async function uploadToGemini(file: Blob, mimeType: string, displayName: string, opts: FileTranscribeOptions): Promise<UploadedFile> {
  const key = opts.apiKey.trim();
  checkAbort(opts.signal);
  let start: Response;
  try {
    start = await fetch(`${API_ROOT}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
        "x-goog-upload-protocol": "resumable",
        "x-goog-upload-command": "start",
        "x-goog-upload-header-content-length": String(file.size),
        "x-goog-upload-header-content-type": mimeType,
      },
      body: JSON.stringify({ file: { displayName: displayName.slice(0, 120), mimeType } }),
      signal: opts.signal,
    });
  } catch (e) {
    connectionError(e);
  }
  if (!start.ok) await geminiFail(start);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new SttError("Gemini에 파일을 올리지 못했습니다 (업로드 주소를 받지 못함). 잠시 뒤 다시 올려 주세요.");

  let offset = 0;
  let last: Response | null = null;
  let failures = 0;
  let finalized = false;
  opts.onProgress?.({ stage: "upload", done: 0, total: file.size });
  while (!finalized) {
    checkAbort(opts.signal);
    const end = Math.min(file.size, offset + CHUNK_BYTES);
    // 서버가 다 받았다고 했는데 마무리가 안 됐으면, 빈 'finalize'로 마무리만 합니다.
    const command = offset >= file.size ? "finalize" : end >= file.size ? "upload, finalize" : "upload";
    let res: Response | null = null;
    try {
      res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "x-goog-upload-command": command, "x-goog-upload-offset": String(offset) },
        body: command === "finalize" ? undefined : file.slice(offset, end),
        signal: opts.signal,
      });
    } catch (e) {
      if (isAbort(e)) throw e;
    }
    if (res?.ok) {
      last = res;
      offset = end;
      failures = 0;
      finalized = end >= file.size;
      opts.onProgress?.({ stage: "upload", done: offset, total: file.size });
      continue;
    }
    const why = res ? String(res.status) : "연결 끊김";
    if ((res && !RETRY_STATUS.has(res.status)) || ++failures > 2)
      throw new SttError(`Gemini에 파일을 올리다 멈췄습니다 (${why}). 다시 올려 주세요.`);
    await sleep(1000 * 2 ** failures, opts.signal);
    // 서버가 어디까지 받았는지 물어 그 자리부터 이어 올립니다 (조각이 반쯤 들어갔을 수 있습니다).
    const q = await queryUpload(uploadUrl, opts.signal);
    if (q?.headers.get("x-goog-upload-status") === "final") {
      last = q;
      offset = file.size;
      finalized = true;
    } else {
      const got = q?.headers.get("x-goog-upload-size-received");
      if (got && /^\d+$/.test(got) && Number(got) <= file.size) offset = Number(got);
    }
  }
  let info: { name?: string; uri?: string; mimeType?: string; state?: string } | undefined;
  try {
    info = ((await last?.json()) as { file?: typeof info } | undefined)?.file;
  } catch {
    info = undefined;
  }
  if (!info?.name || !info.uri) throw new SttError("Gemini에 파일을 올렸지만 결과를 읽지 못했습니다. 다시 올려 주세요.");

  // 올린 파일은 잠깐 'PROCESSING'이었다가 'ACTIVE'가 됩니다. 기다리다 멈추거나 실패하면 올린 녹음을 바로 지웁니다.
  opts.onProgress?.({ stage: "prepare", done: 0, total: 1 });
  try {
    let misses = 0; // 잇달아 실패한 확인 (잠깐 끊기거나 바쁜 것은 몇 번 넘깁니다)
    for (let i = 0; info.state && info.state !== "ACTIVE"; i++) {
      if (info.state === "FAILED") throw new SttError("Gemini가 이 파일을 읽지 못했습니다. 다른 형식(mp3·m4a·wav)으로 올려 주세요.");
      if (i > 120) throw new SttError("Gemini가 파일을 준비하는 데 너무 오래 걸립니다. 잠시 뒤 다시 올려 주세요.");
      await sleep(2000 * (misses + 1), opts.signal);
      let res: Response | null = null;
      try {
        res = await fetch(`${API_ROOT}/v1beta/${info.name}`, { headers: { "x-goog-api-key": key }, signal: opts.signal });
      } catch (e) {
        if (isAbort(e) || misses >= 3) connectionError(e);
      }
      if (res?.ok) {
        misses = 0;
        info = { ...info, ...((await res.json()) as typeof info) };
        continue;
      }
      if (res && (!RETRY_STATUS.has(res.status) || misses >= 3)) await geminiFail(res);
      misses += 1;
    }
  } catch (e) {
    void deleteGeminiFile(info.name!, key);
    throw e;
  }
  return { name: info.name!, uri: info.uri!, mimeType: info.mimeType || mimeType };
}

/** 이어 올리기 전에 서버가 받은 크기를 묻습니다. 못 물으면 null. */
async function queryUpload(uploadUrl: string, signal?: AbortSignal): Promise<Response | null> {
  try {
    const res = await fetch(uploadUrl, { method: "POST", headers: { "x-goog-upload-command": "query" }, signal });
    return res.ok ? res : null;
  } catch (e) {
    if (isAbort(e)) throw e;
    return null;
  }
}

/** 다 쓴 파일을 지웁니다 (48시간 뒤 저절로 지워지지만, 녹음이므로 바로 지웁니다). 실패해도 괜찮습니다. */
export async function deleteGeminiFile(name: string, apiKey: string): Promise<void> {
  try {
    await fetch(`${API_ROOT}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey.trim() } });
  } catch {
    // 지우지 못해도 48시간 뒤 사라집니다.
  }
}

interface Piece {
  text: string;
  /** 출력 한도에 걸려 뒷부분이 잘렸는지 */
  truncated: boolean;
}

/** 한 번 받아씁니다. 서버가 바쁘면(429·5xx·연결 끊김) 잠시 뒤 두 번까지 더 해 봅니다. */
async function generate(part: object, prompt: string, opts: FileTranscribeOptions, config: object = {}): Promise<Piece> {
  for (let attempt = 1; ; attempt++) {
    checkAbort(opts.signal);
    let res: Response | null = null;
    try {
      res = await fetch(`${API_ROOT}/v1beta/models/${GEMINI_STT_MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey.trim() },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, part] }],
          generationConfig: {
            maxOutputTokens: 32768,
            thinkingConfig: { thinkingLevel: thinkingLevelFor(GEMINI_STT_MODEL, "low") },
            ...config,
          },
        }),
        signal: opts.signal,
      });
    } catch (e) {
      if (isAbort(e) || attempt >= MAX_TRIES) connectionError(e);
    }
    if (res?.ok) {
      const data = (await res.json()) as GeminiResponse;
      if (isBlocked(data)) throw new SttError("Gemini가 이 녹음을 받아쓰지 않았습니다.");
      return { text: textOf(data).trim(), truncated: isTruncated(data) };
    }
    const info = res ? await retryInfo(res) : { delayMs: null, daily: false };
    if (res && (!RETRY_STATUS.has(res.status) || attempt >= MAX_TRIES)) await geminiFail(res, info.daily);
    // 하루 한도이거나 오래 기다리라는 답이면 기다리지 않고 바로 알립니다.
    if (res && (info.daily || (info.delayMs !== null && info.delayMs > MAX_RETRY_WAIT_MS))) await geminiFail(res, info.daily);
    await sleep(info.delayMs ?? 2000 * 2 ** (attempt - 1), opts.signal);
  }
}

export interface GeminiFileText {
  text: string;
  /** 받아쓰지 못하고 [표시]만 남긴 구간 수 */
  missed: number;
  /** 키·하루 한도 문제로 중간에서 멈췄으면 그 이유 */
  stopped?: string;
}

/** 잘린 받아쓰기는 버리지 않고 받은 데까지 쓰되, 어디가 빠졌는지 글 안에 표시합니다. */
function withCut(p: Piece, where: string): string {
  return p.truncated ? `${p.text}\n[${where} 뒷부분은 너무 길어 받아쓰지 못했습니다]`.trim() : p.text;
}

/** Gemini로 파일을 받아씁니다. */
export async function transcribeFileWithGemini(file: File, opts: FileTranscribeOptions): Promise<GeminiFileText> {
  const mime = fileMime(file.name, file.type);
  if (!mime) throw new SttError("이 파일 형식은 받아쓸 수 없습니다. m4a·mp3·wav·mp4 같은 녹음·영상 파일을 올려 주세요.");
  if (file.size > MAX_FILE_BYTES) throw new SttError("파일이 2GB보다 큽니다. 나눠서 올려 주세요.");
  const segments = planSegments(opts.durationSec);
  // 영상은 말소리만 받아쓰면 되므로 화면을 낮은 해상도로 봅니다 (긴 강의 영상도 입력 한도에 걸리지 않게).
  const video = mime.startsWith("video/");
  const config = video ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {};

  if (file.size <= INLINE_MAX_BYTES && segments.length === 0) {
    opts.onProgress?.({ stage: "transcribe", done: 0, total: 1 });
    const p = await generate({ inlineData: { mimeType: mime, data: await blobToBase64(file) } }, filePrompt(opts.lang, opts.hints), opts, config);
    opts.onProgress?.({ stage: "transcribe", done: 1, total: 1 });
    return { text: withCut(p, "녹음"), missed: p.truncated ? 1 : 0 };
  }

  const uploaded = await uploadToGemini(file, mime, file.name, opts);
  try {
    const part = { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } };
    if (segments.length === 0) {
      opts.onProgress?.({ stage: "transcribe", done: 0, total: 1 });
      const p = await generate(part, filePrompt(opts.lang, opts.hints), opts, config);
      opts.onProgress?.({ stage: "transcribe", done: 1, total: 1 });
      return { text: withCut(p, "녹음"), missed: p.truncated ? 1 : 0 };
    }
    const pieces: string[] = [];
    let missed = 0;
    let stopped: string | undefined;
    for (let i = 0; i < segments.length; i++) {
      opts.onProgress?.({ stage: "transcribe", done: i, total: segments.length });
      const [from, to] = segments[i];
      const last = i === segments.length - 1;
      const where = last ? `${clock(from)} 이후` : `${clock(from)}~${clock(to)}`;
      try {
        // 영상은 그 구간만 잘라 보내고(videoMetadata), 녹음은 같은 파일에서 시간으로 구간을 짚습니다.
        const p = video
          ? await generate(
              { ...part, videoMetadata: { startOffset: `${from}s`, ...(last ? {} : { endOffset: `${to}s` }) } },
              filePrompt(opts.lang, opts.hints),
              opts,
              config,
            )
          : await generate(part, filePrompt(opts.lang, opts.hints, [from, last ? null : to]), opts, config);
        pieces.push(withCut(p, `${where} 구간`));
        if (p.truncated) missed += 1;
      } catch (e) {
        // 첫 구간부터 안 되면 그대로 알리고, 중간에 한 구간만 안 되면 표시를 남기고 이어 갑니다.
        // 키·하루 한도 문제는 뒤 구간도 똑같이 막히므로 거기서 멈추고, 받은 데까지만 돌려줍니다.
        if (isAbort(e) || i === 0) throw e;
        if (stopsEverything(e)) {
          pieces.push(`[${clock(from)} 이후는 받아쓰지 못했습니다]`);
          missed += segments.length - i;
          stopped = (e as SttError).message;
          break;
        }
        pieces.push(`[${where} 구간은 받아쓰지 못했습니다]`);
        missed += 1;
      }
    }
    opts.onProgress?.({ stage: "transcribe", done: segments.length, total: segments.length });
    return { text: pieces.filter(Boolean).join("\n\n"), missed, stopped };
  } finally {
    void deleteGeminiFile(uploaded.name, opts.apiKey);
  }
}

/**
 * 녹음 파일을 글로 바꿉니다. 고른 받아쓰기 서비스로 하고, 크레딧·키·차단 문제나 크기 한도에 걸리면
 * Gemini 키가 있을 때 Gemini로 넘깁니다(넘긴 사실과 이유를 함께 돌려줍니다).
 */
export async function transcribeAudioFile(file: File, opts: FileTranscribeOptions): Promise<FileTranscript> {
  const geminiKey = opts.geminiKey?.trim();
  const viaGemini = async (from?: SttProvider, reason?: string, switchForGood = false): Promise<FileTranscript> => {
    const out = await transcribeFileWithGemini(file, { ...opts, provider: "gemini", apiKey: from ? geminiKey! : opts.apiKey });
    return { text: out.text, missed: out.missed, stopped: out.stopped, switchedFrom: from, reason, switchForGood };
  };
  if (opts.provider === "gemini") return viaGemini();

  if (opts.provider === "openai" && (file.size > OPENAI_MAX_BYTES || (opts.durationSec ?? 0) > OPENAI_MAX_SECONDS)) {
    const reason =
      file.size > OPENAI_MAX_BYTES ? "OpenAI 받아쓰기는 25MB까지만 받습니다" : "OpenAI 받아쓰기는 10분이 넘는 녹음을 끝까지 받아쓰지 못합니다";
    if (geminiKey) return viaGemini("openai", reason);
    throw new SttError(`${reason}. 설정에서 받아쓰기 서비스를 Gemini로 바꾸면 2GB까지 긴 녹음도 올릴 수 있습니다.`);
  }
  try {
    opts.onProgress?.({ stage: "transcribe", done: 0, total: 1 });
    const text = await transcribe(file, file.name || "recording", {
      provider: opts.provider,
      apiKey: opts.apiKey,
      lang: opts.lang,
      hints: opts.hints,
      signal: opts.signal,
    });
    opts.onProgress?.({ stage: "transcribe", done: 1, total: 1 });
    return { text };
  } catch (e) {
    if (geminiKey && canSwitchStt(e) && !opts.signal?.aborted) return viaGemini(opts.provider, (e as SttError).message.split(".")[0], true);
    throw e;
  }
}
