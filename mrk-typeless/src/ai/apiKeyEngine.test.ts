import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../lib/settings";
import { runWithApiKey } from "./apiKeyEngine";
import { EngineError } from "./engine";

const settings = { apiKey: "sk-ant-k", model: "claude-opus-5-5", effort: "low" } as unknown as Settings;
const req = { system: "정리하세요", user: "원문" };

/** Anthropic 서버를 흉내 냅니다. 보낸 요청 본문을 bodies에 남깁니다. x-should-retry로 SDK가 다시 보내지 않게 합니다. */
function fakeClaude(reply: () => Response) {
  const bodies: { max_tokens?: number }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      bodies.push(JSON.parse(String(init.body)));
      return reply();
    }),
  );
  return bodies;
}
const errorBody = (type: string, message: string) => JSON.stringify({ type: "error", error: { type, message } });
const jsonError = (status: number, type: string, message: string) => () =>
  new Response(errorBody(type, message), { status, headers: { "content-type": "application/json", "x-should-retry": "false" } });

async function failure(): Promise<EngineError> {
  try {
    await runWithApiKey(req, settings, {});
  } catch (e) {
    return e as EngineError;
  }
  throw new Error("실패해야 합니다");
}

afterEach(() => vi.unstubAllGlobals());

describe("Claude API 키 정리: 서버 오류를 한국어로 알립니다", () => {
  it("과부하(529)는 응답 JSON 대신 바쁘다고 알립니다", async () => {
    fakeClaude(jsonError(529, "overloaded_error", "Overloaded"));
    const e = await failure();
    expect(e).toBeInstanceOf(EngineError);
    expect(e.message).toContain("Claude 서버가 바쁩니다");
    expect(e.message).not.toContain("{");
  });

  it("500(api_error)도 바쁘다고 알립니다", async () => {
    fakeClaude(jsonError(500, "api_error", "Internal server error"));
    expect((await failure()).message).toContain("Claude 서버가 바쁩니다");
  });

  it("스트리밍 도중 온 과부하(event: error, 상태 코드 없음)도 바쁘다고 알립니다", async () => {
    fakeClaude(
      () =>
        new Response(`event: error\ndata: ${errorBody("overloaded_error", "Overloaded")}\n\n`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const e = await failure();
    expect(e.message).toContain("Claude 서버가 바쁩니다");
    expect(e.message).not.toContain("{");
  });

  it("그 밖의 거절(400)은 서버가 한 말만 보여 줍니다", async () => {
    fakeClaude(jsonError(400, "invalid_request_error", "messages: text content blocks must be non-empty"));
    expect((await failure()).message).toBe("요청이 거절되었습니다: messages: text content blocks must be non-empty");
  });

  it("크레딧이 떨어진 400은 여전히 충전하라고 알립니다", async () => {
    fakeClaude(jsonError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."));
    expect((await failure()).message).toContain("크레딧");
  });

  it("긴 원문은 출력 한도를 128,000까지 늘려 보냅니다", async () => {
    const bodies = fakeClaude(jsonError(529, "overloaded_error", "Overloaded"));
    await runWithApiKey({ system: "s", user: "가".repeat(60000) }, settings, {}).catch(() => {});
    expect(bodies[0].max_tokens).toBe(128000);
  });
});
