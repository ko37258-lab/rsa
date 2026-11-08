import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/http";

let client: Anthropic | null = null;
function getClient() {
  if (!env.anthropicApiKey) throw new ApiError(503, "ai_not_configured", "AI 키(ANTHROPIC_API_KEY)가 설정되지 않았습니다.");
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };

export type DesignTool = {
  name: string;
  description: string;
  inputSchema: Anthropic.Beta.BetaTool.InputSchema;
};

/** 검사 결과: 통과하면 data, 아니면 다시 요청할 때 AI 에게 알려 줄 이유 */
export type Check<T> = { ok: true; data: T } | { ok: false; reason: string };

const MAX_ATTEMPTS = 2;

/**
 * Claude 에게 디자인을 도구 호출(비-strict) 형태로 받아옵니다.
 * - 디자인 형식이 커서 구조화 출력/strict 도구로 강제하면 "compiled grammar is too large" 400 이 납니다.
 *   그래서 형식은 도구 설명(JSON 스키마)으로만 알려 주고, 결과는 서버에서 검사·보정(normalizeDesign)합니다.
 * - 형식이 틀리면 이유를 덧붙여 한 번 더 요청합니다 (대화 기록 없이 새 요청).
 * - 긴 응답에 대비해 스트리밍 + finalMessage(), 안전 분류기 거절 시 서버 측 fallback("default").
 */
export async function designToolCall<T>(opts: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  tool: DesignTool;
  validate: (input: unknown) => Check<T>;
  effort: "low" | "medium" | "high";
}): Promise<{ data: T; usage: AiUsage }> {
  const anthropic = getClient();
  const usage: AiUsage = { model: env.aiModel, inputTokens: 0, outputTokens: 0 };
  let lastReason = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const content: Anthropic.Beta.BetaContentBlockParam[] = lastReason
      ? [
          ...opts.content,
          {
            type: "text",
            text: `이전 시도의 결과를 쓸 수 없었습니다 (${lastReason}). 반드시 ${opts.tool.name} 도구를 한 번 호출해, 스키마의 모든 필수 항목을 채운 전체 결과를 제출하세요.`,
          },
        ]
      : opts.content;

    let msg: Anthropic.Beta.BetaMessage;
    try {
      const stream = anthropic.beta.messages.stream({
        model: env.aiModel,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        tools: [
          {
            name: opts.tool.name,
            description: opts.tool.description,
            input_schema: opts.tool.inputSchema,
            eager_input_streaming: true,
          },
        ],
        tool_choice: { type: "auto" },
        output_config: { effort: opts.effort },
        messages: [{ role: "user", content }],
      });
      msg = await stream.finalMessage();
    } catch (err) {
      // 도구 입력 JSON 을 읽지 못한 경우(SDK 내부 오류)는 형식 오류로 보고 다시 요청
      if (err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError)) {
        console.error("[ai] tool input parse error", err.message);
        lastReason = "도구 입력 JSON 을 읽을 수 없음";
        continue;
      }
      throw mapError(err);
    }

    usage.model = msg.model;
    usage.inputTokens += msg.usage.input_tokens;
    usage.outputTokens += msg.usage.output_tokens;

    if (msg.stop_reason === "refusal") {
      throw new ApiError(422, "ai_refusal", "AI 가 이 요청을 처리하지 않았습니다. 요청 문구나 첨부 이미지를 바꿔 다시 시도해 주세요.");
    }
    if (msg.stop_reason === "max_tokens") {
      throw new ApiError(502, "ai_truncated", "AI 응답이 너무 길어 잘렸습니다. 요청을 조금 단순하게 해서 다시 시도해 주세요.");
    }

    const input = extractInput(msg.content, opts.tool.name);
    if (input === undefined) {
      lastReason = `${opts.tool.name} 도구를 호출하지 않음`;
      continue;
    }
    const checked = opts.validate(input);
    if (checked.ok) return { data: checked.data, usage };
    console.error("[ai] invalid design output", checked.reason);
    lastReason = checked.reason;
  }

  throw new ApiError(502, "ai_invalid_output", "AI 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.");
}

/** 도구 호출 입력을 꺼냅니다. 도구를 부르지 않고 글로 JSON 을 쓴 경우도 받아 줍니다. */
function extractInput(content: Anthropic.Beta.BetaContentBlock[], toolName: string): unknown {
  for (const b of content) {
    if (b.type === "tool_use" && b.name === toolName) return b.input;
  }
  const text = content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function mapError(err: unknown): unknown {
  if (err instanceof ApiError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new ApiError(503, "ai_auth", "AI 키가 올바르지 않습니다. ANTHROPIC_API_KEY 를 확인해 주세요.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ApiError(429, "ai_rate_limited", "AI 요청이 많아 잠시 지연되고 있습니다. 1분 뒤 다시 시도해 주세요.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request", err.message);
    return new ApiError(502, "ai_bad_request", `AI 요청이 거부되었습니다: ${err.message}`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ApiError(502, "ai_unreachable", "AI 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.");
  }
  if (err instanceof Anthropic.APIError) {
    return new ApiError(502, "ai_error", `AI 서버 오류 (${err.status ?? "?"}). 잠시 후 다시 시도해 주세요.`);
  }
  return err;
}
