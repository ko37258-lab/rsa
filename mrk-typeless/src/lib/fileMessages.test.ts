import { describe, expect, it } from "vitest";
import { sttFailure } from "../ai/transcribe";
import { forFile } from "./fileMessages";

describe("forFile", () => {
  it("마이크용 안내를 녹음 파일에 맞는 말로 바꾼다", () => {
    expect(forFile("녹음이 너무 깁니다. 나눠서 말해 주세요.")).toBe("녹음이 너무 깁니다. 나눠서 올려 주세요.");
    expect(forFile("ElevenLabs 받아쓰기 서버가 잠시 멈췄습니다. 조금 뒤 다시 말해 주세요.")).toBe(
      "ElevenLabs 받아쓰기 서버가 잠시 멈췄습니다. 조금 뒤 다시 해 주세요.",
    );
  });

  it("서버가 보낸 영어 설명을 뺀다 (PC 프로그램과 같은 결과)", () => {
    const e = sttFailure("openai", 400, { error: { message: "Something went wrong" } });
    expect(e.message).toContain("(OpenAI: Something went wrong)");
    expect(forFile(e.message)).toBe("받아쓰기 중 오류가 났습니다 (400). 다시 해 주세요.");
    const denied = sttFailure("elevenlabs", 403, { detail: { message: "Not allowed" } });
    expect(forFile(denied.message)).not.toMatch(/Not allowed|ElevenLabs:/);
    expect(forFile("Gemini가 거절했습니다 (400): Bad request")).toBe("Gemini가 거절했습니다 (400).");
  });

  it("파일 형식 때문에 거절되면 그 뜻을 한국어로 알려 준다", () => {
    const e = sttFailure("openai", 400, {
      error: { message: "Invalid file format. Supported formats: ['flac', 'm4a', 'mp3']" },
    });
    const m = forFile(e.message);
    expect(m).not.toMatch(/Invalid|Supported|OpenAI:/);
    expect(m).toContain("받지 않는 파일 형식");
    expect(m).toContain("다시 해 주세요.");
  });

  it("고칠 것이 없으면 그대로 둔다", () => {
    const m = "Gemini 사용량 한도에 닿았습니다. 내일 다시 올려 주세요.";
    expect(forFile(m)).toBe(m);
  });
});
