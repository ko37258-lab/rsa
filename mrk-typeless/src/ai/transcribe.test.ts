import { describe, expect, it } from "vitest";
import { canSwitchStt, SttError, sttFailure } from "./transcribe";

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
