import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/http";

let client: Anthropic | null = null;
function getClient() {
  if (!env.anthropicApiKey) throw new ApiError(503, "ai_not_configured", "AI 키(ANTHROPIC_API_KEY)가 설정되지 않았습니다.");
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };

/**
 * Claude 에 구조화 출력(JSON 스키마)으로 디자인을 요청합니다.
 * - 이미지(레퍼런스·사진)는 content 블록으로 함께 전달
 * - 긴 출력에 대비해 스트리밍 + finalMessage() 사용
 * - 안전 분류기 거절 시 서버 측 fallback("default") 사용
 */
export async function structuredDesignCall<S extends z.ZodType>(opts: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort: "low" | "medium" | "high";
}): Promise<{ data: z.infer<S>; usage: AiUsage }> {
  const anthropic = getClient();
  try {
    const stream = anthropic.beta.messages.stream({
      model: env.aiModel,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      throw new ApiError(422, "ai_refusal", "AI 가 이 요청을 처리하지 않았습니다. 요청 문구나 첨부 이미지를 바꿔 다시 시도해 주세요.");
    }
    if (msg.stop_reason === "max_tokens") {
      throw new ApiError(502, "ai_truncated", "AI 응답이 너무 길어 잘렸습니다. 요청을 조금 단순하게 해서 다시 시도해 주세요.");
    }
    const parsed = msg.parsed_output as z.infer<S> | null | undefined;
    const data = parsed ?? parseTextFallback(msg.content, opts.schema);
    return {
      data,
      usage: { model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ApiError(503, "ai_auth", "AI 키가 올바르지 않습니다. ANTHROPIC_API_KEY 를 확인해 주세요.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ApiError(429, "ai_rate_limited", "AI 요청이 많아 잠시 지연되고 있습니다. 1분 뒤 다시 시도해 주세요.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new ApiError(502, "ai_bad_request", `AI 요청이 거부되었습니다: ${err.message}`);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new ApiError(502, "ai_unreachable", "AI 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new ApiError(502, "ai_error", `AI 서버 오류 (${err.status ?? "?"}). 잠시 후 다시 시도해 주세요.`);
    }
    if (err instanceof Anthropic.AnthropicError) {
      // 응답이 스키마 검증을 통과하지 못한 경우 등 (SDK 내부 오류)
      console.error("[ai] output error", err.message);
      throw new ApiError(502, "ai_invalid_output", "AI 응답 형식이 올바르지 않습니다. 한 번 더 시도해 주세요.");
    }
    throw err;
  }
}

function parseTextFallback<S extends z.ZodType>(content: Anthropic.Beta.BetaContentBlock[], schema: S): z.infer<S> {
  const text = content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new ApiError(502, "ai_invalid_output", "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.");
  const result = schema.safeParse(JSON.parse(text.slice(start, end + 1)));
  if (!result.success) throw new ApiError(502, "ai_invalid_output", "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");
  return result.data;
}
