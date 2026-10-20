import { describe, expect, it } from "vitest";
import { applyReplacements, DEFAULT_DICTIONARY } from "./dictionary";
import { localCleanup } from "./localCleanup";
import { getMode } from "./modes";
import { buildEditPrompt, buildPolishPrompt, toSingleInput } from "./prompts";
import { DEFAULT_SETTINGS, resolveEngine } from "./settings";
import { countChars, estimateSavedMs, formatClock, formatDuration } from "./stats";

const ctx = { dictionary: DEFAULT_DICTIONARY, styleNote: "", targetLanguage: "영어", signature: "" };

describe("localCleanup", () => {
  it("뜻 없는 감탄사와 바로 반복한 말을 지운다", () => {
    const { text, removed } = localCleanup("음 그러니까 어 그 그 상가 건물을 음음, 보러 가요");
    expect(text).toBe("그러니까 그 상가 건물을 보러 가요");
    expect(removed).toBe(4);
  });

  it("뜻이 있는 말과 줄바꿈은 그대로 둔다", () => {
    const { text, removed } = localCleanup("어디 가세요?\n저는 아파트 보러 가요.");
    expect(text).toBe("어디 가세요?\n저는 아파트 보러 가요.");
    expect(removed).toBe(0);
  });
});

describe("applyReplacements", () => {
  it("사전의 바꿔쓰기 규칙을 모두 적용하고 횟수를 센다", () => {
    const { text, count } = applyReplacements("건폐률과 용적율, 지구 단위 계획", DEFAULT_DICTIONARY.replacements);
    expect(text).toBe("건폐율과 용적률, 지구단위계획");
    expect(count).toBe(3);
  });

  it("빈 규칙은 건너뛴다", () => {
    expect(applyReplacements("그대로", [{ from: "", to: "x" }]).text).toBe("그대로");
  });
});

describe("prompts", () => {
  it("정리 프롬프트에 형식·사전·원문이 들어간다", () => {
    const req = buildPolishPrompt("  원문입니다  ", getMode("consult"), { ...ctx, styleNote: "짧게" });
    expect(req.system).toContain("[이번 글의 형식: 상담 노트]");
    expect(req.system).toContain("건폐율");
    expect(req.system).toContain("건폐률 → 건폐율");
    expect(req.system).toContain("[나만의 문체]\n짧게");
    expect(req.user).toBe("<원문>\n원문입니다\n</원문>");
  });

  it("번역 모드는 대상 언어를, 이메일 모드는 서명을 넣는다", () => {
    expect(buildPolishPrompt("a", getMode("translate"), { ...ctx, targetLanguage: "일본어" }).system).toContain("[번역할 언어] 일본어");
    expect(buildPolishPrompt("a", getMode("email"), { ...ctx, signature: "고상철 드림" }).system).toContain('서명 "고상철 드림"');
    expect(buildPolishPrompt("a", getMode("clean"), { ...ctx, signature: "고상철 드림" }).system).not.toContain("서명");
  });

  it("음성 편집 프롬프트는 지시와 글을 나눠 담는다", () => {
    const req = buildEditPrompt("본문", "세 줄로 요약", ctx);
    expect(req.user).toBe("<지시>\n세 줄로 요약\n</지시>\n\n<편집할 글>\n본문\n</편집할 글>");
    expect(toSingleInput(req).startsWith(req.system)).toBe(true);
  });
});

describe("resolveEngine", () => {
  it("자동이면 계정 → API 키 → AI 없이 순서로 고른다", () => {
    expect(resolveEngine(DEFAULT_SETTINGS, true, true)).toBe("account");
    expect(resolveEngine({ ...DEFAULT_SETTINGS, apiKey: "sk-ant-x" }, false, true)).toBe("apikey");
    expect(resolveEngine({ ...DEFAULT_SETTINGS, apiKey: "sk-ant-x" }, false, false)).toBe("local");
    expect(resolveEngine(DEFAULT_SETTINGS, false, true)).toBe("local");
  });

  it("고른 방식을 쓸 수 없으면 기본 정리로 내려간다", () => {
    expect(resolveEngine({ ...DEFAULT_SETTINGS, engine: "account" }, false, true)).toBe("local");
    expect(resolveEngine({ ...DEFAULT_SETTINGS, engine: "apikey" }, true, true)).toBe("local");
  });
});

describe("stats", () => {
  it("공백을 빼고 글자를 센다", () => {
    expect(countChars("가 나\n다")).toBe(3);
  });

  it("타자 시간에서 말한 시간을 뺀 만큼 절약으로 본다", () => {
    const result = "가".repeat(240); // 타자 2분
    expect(estimateSavedMs(result, "", 30_000)).toBe(90_000);
    expect(estimateSavedMs("가", "가".repeat(700))).toBe(0);
  });

  it("시간을 읽기 쉽게 쓴다", () => {
    expect(formatDuration(45_000)).toBe("45초");
    expect(formatDuration(90_000)).toBe("1분 30초");
    expect(formatDuration(3_720_000)).toBe("1시간 2분");
    expect(formatClock(75_000)).toBe("01:15");
  });
});
