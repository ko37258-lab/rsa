import { describe, expect, it } from "vitest";
import { failureMessage, isBlocked, parseSse, textOf, thinkingLevelFor } from "./gemini";
import { geminiMime } from "./transcribe";

const chunk = (text: string, extra: object = {}) => ({ candidates: [{ content: { parts: [{ text }] }, ...extra }] });

describe("parseSse", () => {
  it("완성된 덩어리만 꺼내고, 끊긴 마지막 줄은 다음 조각을 위해 남긴다", () => {
    const a = JSON.stringify(chunk("이번 주 "));
    const b = JSON.stringify(chunk("금요일"));
    const { events, rest } = parseSse(`data: ${a}\r\n\r\ndata: ${b}\n\ndata: {"cand`);
    expect(events.map(textOf)).toEqual(["이번 주 ", "금요일"]);
    expect(rest).toBe('data: {"cand');
  });

  it("깨진 덩어리는 건너뛴다", () => {
    const { events } = parseSse(`data: {oops}\n\ndata: ${JSON.stringify(chunk("ok"))}\n\n`);
    expect(events.map(textOf)).toEqual(["ok"]);
  });
});

describe("textOf · isBlocked", () => {
  it("생각(thought) 부분은 빼고 글만 모은다", () => {
    const res = { candidates: [{ content: { parts: [{ text: "고민 중", thought: true }, { text: "정리된 글" }] } }] };
    expect(textOf(res)).toBe("정리된 글");
  });

  it("안전 필터로 막히면 차단으로 본다", () => {
    expect(isBlocked({ promptFeedback: { blockReason: "SAFETY" } })).toBe(true);
    expect(isBlocked(chunk("", { finishReason: "PROHIBITED_CONTENT" }))).toBe(true);
    expect(isBlocked(chunk("끝", { finishReason: "STOP" }))).toBe(false);
  });
});

describe("thinkingLevelFor", () => {
  it("빠르게는 모델이 허용하는 가장 낮은 단계, 꼼꼼하게는 MEDIUM", () => {
    expect(thinkingLevelFor("gemini-3.5-flash-lite", "low")).toBe("MINIMAL");
    expect(thinkingLevelFor("gemini-3.8-flash", "low")).toBe("LOW");
    expect(thinkingLevelFor("gemini-4-argon", "medium")).toBe("MEDIUM");
  });
});

describe("failureMessage", () => {
  it("잘못된 키·한도 초과를 알아듣기 쉬운 말로 바꾼다", () => {
    expect(failureMessage({ status: 400, reason: "API_KEY_INVALID", message: "" }, "정리")).toContain("키가 맞지 않습니다");
    expect(failureMessage({ status: 429, reason: "RESOURCE_EXHAUSTED", message: "" }, "정리")).toContain("한도");
    expect(failureMessage({ status: 503, reason: "UNAVAILABLE", message: "" }, "받아쓰기")).toContain("다시 받아쓰기해");
  });
});

describe("geminiMime", () => {
  it("코덱 꼬리를 떼고 Safari의 mp4 녹음은 m4a로 보낸다", () => {
    expect(geminiMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(geminiMime("audio/mp4")).toBe("audio/m4a");
    expect(geminiMime("")).toBe("audio/webm");
  });
});
