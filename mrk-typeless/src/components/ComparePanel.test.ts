import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../lib/settings";
import { engineSetup, reusableFor, type ShownResult } from "./ComparePanel";

const req = { system: "정리 지시", user: "원문" };
const settings: Settings = { ...DEFAULT_SETTINGS, geminiModel: "gemini-3.8-flash", model: "claude-opus-5-5", effort: "low" };
const shown: ShownResult = { engine: "gemini", req, text: "정리된 글", ms: 1200, setup: engineSetup("gemini", settings) };

describe("reusableFor: 비교를 열 때 화면의 글을 다시 보내지 않기", () => {
  it("같은 엔진·같은 지시·같은 설정이면 화면의 글을 그대로 쓴다", () => {
    expect(reusableFor(shown, "gemini", { ...req }, settings)).toBe(shown);
  });

  it("다른 엔진 쪽은 새로 보낸다", () => {
    expect(reusableFor(shown, "apikey", req, settings)).toBeNull();
    expect(reusableFor(shown, null, req, settings)).toBeNull();
  });

  it("지시(형식·사전)가 바뀌었으면 새로 보낸다", () => {
    expect(reusableFor(shown, "gemini", { ...req, system: "이메일 지시" }, settings)).toBeNull();
    expect(reusableFor(shown, "gemini", { ...req, user: "다른 원문" }, settings)).toBeNull();
  });

  it("모델이나 생각 깊이를 바꿨으면 새로 보낸다", () => {
    expect(reusableFor(shown, "gemini", req, { ...settings, geminiModel: "gemini-4-argon" })).toBeNull();
    expect(reusableFor(shown, "gemini", req, { ...settings, effort: "medium" })).toBeNull();
    // Gemini 쪽 결과는 Claude 모델을 바꿔도 그대로 씁니다.
    expect(reusableFor(shown, "gemini", req, { ...settings, model: "claude-haiku-5-5" })).toBe(shown);
  });

  it("끝까지 정리된 글이 없으면 둘 다 새로 보낸다", () => {
    expect(reusableFor(null, "gemini", req, settings)).toBeNull();
  });
});
