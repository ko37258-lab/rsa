import type { AiRequest } from "../lib/prompts";
import type { Settings } from "../lib/settings";
import { EngineError, type RunOptions } from "./engine";
import { failureMessage, GEMINI_BASE, isBlocked, parseSse, readFailure, textOf, thinkingLevelFor } from "./gemini";

// 사용자 본인의 Gemini API 키로 정리합니다. 글이 써지는 대로 화면에 보이도록 스트리밍합니다.
export async function runWithGemini(req: AiRequest, settings: Settings, opts: RunOptions): Promise<string> {
  const url = `${GEMINI_BASE}/${settings.geminiModel}:streamGenerateContent?alt=sse`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: {
      maxOutputTokens: 16000,
      thinkingConfig: { thinkingLevel: thinkingLevelFor(settings.geminiModel, settings.effort) },
    },
  });

  let streamed = "";
  let blocked = false;
  try {
    let res: Response | null = null;
    // 서버가 잠깐 바쁠 때(5xx)만 한 번 더 시도합니다.
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": settings.geminiKey.trim() },
        body,
        signal: opts.signal,
      });
      if (res.status < 500 || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!res!.ok) throw new EngineError("failed", failureMessage(await readFailure(res!), "정리"));
    if (!res!.body) throw new EngineError("failed", "Gemini 응답을 읽지 못했습니다. 다시 정리해 주세요.");

    const reader = res!.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // 끝났으면 마지막 덩어리까지 처리되도록 빈 줄을 붙입니다.
      const { events, rest } = parseSse(done ? `${buffer}\n\n` : buffer);
      buffer = rest;
      for (const event of events) {
        if (isBlocked(event)) blocked = true;
        const delta = textOf(event);
        if (delta) {
          streamed += delta;
          opts.onText?.(streamed);
        }
      }
      if (done) break;
    }
  } catch (e) {
    if (e instanceof EngineError) throw e;
    if ((e as DOMException)?.name === "AbortError") throw new EngineError("cancelled", "정리를 멈췄습니다.", streamed);
    throw new EngineError("failed", "Gemini 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.", streamed);
  }

  const text = streamed.trim();
  if (blocked && !text) throw new EngineError("refused", "Gemini가 이 내용을 정리하지 않았습니다. 내용을 바꿔 다시 시도해 주세요.");
  if (!text) throw new EngineError("failed", "정리된 글이 비어 있습니다. 원문을 조금 더 길게 말해 주세요.");
  return text;
}
