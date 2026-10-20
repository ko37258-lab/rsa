// 녹음 받아쓰기: 녹음한 음성 파일을 받아쓰기 API로 보내 글자로 바꿉니다.
// 브라우저 음성인식(구글 서버)을 쓸 수 없는 브라우저·네트워크에서도 동작합니다.

export type SttProvider = "elevenlabs" | "openai";

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
];

export class SttError extends Error {}

interface TranscribeOptions {
  provider: SttProvider;
  apiKey: string;
  /** 예: "ko-KR" */
  lang: string;
  signal?: AbortSignal;
}

export async function transcribe(audio: Blob, filename: string, opts: TranscribeOptions): Promise<string> {
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
