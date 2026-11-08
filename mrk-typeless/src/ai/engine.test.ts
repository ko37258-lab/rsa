import { describe, expect, it } from "vitest";
import { outputBudget } from "./engine";

describe("outputBudget", () => {
  it("짧은 글은 16,000, 긴 글은 길이에 맞춰 늘리되 Gemini는 64,000을 넘지 않습니다", () => {
    expect(outputBudget("짧은 글")).toBe(16000);
    expect(outputBudget("가".repeat(10000))).toBe(25000);
    expect(outputBudget("가".repeat(60000))).toBe(64000);
  });

  it("늘 스트리밍하는 Claude는 128,000까지 늘립니다 (PC 프로그램과 같음)", () => {
    expect([30000, 40000, 60000].map((n) => outputBudget("가".repeat(n), 128000))).toEqual([75000, 100000, 128000]);
    expect(outputBudget("짧은 글", 128000)).toBe(16000);
  });
});
