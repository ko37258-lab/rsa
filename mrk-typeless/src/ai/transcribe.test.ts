import { afterEach, describe, expect, it, vi } from "vitest";
import { canSwitchStt, MIC_CUT_MARK, SttError, sttFailure, transcribe, type TranscribeOptions } from "./transcribe";

// 응답 본문은 2026-10-22에 실제 서버에서 받은 모양 그대로입니다(가짜 키로 요청).
const el = (status: string, message = "") => ({ detail: { type: "authentication_error", code: "unauthorized", message, status } });
const oa = (code: string, message = "") => ({ error: { message, type: "invalid_request_error", code, param: null }, status: 401 });

describe("sttFailure: 받아쓰기 서버가 보낸 진짜 이유", () => {
  it("ElevenLabs 크레딧이 떨어지면 401이어도 '키가 틀렸다'고 하지 않는다", () => {
    const e = sttFailure("elevenlabs", 401, el("quota_exceeded", "This request exceeds your quota."));
    expect(e.kind).toBe("credit");
    expect(e.message).toContain("크레딧");
    expect(e.message).not.toContain("키가 맞지 않습니다");
    expect(e.message).toContain("Gemini");
  });

  it("ElevenLabs 무료 계정 차단", () => {
    const e = sttFailure("elevenlabs", 401, el("detected_unusual_activity", "Unusual activity detected. Free Tier usage disabled."));
    expect(e.kind).toBe("blocked");
    expect(e.message).toContain("무료 계정");
  });

  it("ElevenLabs 키 권한 없음", () => {
    const e = sttFailure("elevenlabs", 401, el("missing_permissions", "The API key you used is missing the permission speech_to_text"));
    expect(e.kind).toBe("permission");
    expect(e.message).toContain("권한");
  });

  it("ElevenLabs 키가 틀림 / 키가 없음", () => {
    expect(sttFailure("elevenlabs", 401, el("invalid_api_key", "Invalid API key")).kind).toBe("key");
    expect(sttFailure("elevenlabs", 401, el("needs_authorization")).kind).toBe("key");
    expect(sttFailure("elevenlabs", 401, el("invalid_api_key")).message).toContain("ElevenLabs API 키가 맞지 않습니다");
  });

  it("OpenAI: 키 틀림·잔액 없음·지역 막힘", () => {
    expect(sttFailure("openai", 401, oa("invalid_api_key", "Incorrect API key provided")).kind).toBe("key");
    const quota = sttFailure("openai", 429, oa("insufficient_quota", "You exceeded your current quota"));
    expect(quota.kind).toBe("credit");
    expect(quota.message).toContain("OpenAI 크레딧");
    expect(sttFailure("openai", 403, oa("unsupported_country_region_territory")).kind).toBe("blocked");
    expect(sttFailure("openai", 429, oa("rate_limit_exceeded")).kind).toBe("busy");
  });

  it("본문을 못 읽어도 상태 코드로 판단하고, 모르는 오류는 서버 문구를 덧붙인다", () => {
    expect(sttFailure("elevenlabs", 402, null).kind).toBe("credit");
    expect(sttFailure("elevenlabs", 401, null).kind).toBe("key");
    expect(sttFailure("elevenlabs", 503, null).kind).toBe("busy");
    const odd = sttFailure("elevenlabs", 422, { detail: { status: "invalid_audio", message: "Audio could not be decoded" } });
    expect(odd.kind).toBe("other");
    expect(odd.message).toContain("Audio could not be decoded");
    expect(odd.message).toContain("422");
  });

  it("Gemini로 넘길 실패만 넘긴다", () => {
    expect(canSwitchStt(sttFailure("elevenlabs", 401, el("quota_exceeded")))).toBe(true);
    expect(canSwitchStt(sttFailure("elevenlabs", 401, el("invalid_api_key")))).toBe(true);
    expect(canSwitchStt(sttFailure("elevenlabs", 429, el("too_many_concurrent_requests")))).toBe(false);
    expect(canSwitchStt(new SttError("녹음이 너무 깁니다."))).toBe(false);
    expect(canSwitchStt(new Error("x"))).toBe(false);
  });
});

