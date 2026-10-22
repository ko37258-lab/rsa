import type { AiRequest } from "../lib/prompts";
import { toSingleInput } from "../lib/prompts";
import type { EngineId, Settings } from "../lib/settings";

export interface RunOptions {
  /** 지금까지 쓴 전체 글 (스트리밍) */
  onText?: (text: string) => void;
  signal?: AbortSignal;
  /** true면 저장된 답을 쓰지 않고 새로 정리합니다 ("다시 정리") */
  fresh?: boolean;
}

export class EngineError extends Error {
  constructor(
    public code: "cancelled" | "unavailable" | "refused" | "failed",
    message: string,
    public partial?: string,
  ) {
    super(message);
  }
}

let samplePromise: Promise<ClaudeSampleFn | null> | null = null;

/** claude.ai 안에서 열렸을 때만 내 Claude 계정으로 정리할 수 있습니다. */
export function getSample(): Promise<ClaudeSampleFn | null> {
  if (!samplePromise) {
    const use = typeof window !== "undefined" ? window.claude?.use : undefined;
    samplePromise = use ? use.call(window.claude, "sample").catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

const SAMPLE_MESSAGES: Record<string, string> = {
  not_granted: "Claude 사용을 허용하지 않아 정리할 수 없습니다. 아티팩트의 권한 메뉴에서 허용할 수 있어요.",
  sampling_disabled: "이 계정에서는 Claude를 쓸 수 없습니다.",
  rate_limited: "요청이 많거나 사용 한도에 닿았습니다. 잠시 뒤 다시 정리해 주세요.",
  session_expired: "로그인이 만료되었습니다. claude.ai에 다시 로그인해 주세요.",
  refused: "Claude가 이 내용을 정리하지 않았습니다. 내용을 바꿔 다시 시도해 주세요.",
  empty_completion: "정리된 글이 비어 있습니다. 원문을 조금 더 길게 말해 주세요.",
  prompt_too_large: "원문이 너무 깁니다. 나눠서 정리해 주세요.",
};

async function runWithAccount(req: AiRequest, settings: Settings, opts: RunOptions): Promise<string> {
  const sample = await getSample();
  if (!sample) throw new EngineError("unavailable", "Claude 계정 연결을 쓸 수 없습니다. 설정에서 다른 방식을 골라 주세요.");
  try {
    const { text, truncated } = await sample(toSingleInput(req), {
      modelTier: settings.accountTier,
      signal: opts.signal,
      onText: ({ text }) => opts.onText?.(text),
      ...(opts.fresh ? { cache: false } : {}),
    });
    // 끝까지 쓰지 못한 글은 완성본으로 저장·복사하지 않고 알립니다.
    if (truncated) throw new EngineError("failed", "글이 너무 길어 끝까지 정리하지 못했습니다. 나눠서 정리해 주세요.", text.trim());
    return text.trim();
  } catch (e) {
    if (e instanceof EngineError) throw e;
    const err = e as ClaudeSampleError;
    if (err?.code === "cancelled") throw new EngineError("cancelled", "정리를 멈췄습니다.", err.text);
    const message = SAMPLE_MESSAGES[err?.code] ?? "Claude 연결이 잠시 끊겼습니다. 다시 정리해 주세요.";
    throw new EngineError(err?.code === "refused" ? "refused" : "failed", message, err?.code === "refused" ? undefined : err?.text);
  }
}

export async function runAi(engine: EngineId, req: AiRequest, settings: Settings, opts: RunOptions = {}): Promise<string> {
  if (engine === "account") return runWithAccount(req, settings, opts);
  if (engine === "apikey") {
    // 아티팩트 빌드에서는 이 분기와 Claude SDK가 통째로 빠집니다.
    if (__ARTIFACT__) throw new EngineError("unavailable", "claude.ai 안에서는 API 키 대신 내 Claude 계정을 씁니다.");
    const { runWithApiKey } = await import("./apiKeyEngine");
    return runWithApiKey(req, settings, opts);
  }
  if (engine === "gemini") {
    if (__ARTIFACT__) throw new EngineError("unavailable", "claude.ai 안에서는 Gemini를 쓸 수 없습니다.");
    const { runWithGemini } = await import("./geminiEngine");
    return runWithGemini(req, settings, opts);
  }
  throw new EngineError("unavailable", "AI 정리가 꺼져 있습니다.");
}
