import Anthropic, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { AiRequest } from "../lib/prompts";
import type { Settings } from "../lib/settings";
import { EngineError, outputBudget, type RunOptions } from "./engine";

// 브라우저에서 사용자 본인의 API 키로 Claude를 직접 부릅니다.
// 키는 이 브라우저의 저장소에만 있고, Anthropic 서버 외에는 어디에도 보내지 않습니다.
export async function runWithApiKey(req: AiRequest, settings: Settings, opts: RunOptions): Promise<string> {
  const client = new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 });

  // 안전 분류기가 거절하면 서버가 알맞은 모델로 다시 실행합니다 (Haiku 5.5는 지원하지 않음).
  const fallback =
    settings.model === "claude-haiku-5-5"
      ? {}
      : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

  let streamed = "";
  try {
    const stream = client.beta.messages.stream(
      {
        model: settings.model,
        max_tokens: outputBudget(req.user),
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        output_config: { effort: settings.effort },
        ...fallback,
      },
      { signal: opts.signal },
    );
    stream.on("text", (delta) => {
      streamed += delta;
      opts.onText?.(streamed);
    });

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new EngineError("refused", "Claude가 이 내용을 정리하지 않았습니다. 내용을 바꿔 다시 시도해 주세요.");
    }
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new EngineError("failed", "정리된 글이 비어 있습니다. 원문을 조금 더 길게 말해 주세요.");
    // 출력 한도에 걸려 중간에 끊긴 글은 완성본으로 저장·복사하지 않고 알립니다.
    if (message.stop_reason === "max_tokens")
      throw new EngineError("failed", "글이 너무 길어 끝까지 정리하지 못했습니다. 나눠서 정리해 주세요.", text);
    return text;
  } catch (e) {
    if (e instanceof EngineError) throw e;
    if (e instanceof APIUserAbortError) throw new EngineError("cancelled", "정리를 멈췄습니다.", streamed);
    if (e instanceof AuthenticationError)
      throw new EngineError("failed", "Claude API 키가 맞지 않습니다. 설정에서 키를 확인해 주세요.");
    // 크레딧이 떨어지면 Claude는 400(invalid_request_error)으로 "credit balance is too low"를 보냅니다.
    if (e instanceof BadRequestError && /credit balance|billing/i.test(e.message))
      throw new EngineError(
        "failed",
        "Claude 크레딧(잔액)이 다 떨어졌습니다. console.anthropic.com → Plans & Billing에서 충전하거나, 설정에서 정리 AI를 Gemini로 바꿔 주세요.",
      );
    if (e instanceof PermissionDeniedError)
      throw new EngineError("failed", "이 API 키로는 고른 모델을 쓸 수 없습니다. 설정에서 다른 모델을 골라 주세요.");
    if (e instanceof NotFoundError)
      throw new EngineError("failed", "모델을 찾지 못했습니다. 설정에서 다른 모델을 골라 주세요.");
    if (e instanceof RateLimitError)
      throw new EngineError("failed", "요청이 많아 잠시 막혔습니다. 조금 뒤 다시 정리해 주세요.", streamed);
    if (e instanceof BadRequestError) throw new EngineError("failed", `요청이 거절되었습니다: ${e.message}`);
    if (e instanceof APIConnectionError)
      throw new EngineError("failed", "Claude 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.", streamed);
    if (e instanceof APIError) throw new EngineError("failed", `Claude 오류 (${e.status ?? "알 수 없음"}): ${e.message}`, streamed);
    throw new EngineError("failed", "정리 중 문제가 생겼습니다. 다시 정리해 주세요.", streamed);
  }
}
