import { afterEach, describe, expect, it, vi } from "vitest";
import { SttError } from "./transcribe";
import {
  clock,
  fileMime,
  filePrompt,
  INLINE_MAX_BYTES,
  planSegments,
  transcribeAudioFile,
  transcribeFileWithGemini,
} from "./transcribeFile";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** Gemini·ElevenLabs·OpenAI를 흉내 내는 가짜 fetch. 받은 요청을 calls에 남깁니다. */
function fakeServers(opts: { elevenStatus?: number; elevenBody?: unknown; uploadState?: string } = {}) {
  const calls: Call[] = [];
  let polled = 0;
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError"); // 진짜 fetch처럼
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const method = init.method ?? "GET";
    let body: unknown = init.body;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    calls.push({ url, method, headers, body });
    const json = (o: unknown, status = 200, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...extra } });

    if (url.includes("api.elevenlabs.io"))
      return json(opts.elevenBody ?? { text: "일레븐랩스가 받아쓴 글" }, opts.elevenStatus ?? 200);
    if (url.includes("api.openai.com")) return json({ text: "오픈에이아이가 받아쓴 글" });
    if (url.endsWith("/upload/v1beta/files"))
      return json({}, 200, { "x-goog-upload-url": "https://upload.example/session-1", "x-goog-upload-status": "active" });
    if (url === "https://upload.example/session-1") {
      const final = headers["x-goog-upload-command"] === "upload, finalize";
      return final
        ? json(
            { file: { name: "files/abc", uri: "https://g/files/abc", mimeType: "audio/m4a", state: opts.uploadState ?? "ACTIVE" } },
            200,
            { "x-goog-upload-status": "final" },
          )
        : new Response("", { status: 200, headers: { "x-goog-upload-status": "active" } });
    }
    if (url.endsWith("/v1beta/files/abc") && method === "GET") {
      polled += 1;
      return json({ name: "files/abc", uri: "https://g/files/abc", state: polled >= 1 ? "ACTIVE" : "PROCESSING" });
    }
    if (url.endsWith("/v1beta/files/abc") && method === "DELETE") return json({});
    if (url.includes(":generateContent")) {
      const prompt = (body as { contents: { parts: { text?: string }[] }[] }).contents[0].parts[0].text ?? "";
      const range = prompt.match(/(\d\d+:\d\d)부터 (\d\d+:\d\d)까지/);
      return json({ candidates: [{ content: { parts: [{ text: range ? `구간 ${range[1]}~${range[2]}` : "제미나이가 받아쓴 글" }] }, finishReason: "STOP" }] });
    }
    return json({ error: { message: "unexpected " + url } }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const file = (bytes: number, name = "녹음.m4a", type = "audio/mp4") => new File([new Uint8Array(bytes)], name, { type });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("파일 형식과 구간 나누기", () => {
  it("휴대폰 녹음(m4a)·mp3·영상을 Gemini 형식으로 맞추고, 형식이 비어 있으면 확장자로 봅니다", () => {
    expect(fileMime("a.m4a", "audio/mp4")).toBe("audio/m4a");
    expect(fileMime("a.m4a", "audio/x-m4a")).toBe("audio/m4a");
    expect(fileMime("a.m4a", "")).toBe("audio/m4a");
    expect(fileMime("lecture.mp3", "audio/mpeg")).toBe("audio/mp3");
    expect(fileMime("a.wav", "audio/x-wav")).toBe("audio/wav");
    expect(fileMime("강의.mp4", "video/mp4")).toBe("video/mp4");
    expect(fileMime("a.MOV", "")).toBe("video/quicktime");
    expect(fileMime("메모.txt", "text/plain")).toBeNull();
    expect(fileMime("x.pdf", "")).toBeNull();
  });

  it("20분이 넘는 녹음만 20분씩 나누고, 2분 미만 꼬리는 앞 구간에 붙입니다", () => {
    expect(planSegments(null)).toEqual([]);
    expect(planSegments(10 * 60)).toEqual([]);
    expect(planSegments(25 * 60)).toEqual([]); // 25분까지는 한 번에
    expect(planSegments(45 * 60)).toEqual([
      [0, 1200],
      [1200, 2400],
      [2400, 2700],
    ]);
    expect(planSegments(41 * 60)).toEqual([
      [0, 1200],
      [1200, 2460],
    ]);
  });

  it("시간 표시는 mm:ss, 한 시간이 넘으면 분이 60을 넘습니다", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(1200)).toBe("20:00");
    expect(clock(4530)).toBe("75:30");
  });

  it("받아쓰기 지시: 용어 힌트, 구간, 말하는 사람이 바뀌면 줄 바꿈", () => {
    const p = filePrompt("ko-KR", ["지구단위계획"], [1200, 2400]);
    expect(p).toContain("20:00부터 40:00까지");
    expect(p).toContain("지구단위계획");
    expect(p).toContain("말하는 사람이 바뀌면");
    expect(p).toContain("한국어");
  });
});