describe("녹음 받아쓰기: 잠깐 바쁘면 한 번 더 보내 녹음을 살립니다", () => {
  type Reply = { status: number; body?: unknown } | "network";
  /** 차례로 답하는 가짜 서버. 다 쓰면 성공(받아쓴 글)으로 답합니다. */
  function fakeStt(replies: Reply[], ok: unknown = { candidates: [{ content: { parts: [{ text: "받아쓴 말" }] }, finishReason: "STOP" }] }) {
    const bodies: unknown[] = [];
    const queue = [...replies];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
        bodies.push(init.body);
        const r = queue.shift();
        if (r === "network") throw new TypeError("Failed to fetch");
        const json = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
        return r ? json(r.body ?? { error: { code: r.status, message: "busy" } }, r.status) : json(ok, 200);
      }),
    );
    return bodies;
  }
  const audio = () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm;codecs=opus" });
  const gemini: TranscribeOptions = { provider: "gemini", apiKey: "AIza", lang: "ko-KR" };
  /** 기다림(1.5초)을 건너뛰며 끝까지 기다립니다. */
  async function run<T>(job: Promise<T>): Promise<T> {
    job.catch(() => {});
    await vi.advanceTimersByTimeAsync(2000);
    return job;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("Gemini가 503(과부하)이면 한 번 더 보내고, 녹음은 한 번만 base64로 바꿔 같은 본문을 보냅니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const bodies = fakeStt([{ status: 503, body: { error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded." } } }]);
    expect(await run(transcribe(audio(), "speech.webm", gemini))).toBe("받아쓴 말");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  it("연결이 잠깐 끊겨도 한 번 더 보냅니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const bodies = fakeStt(["network"]);
    expect(await run(transcribe(audio(), "speech.webm", gemini))).toBe("받아쓴 말");
    expect(bodies).toHaveLength(2);
  });

  it("두 번 다 바쁘면 그때 알립니다 (세 번은 보내지 않음)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const bodies = fakeStt([{ status: 503 }, { status: 503 }]);
    await expect(run(transcribe(audio(), "speech.webm", gemini))).rejects.toMatchObject({ kind: "busy", message: expect.stringContaining("다시 받아쓰기해") });
    expect(bodies).toHaveLength(2);
  });

  it("하루 한도(…PerDay…)나 잘못된 요청(400)은 다시 보내지 않습니다", async () => {
    const daily = { error: { code: 429, message: "quota", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } };
    let bodies = fakeStt([{ status: 429, body: daily }]);
    await expect(transcribe(audio(), "speech.webm", gemini)).rejects.toMatchObject({ kind: "quota" });
    expect(bodies).toHaveLength(1);
    bodies = fakeStt([{ status: 400, body: { error: { code: 400, message: "bad" } } }]);
    await expect(transcribe(audio(), "speech.webm", gemini)).rejects.toBeInstanceOf(SttError);
    expect(bodies).toHaveLength(1);
  });

  it("1분 한도(429)는 잠시 뒤 다시 보냅니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const bodies = fakeStt([{ status: 429, body: { error: { code: 429, message: "Resource has been exhausted (e.g. check quota)." } } }]);
    expect(await run(transcribe(audio(), "speech.webm", gemini))).toBe("받아쓴 말");
    expect(bodies).toHaveLength(2);
  });

  it("ElevenLabs·OpenAI도 5xx·몰림(429)은 다시 보내고, 크레딧 부족은 다시 보내지 않습니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let bodies = fakeStt([{ status: 503, body: {} }], { text: " 일레븐랩스 " });
    expect(await run(transcribe(audio(), "speech.webm", { provider: "elevenlabs", apiKey: "sk_e", lang: "ko-KR" }))).toBe("일레븐랩스");
    expect(bodies).toHaveLength(2);
    bodies = fakeStt([{ status: 429, body: { error: { code: "rate_limit_exceeded" } } }], { text: "오픈에이아이" });
    expect(await run(transcribe(audio(), "speech.webm", { provider: "openai", apiKey: "sk-o", lang: "ko-KR" }))).toBe("오픈에이아이");
    expect(bodies).toHaveLength(2);
    bodies = fakeStt([{ status: 429, body: { error: { code: "insufficient_quota" } } }], { text: "x" });
    await expect(transcribe(audio(), "speech.webm", { provider: "openai", apiKey: "sk-o", lang: "ko-KR" })).rejects.toMatchObject({ kind: "credit" });
    expect(bodies).toHaveLength(1);
  });

  it("기다리는 중에 멈추기를 누르면 바로 그만둡니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const bodies = fakeStt([{ status: 503 }]);
    const ctl = new AbortController();
    const job = transcribe(audio(), "speech.webm", { ...gemini, signal: ctl.signal });
    job.catch(() => {});
    await vi.advanceTimersByTimeAsync(500);
    ctl.abort();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(bodies).toHaveLength(1);
  });

  it("긴 녹음이 출력 한도에 걸려도 받은 글은 버리지 않고 끝에 표시를 붙입니다", async () => {
    const bodies = fakeStt([], { candidates: [{ content: { parts: [{ text: "앞부분 받아쓴 말" }] }, finishReason: "MAX_TOKENS" }] });
    expect(await transcribe(audio(), "speech.webm", gemini)).toBe(`앞부분 받아쓴 말\n${MIC_CUT_MARK}`);
    expect(MIC_CUT_MARK).toContain("받아쓰지 못했습니다");
    const sent = JSON.parse(bodies[0] as string) as { generationConfig: { maxOutputTokens: number } };
    expect(sent.generationConfig.maxOutputTokens).toBe(32768);
  });
});
