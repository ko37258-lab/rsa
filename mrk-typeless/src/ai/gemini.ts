// Google Gemini API를 브라우저에서 사용자 본인의 키로 직접 부릅니다 (SDK 없이 fetch만 씁니다).
// 키는 이 브라우저의 저장소에만 있고, Google 서버 외에는 어디에도 보내지 않습니다.

import type { GeminiModelId } from "../lib/settings";

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** 녹음을 글자로 바꿀 때 쓰는 모델 (정리 모델과 따로, 빠르고 정확한 쪽으로 고정) */
export const GEMINI_STT_MODEL: GeminiModelId = "gemini-3.8-flash";

type ThinkingLevel = "MINIMAL" | "LOW" | "MEDIUM";

// 모델마다 고를 수 있는 가장 낮은 생각 단계가 다릅니다 (Flash-Lite만 MINIMAL 가능).
const FASTEST: Record<GeminiModelId, ThinkingLevel> = {
  "gemini-3.8-flash": "LOW",
  "gemini-4-argon": "LOW",
  "gemini-3.5-flash-lite": "MINIMAL",
};

/** 설정의 '생각하는 정도'를 Gemini의 thinkingLevel로 바꿉니다. */
export function thinkingLevelFor(model: GeminiModelId, effort: "low" | "medium"): ThinkingLevel {
  return effort === "medium" ? "MEDIUM" : FASTEST[model] ?? "LOW";
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  /** 스트리밍 도중 서버가 보내는 오류 (한도 초과, 서버 문제 등) */
  error?: { code?: number; message?: string; status?: string };
}

/** 첫 후보의 끝난 이유 (STOP, MAX_TOKENS, SAFETY …) */
export function finishReasonOf(chunk: GeminiResponse): string | undefined {
  return chunk.candidates?.[0]?.finishReason;
}

/** 출력 한도에 걸려 끝까지 쓰지 못했는지 */
export function isTruncated(chunk: GeminiResponse): boolean {
  return finishReasonOf(chunk) === "MAX_TOKENS";
}

/** 스트림 안의 오류 덩어리를 실패 정보로 바꿉니다 */
export function streamFailure(chunk: GeminiResponse): GeminiFailure | null {
  if (!chunk.error) return null;
  return { status: chunk.error.code ?? 500, reason: chunk.error.status ?? "", message: chunk.error.message ?? "" };
}

export const TRUNCATED_MESSAGE = "글이 너무 길어 끝까지 정리하지 못했습니다. 나눠서 정리해 주세요.";

/** 응답 한 덩어리에서 생각(thought)을 뺀 글만 꺼냅니다. */
export function textOf(chunk: GeminiResponse): string {
  const parts = chunk.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/** 거절·차단으로 끝났는지 (안전 필터 등) */
export function isBlocked(chunk: GeminiResponse): boolean {
  if (chunk.promptFeedback?.blockReason) return true;
  const reason = chunk.candidates?.[0]?.finishReason;
  return !!reason && ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(reason);
}

/**
 * SSE(alt=sse) 응답을 읽기 쉬운 덩어리로 나눕니다.
 * 버퍼에 남은 마지막 미완성 줄은 rest로 돌려줘 다음 조각과 이어 붙입니다.
 */
export function parseSse(buffer: string): { events: GeminiResponse[]; rest: string } {
  const events: GeminiResponse[] = [];
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    // SSE 규칙대로: data: 줄 여러 개는 줄바꿈으로 잇고, 앞의 빈칸 하나만 뗍니다.
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data) as GeminiResponse);
    } catch {
      // 깨진 덩어리는 건너뜁니다.
    }
  }
  return { events, rest };
}

export interface GeminiFailure {
  status: number;
  reason: string;
  message: string;
}

/** 실패 응답 본문에서 이유(API_KEY_INVALID 등)와 설명을 꺼냅니다. */
export async function readFailure(res: Response): Promise<GeminiFailure> {
  let reason = "";
  let message = "";
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string; details?: { reason?: string }[] };
    };
    message = body.error?.message ?? "";
    reason = body.error?.details?.find((d) => d.reason)?.reason ?? body.error?.status ?? "";
  } catch {
    // 본문이 JSON이 아니면 상태 코드만으로 판단합니다.
  }
  return { status: res.status, reason, message };
}

/** 실패 이유를 사용자에게 보여 줄 한국어 문장으로 바꿉니다. */
export function failureMessage(f: GeminiFailure, what: "정리" | "받아쓰기"): string {
  if (f.reason === "API_KEY_INVALID" || f.status === 401)
    return "Gemini API 키가 맞지 않습니다. 설정에서 키를 확인해 주세요.";
  if (f.status === 403)
    return "이 Gemini API 키로는 쓸 수 없습니다. Google AI Studio에서 키와 결제 설정을 확인해 주세요.";
  if (f.status === 404)
    return what === "받아쓰기"
      ? `받아쓰기용 Gemini 모델(${GEMINI_STT_MODEL})을 이 키로 쓸 수 없습니다. 설정 → 음성 인식에서 다른 받아쓰기 서비스를 골라 주세요.`
      : "Gemini 모델을 찾지 못했습니다. 설정에서 다른 Gemini 모델을 골라 주세요.";
  if (f.status === 429) return "Gemini 사용량 한도에 닿았습니다. 잠시 뒤 다시 하거나 Google AI Studio에서 한도를 확인해 주세요.";
  if (f.status === 413 || /payload size/i.test(f.message)) return "녹음이 너무 깁니다. 나눠서 말해 주세요.";
  if (f.status >= 500) return `Gemini 서버가 바쁩니다. 잠시 뒤 다시 ${what}해 주세요.`;
  return `Gemini가 요청을 거절했습니다 (${f.status})${f.message ? `: ${f.message}` : ""}`;
}

/** 녹음 파일을 Gemini에 넣을 수 있게 base64로 바꿉니다. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
