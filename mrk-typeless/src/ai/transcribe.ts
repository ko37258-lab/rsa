// 녹음 받아쓰기: 녹음한 음성 파일을 받아쓰기 API로 보내 글자로 바꿉니다.
// 브라우저 음성인식(구글 서버)을 쓸 수 없는 브라우저·네트워크에서도 동작합니다.

import {
  blobToBase64,
  failureMessage,
  GEMINI_BASE,
  GEMINI_STT_MODEL,
  isBlocked,
  isTruncated,
  readFailure,
  textOf,
  thinkingLevelFor,
  type GeminiResponse,
} from "./gemini";

export type SttProvider = "elevenlabs" | "openai" | "gemini";

export const STT_PROVIDERS: { id: SttProvider; label: string; keyHint: string; keyUrl: string; keyPlaceholder: string }[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs Scribe",
    keyHint: "ElevenLabs에 로그인해 API 키를 만듭니다. 권한을 고를 수 있으면 Speech to Text만 켜 두세요.",
    keyUrl: "https://elevenlabs.io/app/developers/api-keys",
    keyPlaceholder: "sk_…",
  },
  {
    id: "openai",
    label: "OpenAI (gpt-4o-transcribe)",
    keyHint: "OpenAI 플랫폼에 로그인해 API 키를 만듭니다. 결제 수단이 등록되어 있어야 합니다.",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
  },
  {
    id: "gemini",
    label: "Gemini",
    keyHint: "Google AI Studio에 로그인해 API 키를 만듭니다. 정리용 Gemini 키와 같은 키를 씁니다.",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
  },
];

export class SttError extends Error {}

interface TranscribeOptions {
  provider: SttProvider;
  apiKey: string;
  /** 예: "ko-KR" */
  lang: string;
  /** 잘 알아듣도록 미리 알려 줄 용어 (Gemini만 씀) */
  hints?: string[];
  signal?: AbortSignal;
}

const LANG_NAMES: Record<string, string> = { ko: "한국어", en: "영어", ja: "일본어", zh: "중국어" };

/** 녹음 형식을 Gemini가 받는 MIME로 맞춥니다. "audio/webm;codecs=opus"의 꼬리를 떼고, Safari의 audio/mp4는 m4a로 보냅니다. */
export function geminiMime(type: string): string {
  const base = (type.split(";")[0] || "").trim().toLowerCase();
  if (!base) return "audio/webm";
  if (base === "audio/mp4" || base === "audio/x-m4a") return "audio/m4a";
  return base;
}

export async function transcribe(audio: Blob, filename: string, opts: TranscribeOptions): Promise<string> {
  if (opts.provider === "gemini") return transcribeWithGemini(audio, opts);
  const language = opts.lang.split("-")[0];
  const form = new FormData();
  form.append("file", audio, filename);

  let url: string;
  let headers: Record<string, string>;
  if (opts.provider === "elevenlabs") {
    url = "https://api.elevenlabs.io/v1/speech-to-text";
    headers = { "xi-api-key": opts.apiKey.trim() };
    form.append("model_id", "scribe_v2");
    form.append("language_code", language);
    form.append("tag_audio_events", "false");
  } else {
    url = "https://api.openai.com/v1/audio/transcriptions";
    headers = { Authorization: `Bearer ${opts.apiKey.trim()}` };
    form.append("model", "gpt-4o-transcribe");
    form.append("language", language);
    form.append("response_format", "json");
  }

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: form, signal: opts.signal });
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") throw e;
    throw new SttError("받아쓰기 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new SttError("받아쓰기 API 키가 맞지 않습니다. 설정 → 음성 인식에서 키를 확인해 주세요.");
    if (res.status === 402 || res.status === 429)
      throw new SttError("받아쓰기 사용량 한도에 닿았습니다. 잠시 뒤 다시 하거나 요금제를 확인해 주세요.");
    if (res.status === 413) throw new SttError("녹음이 너무 깁니다. 나눠서 말해 주세요.");
    throw new SttError(`받아쓰기 중 오류가 났습니다 (${res.status}). 다시 말해 주세요.`);
  }

  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}

// Gemini는 받아쓰기 전용 주소가 없어, 녹음을 그대로 넣고 들리는 대로 적으라고 부탁합니다.
async function transcribeWithGemini(audio: Blob, opts: TranscribeOptions): Promise<string> {
  const language = LANG_NAMES[opts.lang.split("-")[0]] ?? opts.lang;
  const terms = (opts.hints ?? []).slice(0, 100);
  const prompt = [
    `이 녹음을 ${language}로 들리는 그대로 받아쓰세요.`,
    "말을 고치거나 요약하지 말고, '음', '어' 같은 말과 고쳐 말한 부분도 그대로 적으세요.",
    "받아쓴 글만 출력하세요. 말소리가 없으면 아무것도 출력하지 마세요.",
    terms.length ? `이런 용어가 나올 수 있습니다: ${terms.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/${GEMINI_STT_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey.trim() },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: geminiMime(audio.type), data: await blobToBase64(audio) } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: thinkingLevelFor(GEMINI_STT_MODEL, "low") } },
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") throw e;
    throw new SttError("받아쓰기 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }
  if (!res.ok) throw new SttError(failureMessage(await readFailure(res), "받아쓰기"));
  const data = (await res.json()) as GeminiResponse;
  if (isBlocked(data)) throw new SttError("Gemini가 이 녹음을 받아쓰지 않았습니다. 다시 말해 주세요.");
  if (isTruncated(data)) throw new SttError("녹음이 너무 길어 끝까지 받아쓰지 못했습니다. 나눠서 말해 주세요.");
  return textOf(data).trim();
}
