import { afterEach, describe, expect, it, vi } from "vitest";
import { SttError } from "../ai/transcribe";
import { waitUnlessAborted } from "./useAiRun";
import { transcribeRecording } from "./useRecorder";

const transcribeMock = vi.hoisted(() => vi.fn());
vi.mock("../ai/transcribe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/transcribe")>()),
  transcribe: transcribeMock,
}));

afterEach(() => {
  transcribeMock.mockReset();
  vi.useRealTimers();
});

describe("waitUnlessAborted: 기본 정리(AI 없이)의 줄 긋기 시간", () => {
  it("끝까지 기다리면 true", async () => {
    vi.useFakeTimers();
    const done = waitUnlessAborted(1100, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1100);
    await expect(done).resolves.toBe(true);
  });

  it("멈추기·Esc를 누르면 바로 false로 끝나 결과를 내지 않는다", async () => {
    vi.useFakeTimers();
    const ctl = new AbortController();
    const done = waitUnlessAborted(1100, ctl.signal);
    await vi.advanceTimersByTimeAsync(250);
    ctl.abort();
    await expect(done).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("이미 멈춘 뒤면 기다리지 않는다", async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(waitUnlessAborted(1100, ctl.signal)).resolves.toBe(false);
  });
});

describe("transcribeRecording: 녹음 하나 받아쓰기", () => {
  const audio = new Blob(["x"], { type: "audio/webm" });
  const opts = { lang: "ko-KR", provider: "elevenlabs" as const, apiKey: "el-key", geminiKey: "g-key" };

  it("받아쓴 글을 돌려준다", async () => {
    transcribeMock.mockResolvedValueOnce("안녕하세요");
    await expect(transcribeRecording(audio, "speech.webm", opts, new AbortController().signal)).resolves.toEqual({
      text: "안녕하세요",
    });
  });

  it("서버가 바쁘면 오류 문구를 돌려준다 (녹음은 훅이 남겨 '다시 받아쓰기'로 보냄)", async () => {
    transcribeMock.mockRejectedValueOnce(
      new SttError("ElevenLabs 받아쓰기 서버가 잠시 멈췄습니다. 조금 뒤 다시 말해 주세요.", "busy"),
    );
    const out = await transcribeRecording(audio, "speech.webm", opts, new AbortController().signal);
    expect(out).toEqual({ error: "ElevenLabs 받아쓰기 서버가 잠시 멈췄습니다. 조금 뒤 다시 말해 주세요." });
    expect(transcribeMock).toHaveBeenCalledTimes(1);
  });

  it("다시 보내면 같은 녹음을 그대로 보낸다", async () => {
    transcribeMock.mockRejectedValueOnce(new SttError("바쁨", "busy")).mockResolvedValueOnce("두 번째에 됨");
    const signal = new AbortController().signal;
    expect(await transcribeRecording(audio, "speech.webm", opts, signal)).toEqual({ error: "바쁨" });
    expect(await transcribeRecording(audio, "speech.webm", opts, signal)).toEqual({ text: "두 번째에 됨" });
    expect(transcribeMock.mock.calls[1][0]).toBe(audio);
  });

  it("크레딧이 떨어지면 같은 녹음을 Gemini로 받아쓰고 알린다", async () => {
    const onSwitched = vi.fn();
    transcribeMock.mockRejectedValueOnce(new SttError("ElevenLabs 크레딧(잔액)이 다 떨어졌습니다. 충전하세요.", "credit"));
    transcribeMock.mockResolvedValueOnce("제미나이로 받아씀");
    const out = await transcribeRecording(audio, "speech.webm", { ...opts, onSwitched }, new AbortController().signal);
    expect(out).toEqual({
      text: "제미나이로 받아씀",
      notice: "ElevenLabs 크레딧(잔액)이 다 떨어졌습니다. 그래서 Gemini로 받아썼고, 앞으로도 Gemini로 받아씁니다.",
    });
    expect(transcribeMock.mock.calls[1][2]).toMatchObject({ provider: "gemini", apiKey: "g-key" });
    expect(onSwitched).toHaveBeenCalledOnce();
  });

  it("멈췄으면(Esc) 아무것도 돌려주지 않는다", async () => {
    const ctl = new AbortController();
    transcribeMock.mockImplementationOnce(async () => {
      ctl.abort();
      throw new SttError("끊김");
    });
    await expect(transcribeRecording(audio, "speech.webm", opts, ctl.signal)).resolves.toBeNull();
  });
});
