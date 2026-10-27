// 녹음 파일 받아쓰기: 휴대폰 녹음(m4a)·강의 녹음(mp3)·영상(mp4)을 올리면 글로 바꿉니다.
//
// - Gemini: 14MB 이하는 요청에 바로 담고(한 요청 20MB 한도, base64로 33% 늘어남), 더 크면 Files API로 올립니다.
//   Files API는 구글 공식 JS SDK(@google/genai)의 브라우저 업로드와 같은 방식입니다:
//   resumable 시작 → x-goog-upload-url로 8MB씩 → 'upload, finalize' → ACTIVE가 될 때까지 기다림.
// - 20분이 넘는 녹음은 같은 파일을 20분씩 나눠 받아쓰고 이어 붙입니다. 한 번에 시키면 출력 한도에 걸려 잘립니다.
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
/** OpenAI 받아쓰기 파일 한도 */
const OPENAI_MAX_BYTES = 25 * 1024 * 1024;
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
}

const EXT_MIME: Record<string, string> = {
  m4a: "audio/m4a",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
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

/** 파일 형식을 Gemini가 받는 MIME으로 맞춥니다. 브라우저가 형식을 비워 두는 경우(m4a 등)는 확장자로 봅니다. */
export function fileMime(name: string, type: string): string | null {
  const base = (type.split(";")[0] || "").trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") return "audio/m4a";
  if (base === "audio/mpeg" || base === "audio/mp3") return "audio/mp3";
  if (base === "audio/x-wav" || base === "audio/wave") return "audio/wav";
  if (base.startsWith("audio/") || base.startsWith("video/")) return base;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EXT_MIME[ext] ?? null;
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

export function filePrompt(lang: string, hints: string[] = [], range?: [number, number]): string {
  const language = LANG_NAMES[lang.split("-")[0]] ?? lang;
  const terms = hints.slice(0, 100);
  return [
    range
      ? `이 녹음의 ${clock(range[0])}부터 ${clock(range[1])}까지만 ${language}로 들리는 그대로 받아쓰세요. 그 앞뒤 부분은 적지 마세요.`
      : `이 녹음을 처음부터 끝까지 ${language}로 들리는 그대로 받아쓰세요.`,
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
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(null);
    el.src = url;
  });
}

/** 멈추기를 눌렀으면 다음 단계(조각 올리기·구간 받아쓰기)로 넘어가지 않습니다. */
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("받아쓰기를 멈췄습니다.", "AbortError");
}

function connectionError(e: unknown): never {
  if ((e as DOMException)?.name === "AbortError") throw e;
  throw new SttError("받아쓰기 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
}

async function geminiFail(res: Response): Promise<never> {
  const f = await readFailure(res);
  if (/mime|unsupported|invalid argument.*(audio|file)/i.test(f.message) && f.status === 400)
    throw new SttError("이 파일 형식은 받아쓸 수 없습니다. m4a·mp3·wav·mp4 같은 녹음·영상 파일을 올려 주세요.");
  throw new SttError(failureMessage(f, "받아쓰기"));
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
  opts.onProgress?.({ stage: "upload", done: 0, total: file.size });
  while (offset < file.size) {
    const end = Math.min(file.size, offset + CHUNK_BYTES);
    const final = end >= file.size;
    let attempt = 0;
    checkAbort(opts.signal);
    for (;;) {
      try {
        last = await fetch(uploadUrl, {
          method: "POST",
          headers: { "x-goog-upload-command": final ? "upload, finalize" : "upload", "x-goog-upload-offset": String(offset) },
          body: file.slice(offset, end),
          signal: opts.signal,
        });
        if (last.ok || last.status < 500 || attempt >= 2) break;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError" || attempt >= 2) connectionError(e);
      }
      attempt += 1;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    if (!last || !last.ok) throw new SttError(`Gemini에 파일을 올리다 멈췄습니다 (${last?.status ?? "연결 끊김"}). 다시 올려 주세요.`);
    offset = end;
    opts.onProgress?.({ stage: "upload", done: offset, total: file.size });
  }
  const body = (await last!.json()) as { file?: { name?: string; uri?: string; mimeType?: string; state?: string } };
  let info = body.file;
  if (!info?.name || !info.uri) throw new SttError("Gemini에 파일을 올렸지만 결과를 읽지 못했습니다. 다시 올려 주세요.");

  // 올린 파일은 잠깐 'PROCESSING'이었다가 'ACTIVE'가 됩니다.
  opts.onProgress?.({ stage: "prepare", done: 0, total: 1 });
  for (let i = 0; info.state && info.state !== "ACTIVE"; i++) {
    if (info.state === "FAILED") throw new SttError("Gemini가 이 파일을 읽지 못했습니다. 다른 형식(mp3·m4a·wav)으로 올려 주세요.");
    if (i > 120) throw new SttError("Gemini가 파일을 준비하는 데 너무 오래 걸립니다. 잠시 뒤 다시 올려 주세요.");
    await new Promise((r) => setTimeout(r, 2000));
    checkAbort(opts.signal);
    let res: Response;
    try {
      res = await fetch(`${API_ROOT}/v1beta/${info.name}`, { headers: { "x-goog-api-key": key }, signal: opts.signal });
    } catch (e) {
      connectionError(e);
    }
    if (!res.ok) await geminiFail(res);
    info = { ...info, ...((await res.json()) as typeof info) };
  }
  return { name: info.name!, uri: info.uri!, mimeType: info.mimeType || mimeType };
}

/** 다 쓴 파일을 지웁니다 (48시간 뒤 저절로 지워지지만, 녹음이므로 바로 지웁니다). 실패해도 괜찮습니다. */
export async function deleteGeminiFile(name: string, apiKey: string): Promise<void> {
  try {
    await fetch(`${API_ROOT}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey.trim() } });
  } catch {
    // 지우지 못해도 48시간 뒤 사라집니다.
  }
}

async function generate(part: object, prompt: string, opts: FileTranscribeOptions): Promise<string> {
  checkAbort(opts.signal);
  let res: Response;
  try {
    res = await fetch(`${API_ROOT}/v1beta/models/${GEMINI_STT_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey.trim() },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, part] }],
        generationConfig: { maxOutputTokens: 32768, thinkingConfig: { thinkingLevel: thinkingLevelFor(GEMINI_STT_MODEL, "low") } },
      }),
      signal: opts.signal,
    });
  } catch (e) {
    connectionError(e);
  }
  if (!res.ok) await geminiFail(res);
  const data = (await res.json()) as GeminiResponse;
  if (isBlocked(data)) throw new SttError("Gemini가 이 녹음을 받아쓰지 않았습니다.");
  const text = textOf(data).trim();
  if (isTruncated(data))
    throw new SttError("녹음이 너무 길어 끝까지 받아쓰지 못했습니다. 녹음을 나눠서 올려 주세요.");
  return text;
}

