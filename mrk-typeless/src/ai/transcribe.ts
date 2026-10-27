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

/**
 * 받아쓰기 실패의 종류. key·credit·blocked·permission은 이 서비스로는 다시 해도 안 되는 경우라
 * Gemini 키가 있으면 Gemini로 바로 넘겨 받아씁니다(useRecorder).
 */
export type SttFailureKind = "key" | "credit" | "blocked" | "permission" | "busy" | "other";

export class SttError extends Error {
  constructor(
    message: string,
    readonly kind: SttFailureKind = "other",
  ) {
    super(message);
  }
}

/** 다른 받아쓰기 서비스(Gemini)로 넘기면 될 실패인지 */
export function canSwitchStt(e: unknown): boolean {
  return e instanceof SttError && (e.kind === "key" || e.kind === "credit" || e.kind === "blocked" || e.kind === "permission");
}

const SWITCH_TIP = " 설정 → 음성 인식에서 받아쓰기 서비스를 Gemini로 바꾸면 Gemini 키 하나로 받아씁니다.";

/**
 * ElevenLabs·OpenAI가 보낸 오류 본문을 읽어 진짜 이유를 알려 줍니다.
 *   ElevenLabs는 키가 틀릴 때뿐 아니라 크레딧이 떨어지거나(quota_exceeded) 무료 계정을 막을 때도
 *   (detected_unusual_activity) 401을 보냅니다. 예전에는 401이면 무조건 '키가 맞지 않습니다'라고 해서
 *   크레딧이 떨어진 사용자가 키만 다시 넣다 헤맸습니다(2026-10-22).
 *   본문 모양: ElevenLabs {detail:{status,message}}, OpenAI {error:{code,type,message}}
 */
export function sttFailure(provider: "elevenlabs" | "openai", status: number, body: unknown): SttError {
  const name = provider === "elevenlabs" ? "ElevenLabs" : "OpenAI";
  const b = (body ?? {}) as { detail?: unknown; error?: { code?: unknown; type?: unknown; message?: unknown } };
  const detail = (typeof b.detail === "object" && b.detail && !Array.isArray(b.detail) ? b.detail : {}) as {
    status?: unknown;
    message?: unknown;
  };
  const code = String(provider === "elevenlabs" ? (detail.status ?? "") : (b.error?.code ?? b.error?.type ?? "")).toLowerCase();
  const raw = provider === "elevenlabs" ? (detail.message ?? (typeof b.detail === "string" ? b.detail : "")) : (b.error?.message ?? "");
  const serverSaid = typeof raw === "string" && raw.trim() ? ` (${name}: ${raw.trim().slice(0, 160)})` : "";

  if (/quota|insufficient_quota|credit|payment|billing/.test(code) || status === 402)
    return new SttError(
      `${name} 크레딧(잔액)이 다 떨어졌습니다. ${provider === "elevenlabs" ? "elevenlabs.io" : "platform.openai.com"}에서 충전하거나,${SWITCH_TIP}`,
      "credit",
    );
  if (code === "detected_unusual_activity")
    return new SttError(`${name}가 이 무료 계정의 사용을 막았습니다(이상 사용 감지). VPN을 쓰고 있다면 끄거나 유료 요금제가 필요합니다.${SWITCH_TIP}`, "blocked");
  if (code === "missing_permissions" || code === "insufficient_permissions")
    return new SttError(`이 ${name} 키에는 받아쓰기(Speech to Text) 권한이 없습니다. ${name}의 API 키 설정에서 권한을 켜 주세요.${SWITCH_TIP}`, "permission");
  if (code === "unsupported_country_region_territory")
    return new SttError(`${name}가 지금 접속한 지역에서는 쓸 수 없다고 합니다. VPN을 쓰고 있다면 꺼 주세요.${SWITCH_TIP}`, "blocked");
  if (/invalid_api_key|needs_authorization|invalid_authorization|unauthorized/.test(code) || status === 401)
    return new SttError(`${name} API 키가 맞지 않습니다. 설정 → 음성 인식에서 키를 다시 붙여넣어 주세요.${SWITCH_TIP}`, "key");
  if (status === 403) return new SttError(`${name}가 이 키의 받아쓰기 요청을 거절했습니다${serverSaid}.${SWITCH_TIP}`, "permission");
  if (status === 429 || /rate_limit|too_many|system_busy/.test(code))
    return new SttError(`${name}에 요청이 몰려 잠시 막혔습니다. 조금 뒤 다시 말해 주세요.`, "busy");
  if (status === 413) return new SttError("녹음이 너무 깁니다. 나눠서 말해 주세요.");
  if (status >= 500) return new SttError(`${name} 받아쓰기 서버가 잠시 멈췄습니다. 조금 뒤 다시 말해 주세요.`, "busy");
  return new SttError(`받아쓰기 중 오류가 났습니다 (${status})${serverSaid}. 다시 말해 주세요.`);
}

export interface TranscribeOptions {
  provider: SttProvider;
  apiKey: string;
  /** 예: "ko-KR" */
  lang: string;
  /** 잘 알아듣도록 미리 알려 줄 용어 (Gemini만 씀) */
  hints?: string[];
  signal?: AbortSignal;
}

export const LANG_NAMES: Record<string, string> = { ko: "한국어", en: "영어", ja: "일본어", zh: "중국어" };

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
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // 본문이 JSON이 아니면 상태 코드만으로 판단합니다.
    }
    throw sttFailure(opts.provider, res.status, body);
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