describe("Gemini로 녹음 파일 받아쓰기", () => {
  it("14MB 이하 짧은 녹음은 요청에 바로 담아 한 번에 받아씁니다", async () => {
    const calls = fakeServers();
    const text = await transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "AIza-k", lang: "ko-KR", durationSec: 300 });
    expect(text).toBe("제미나이가 받아쓴 글");
    expect(calls).toHaveLength(1);
    const part = (calls[0].body as { contents: { parts: object[] }[] }).contents[0].parts[1] as { inlineData?: { mimeType: string } };
    expect(part.inlineData?.mimeType).toBe("audio/m4a");
    expect(calls[0].headers["x-goog-api-key"]).toBe("AIza-k");
  });

  it("큰 파일은 Files API로 8MB씩 올리고, 준비되면 받아쓴 뒤 파일을 지웁니다", async () => {
    const calls = fakeServers({ uploadState: "PROCESSING" });
    const progress: string[] = [];
    const big = file(INLINE_MAX_BYTES + 3 * 1024 * 1024); // 17MB → 8 + 8 + 1
    const text = await transcribeFileWithGemini(big, {
      provider: "gemini",
      apiKey: "AIza-k",
      lang: "ko-KR",
      durationSec: 600,
      onProgress: (p) => progress.push(`${p.stage}:${p.done}/${p.total}`),
    });
    expect(text).toBe("제미나이가 받아쓴 글");
    const start = calls[0];
    expect(start.url).toMatch(/\/upload\/v1beta\/files$/);
    expect(start.headers["x-goog-upload-protocol"]).toBe("resumable");
    expect(start.headers["x-goog-upload-command"]).toBe("start");
    expect(start.headers["x-goog-upload-header-content-length"]).toBe(String(big.size));
    expect(start.headers["x-goog-upload-header-content-type"]).toBe("audio/m4a");
    const chunks = calls.filter((c) => c.url === "https://upload.example/session-1");
    expect(chunks.map((c) => [c.headers["x-goog-upload-command"], c.headers["x-goog-upload-offset"]])).toEqual([
      ["upload", "0"],
      ["upload", String(8 * 1024 * 1024)],
      ["upload, finalize", String(16 * 1024 * 1024)],
    ]);
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/files/abc"))).toBe(true); // PROCESSING → ACTIVE 기다림
    const gen = calls.find((c) => c.url.includes(":generateContent"))!;
    const part = (gen.body as { contents: { parts: object[] }[] }).contents[0].parts[1] as { fileData?: { fileUri: string } };
    expect(part.fileData?.fileUri).toBe("https://g/files/abc");
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/files/abc"))).toBe(true);
    expect(progress[0]).toBe("upload:0/" + big.size);
    expect(progress).toContain(`upload:${big.size}/${big.size}`);
    expect(progress.at(-1)).toBe("transcribe:1/1");
  }, 10000);

  it("45분 강의는 같은 파일을 20분씩 세 번 받아써서 이어 붙입니다", async () => {
    const calls = fakeServers();
    const text = await transcribeFileWithGemini(file(2000), { provider: "gemini", apiKey: "AIza-k", lang: "ko-KR", durationSec: 45 * 60 });
    expect(text).toBe("구간 00:00~20:00\n\n구간 20:00~40:00\n\n구간 40:00~45:00");
    expect(calls.filter((c) => c.url.includes(":generateContent"))).toHaveLength(3);
    expect(calls[0].url).toMatch(/\/upload\/v1beta\/files$/); // 짧은 파일이어도 여러 번 쓰므로 한 번만 올립니다
  });

  it("녹음·영상이 아닌 파일은 보내지 않습니다", async () => {
    const calls = fakeServers();
    await expect(
      transcribeFileWithGemini(file(10, "메모.txt", "text/plain"), { provider: "gemini", apiKey: "k", lang: "ko-KR" }),
    ).rejects.toBeInstanceOf(SttError);
    expect(calls).toHaveLength(0);
  });

  it("멈추기를 누르면 그 자리에서 그만둡니다", async () => {
    fakeServers();
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "k", lang: "ko-KR", signal: ctl.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("고른 받아쓰기 서비스와 Gemini로 넘기기", () => {
  it("ElevenLabs가 되면 ElevenLabs로 받아씁니다", async () => {
    const calls = fakeServers();
    const out = await transcribeAudioFile(file(1000), { provider: "elevenlabs", apiKey: "sk_e", geminiKey: "AIza", lang: "ko-KR" });
    expect(out).toEqual({ text: "일레븐랩스가 받아쓴 글" });
    expect(calls).toHaveLength(1);
  });

  it("ElevenLabs 크레딧이 떨어지면 같은 파일을 Gemini로 받아쓰고, 앞으로도 Gemini를 쓰라고 알립니다", async () => {
    fakeServers({ elevenStatus: 401, elevenBody: { detail: { status: "quota_exceeded", message: "0 credits" } } });
    const out = await transcribeAudioFile(file(1000), { provider: "elevenlabs", apiKey: "sk_e", geminiKey: "AIza", lang: "ko-KR" });
    expect(out.text).toBe("제미나이가 받아쓴 글");
    expect(out.switchedFrom).toBe("elevenlabs");
    expect(out.switchForGood).toBe(true);
    expect(out.reason).toContain("크레딧");
  });

  it("OpenAI 25MB 한도를 넘는 파일은 Gemini로 받아쓰되, 설정은 바꾸지 않습니다", async () => {
    fakeServers();
    const out = await transcribeAudioFile(file(26 * 1024 * 1024), { provider: "openai", apiKey: "sk-o", geminiKey: "AIza", lang: "ko-KR" });
    expect(out.switchedFrom).toBe("openai");
    expect(out.switchForGood).toBe(false);
  }, 10000);

  it("OpenAI 한도를 넘고 Gemini 키도 없으면 이유를 알려 줍니다", async () => {
    fakeServers();
    await expect(
      transcribeAudioFile(file(26 * 1024 * 1024), { provider: "openai", apiKey: "sk-o", lang: "ko-KR" }),
    ).rejects.toThrow(/25MB/);
  });
});