/** Gemini로 파일을 받아씁니다. */
export async function transcribeFileWithGemini(file: File, opts: FileTranscribeOptions): Promise<string> {
  const mime = fileMime(file.name, file.type);
  if (!mime) throw new SttError("이 파일 형식은 받아쓸 수 없습니다. m4a·mp3·wav·mp4 같은 녹음·영상 파일을 올려 주세요.");
  if (file.size > MAX_FILE_BYTES) throw new SttError("파일이 2GB보다 큽니다. 나눠서 올려 주세요.");
  const segments = planSegments(opts.durationSec);

  if (file.size <= INLINE_MAX_BYTES && segments.length === 0) {
    opts.onProgress?.({ stage: "transcribe", done: 0, total: 1 });
    const text = await generate({ inlineData: { mimeType: mime, data: await blobToBase64(file) } }, filePrompt(opts.lang, opts.hints), opts);
    opts.onProgress?.({ stage: "transcribe", done: 1, total: 1 });
    return text;
  }

  const uploaded = await uploadToGemini(file, mime, file.name, opts);
  try {
    const part = { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } };
    if (segments.length === 0) {
      opts.onProgress?.({ stage: "transcribe", done: 0, total: 1 });
      const text = await generate(part, filePrompt(opts.lang, opts.hints), opts);
      opts.onProgress?.({ stage: "transcribe", done: 1, total: 1 });
      return text;
    }
    const pieces: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      opts.onProgress?.({ stage: "transcribe", done: i, total: segments.length });
      pieces.push(await generate(part, filePrompt(opts.lang, opts.hints, segments[i]), opts));
    }
    opts.onProgress?.({ stage: "transcribe", done: segments.length, total: segments.length });
    return pieces.filter(Boolean).join("\n\n");
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
  const viaGemini = async (from?: SttProvider, reason?: string, switchForGood = false): Promise<FileTranscript> => ({
    text: await transcribeFileWithGemini(file, { ...opts, provider: "gemini", apiKey: from ? geminiKey! : opts.apiKey }),
    switchedFrom: from,
    reason,
    switchForGood,
  });
  if (opts.provider === "gemini") return viaGemini();

  if (opts.provider === "openai" && file.size > OPENAI_MAX_BYTES) {
    const reason = "OpenAI 받아쓰기는 25MB까지만 받습니다";
    if (geminiKey) return viaGemini("openai", reason);
    throw new SttError(`${reason}. 설정에서 받아쓰기 서비스를 Gemini로 바꾸면 2GB까지 올릴 수 있습니다.`);
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
