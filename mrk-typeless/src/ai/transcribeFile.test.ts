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

interface FakeOptions {
  elevenStatus?: number;
  elevenBody?: unknown;
  /** 올린 직후 상태 / 기다리는 동안 GET이 돌려줄 상태 */
  uploadState?: string;
  pollState?: string;
  /** generateContent가 차례로 돌려줄 실패 (다 쓰면 성공) */
  generateFailures?: { status: number; body?: unknown }[];
  /** 이 시각부터 시작하는 구간은 400으로 거절 */
  failFrom?: string;
  finishReason?: string;
  /** 이 offset의 조각은 한 번 503으로 실패하고, query에는 이만큼 받았다고 답합니다 */
  chunkFailAt?: number;
  /** query에 이만큼 받았다고 답할 크기 (chunkFailAt 대신) */
  queryReceived?: number;
  /** 파일 상태 확인(GET)이 처음 이만큼 503으로 실패 */
  pollFailures?: number;
  /** countTokens가 돌려줄 토큰 수 (없으면 500) */
  totalTokens?: number;
  /** 올린 영상에 Gemini가 적어 줄 길이 (예: "3600s") */
  videoDuration?: string;
  /** 이 시각부터 시작하는 구간(구간 없이 한 번에면 "전체")에 돌려줄 답 */
  replyFor?: Record<string, unknown>;
}

/** Gemini·ElevenLabs·OpenAI를 흉내 내는 가짜 fetch. 받은 요청을 calls에 남깁니다. */
function fakeServers(opts: FakeOptions = {}) {
  const calls: Call[] = [];
  const failures = [...(opts.generateFailures ?? [])];
  let chunkFailed = false;
  let pollFailures = opts.pollFailures ?? 0;
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
      const command = headers["x-goog-upload-command"];
      if (command === "query")
        return new Response("", {
          status: 200,
          headers: { "x-goog-upload-status": "active", "x-goog-upload-size-received": String(opts.queryReceived ?? opts.chunkFailAt) },
        });
      if (opts.chunkFailAt !== undefined && headers["x-goog-upload-offset"] === String(opts.chunkFailAt) && !chunkFailed) {
        chunkFailed = true;
        return new Response("", { status: 503 });
      }
      return command === "upload, finalize" || command === "finalize"
        ? json(
            {
              file: {
                name: "files/abc",
                uri: "https://g/files/abc",
                mimeType: opts.videoDuration ? "video/mp4" : "audio/m4a",
                state: opts.uploadState ?? "ACTIVE",
                ...(opts.videoDuration ? { videoMetadata: { videoDuration: opts.videoDuration } } : {}),
              },
            },
            200,
            { "x-goog-upload-status": "final" },
          )
        : new Response("", { status: 200, headers: { "x-goog-upload-status": "active" } });
    }
    if (url.endsWith("/v1beta/files/abc") && method === "GET") {
      if (pollFailures-- > 0) return json({ error: { code: 503, message: "busy" } }, 503);
      return json({ name: "files/abc", uri: "https://g/files/abc", state: opts.pollState ?? "ACTIVE" });
    }
    if (url.endsWith("/v1beta/files/abc") && method === "DELETE") return json({});
    if (url.includes(":countTokens"))
      return opts.totalTokens ? json({ totalTokens: opts.totalTokens }) : json({ error: { code: 500, message: "busy" } }, 500);
    if (url.includes(":generateContent")) {
      const fail = failures.shift();
      if (fail) return json(fail.body ?? { error: { code: fail.status, message: "busy" } }, fail.status);
      const prompt = (body as { contents: { parts: { text?: string }[] }[] }).contents[0].parts[0].text ?? "";
      const range = prompt.match(/(\d\d+:\d\d)부터 (?:(\d\d+:\d\d)까지|녹음이 끝날 때까지)/);
      if (range && range[1] === opts.failFrom) return json({ error: { code: 400, message: "bad" } }, 400);
      const reply = opts.replyFor?.[range ? range[1] : "전체"];
      if (reply) return json(reply);
      return json({
        candidates: [
          {
            content: { parts: [{ text: range ? `구간 ${range[1]}~${range[2] ?? "끝"}` : "제미나이가 받아쓴 글" }] },
            finishReason: opts.finishReason ?? "STOP",
          },
        ],
      });
    }
    return json({ error: { message: "unexpected " + url } }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const deleted = (calls: Call[]) => calls.some((c) => c.method === "DELETE" && c.url.endsWith("/files/abc"));
const generateCalls = (calls: Call[]) => calls.filter((c) => c.url.includes(":generateContent"));
const countCalls = (calls: Call[]) => calls.filter((c) => c.url.includes(":countTokens"));

const file = (bytes: number, name = "녹음.m4a", type = "audio/mp4") => new File([new Uint8Array(bytes)], name, { type });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("파일 형식과 구간 나누기", () => {
  it("휴대폰 녹음(m4a)·mp3·영상을 Gemini 형식으로 맞추고, 형식이 비어 있으면 확장자로 봅니다", () => {
    expect(fileMime("a.m4a", "audio/mp4")).toBe("audio/m4a");
    expect(fileMime("a.m4a", "audio/x-m4a")).toBe("audio/m4a");
    expect(fileMime("a.m4a", "")).toBe("audio/m4a");
    expect(fileMime("lecture.mp3", "audio/mpeg")).toBe("audio/mp3");
    expect(fileMime("a.wav", "audio/x-wav")).toBe("audio/wav");
    expect(fileMime("강의.mp4", "video/mp4")).toBe("video/mp4");
    expect(fileMime("a.MOV", "")).toBe("video/mov");
    expect(fileMime("a.mov", "video/quicktime")).toBe("video/mov"); // 아이폰 영상
    expect(fileMime("a.flac", "audio/x-flac")).toBe("audio/flac");
    expect(fileMime("a.aac", "audio/x-aac")).toBe("audio/aac");
    expect(fileMime("a.aac", "audio/vnd.dlna.adts")).toBe("audio/aac"); // Windows Chrome·Edge
    expect(fileMime("a.m4v", "video/x-m4v")).toBe("video/mp4");
    expect(fileMime("a.m4a", "audio/x-something")).toBe("audio/m4a"); // 모르는 이름은 확장자로
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
    // 마지막 구간은 길이를 조금 잘못 읽어도 끝을 놓치지 않게 '끝날 때까지'
    expect(filePrompt("ko-KR", [], [2400, null])).toContain("40:00부터 녹음이 끝날 때까지");
  });
});

describe("Gemini로 녹음 파일 받아쓰기", () => {
  it("14MB 이하 짧은 녹음은 요청에 바로 담아 한 번에 받아씁니다", async () => {
    const calls = fakeServers();
    const out = await transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "AIza-k", lang: "ko-KR", durationSec: 300 });
    expect(out).toEqual({ text: "제미나이가 받아쓴 글", missed: 0 });
    expect(calls).toHaveLength(1);
    const part = (calls[0].body as { contents: { parts: object[] }[] }).contents[0].parts[1] as { inlineData?: { mimeType: string } };
    expect(part.inlineData?.mimeType).toBe("audio/m4a");
    expect(calls[0].headers["x-goog-api-key"]).toBe("AIza-k");
  });

  it("큰 파일은 Files API로 8MB씩 올리고, 준비되면 받아쓴 뒤 파일을 지웁니다", async () => {
    const calls = fakeServers({ uploadState: "PROCESSING" });
    const progress: string[] = [];
    const big = file(17 * 1024 * 1024); // 17MB → 8 + 8 + 1
    const out = await transcribeFileWithGemini(big, {
      provider: "gemini",
      apiKey: "AIza-k",
      lang: "ko-KR",
      durationSec: 600,
      onProgress: (p) => progress.push(`${p.stage}:${p.done}/${p.total}`),
    });
    expect(out.text).toBe("제미나이가 받아쓴 글");
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
    expect(deleted(calls)).toBe(true);
    expect(progress[0]).toBe("upload:0/" + big.size);
    expect(progress).toContain(`upload:${big.size}/${big.size}`);
    expect(progress.at(-1)).toBe("transcribe:1/1");
  }, 10000);

  it("45분 강의는 같은 파일을 20분씩 세 번 받아써서 이어 붙입니다", async () => {
    const calls = fakeServers();
    const out = await transcribeFileWithGemini(file(2000), { provider: "gemini", apiKey: "AIza-k", lang: "ko-KR", durationSec: 45 * 60 });
    expect(out).toEqual({ text: "구간 00:00~20:00\n\n구간 20:00~40:00\n\n구간 40:00~끝", missed: 0 });
    expect(generateCalls(calls)).toHaveLength(3);
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

describe("실패·멈추기에도 녹음을 남기지 않고, 받은 데까지는 살립니다", () => {
  const big = () => file(INLINE_MAX_BYTES + 1024);

  it("Gemini가 파일을 읽지 못하면(FAILED) 올린 파일을 지웁니다", async () => {
    const calls = fakeServers({ uploadState: "PROCESSING", pollState: "FAILED" });
    await expect(
      transcribeFileWithGemini(big(), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 600 }),
    ).rejects.toThrow(/읽지 못했습니다/);
    expect(deleted(calls)).toBe(true);
  }, 10000);

  it("파일 준비를 기다리다 멈추기를 누르면 바로 그만두고 올린 파일을 지웁니다", async () => {
    const calls = fakeServers({ uploadState: "PROCESSING" });
    const ctl = new AbortController();
    const started = Date.now();
    await expect(
      transcribeFileWithGemini(big(), {
        provider: "gemini",
        apiKey: "k",
        lang: "ko-KR",
        signal: ctl.signal,
        onProgress: (p) => p.stage === "prepare" && ctl.abort(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(1000); // 2초 기다림을 끝까지 채우지 않음
    expect(deleted(calls)).toBe(true);
    expect(generateCalls(calls)).toHaveLength(0);
  });

  it("조각을 올리다 끊기면 서버가 받은 데부터 이어 올립니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const calls = fakeServers({ chunkFailAt: 8 * 1024 * 1024 });
    const job = transcribeFileWithGemini(file(17 * 1024 * 1024), { provider: "gemini", apiKey: "k", lang: "ko-KR" });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await job).text).toBe("제미나이가 받아쓴 글");
    const chunks = calls.filter((c) => c.url === "https://upload.example/session-1");
    expect(chunks.map((c) => [c.headers["x-goog-upload-command"], c.headers["x-goog-upload-offset"]])).toEqual([
      ["upload", "0"],
      ["upload", String(8 * 1024 * 1024)], // 503
      ["query", undefined],
      ["upload", String(8 * 1024 * 1024)],
      ["upload, finalize", String(16 * 1024 * 1024)],
    ]);
  });

  it("서버가 다 받았다는데 마무리가 안 됐으면 빈 finalize로 마무리합니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const size = 17 * 1024 * 1024;
    const calls = fakeServers({ chunkFailAt: 16 * 1024 * 1024, queryReceived: size });
    const job = transcribeFileWithGemini(file(size), { provider: "gemini", apiKey: "k", lang: "ko-KR" });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await job).text).toBe("제미나이가 받아쓴 글");
    const chunks = calls.filter((c) => c.url === "https://upload.example/session-1");
    expect(chunks.map((c) => c.headers["x-goog-upload-command"])).toEqual(["upload", "upload", "upload, finalize", "query", "finalize"]);
    expect(chunks.at(-1)!.headers["x-goog-upload-offset"]).toBe(String(size));
    expect(chunks.at(-1)!.body).toBeUndefined();
  });

  it("파일 준비를 확인하다 잠깐 바쁘면 다시 확인하고, 파일을 지우지 않습니다", async () => {
    const calls = fakeServers({ uploadState: "PROCESSING", pollFailures: 1 });
    const out = await transcribeFileWithGemini(big(), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 600 });
    expect(out.text).toBe("제미나이가 받아쓴 글");
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
    expect(generateCalls(calls)).toHaveLength(1);
  }, 15000);

  it("하루 한도(…PerDay…)는 짧게 기다리라고 해도 기다리지 않고, 남은 구간도 멈춥니다", async () => {
    const daily = {
      status: 429,
      body: {
        error: {
          code: 429,
          message: "You exceeded your current quota",
          details: [
            { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
            { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "28s" },
          ],
        },
      },
    };
    const calls = fakeServers();
    // 첫 구간은 받아쓰고, 둘째 구간에서 하루 한도
    let n = 0;
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (String(input).includes(":generateContent") && ++n === 2) {
        calls.push({ url: String(input), method: "POST", headers: {}, body: null });
        return new Response(JSON.stringify(daily.body), { status: 429, headers: { "content-type": "application/json" } });
      }
      return real(input, init);
    });
    const out = await transcribeFileWithGemini(file(2000), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 65 * 60 });
    expect(out.text).toBe("구간 00:00~20:00\n\n[20:00 이후는 받아쓰지 못했습니다]");
    expect(out.missed).toBe(3);
    expect(out.stopped).toMatch(/한도/);
    expect(generateCalls(calls)).toHaveLength(2); // 셋째·넷째 구간은 보내지 않음
  });

  it("서버가 바쁘면(503·429) 잠시 뒤 다시 해서 받아씁니다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const calls = fakeServers({
      generateFailures: [
        { status: 503 },
        { status: 429, body: { error: { code: 429, details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "7s" }] } } },
      ],
    });
    const job = transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "k", lang: "ko-KR" });
    await vi.advanceTimersByTimeAsync(2000); // 첫 번째 다시 하기: 2초
    expect(generateCalls(calls)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(generateCalls(calls)).toHaveLength(2); // 서버가 7초 기다리라고 했으니 아직
    await vi.advanceTimersByTimeAsync(1000);
    expect((await job).text).toBe("제미나이가 받아쓴 글");
    expect(generateCalls(calls)).toHaveLength(3);
  });

  it("하루 한도처럼 오래 기다리라고 하면 기다리지 않고 바로 알립니다", async () => {
    const calls = fakeServers({
      generateFailures: [{ status: 429, body: { error: { code: 429, details: [{ retryDelay: "3600s" }] } } }],
    });
    await expect(transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "k", lang: "ko-KR" })).rejects.toThrow(/한도/);
    expect(generateCalls(calls)).toHaveLength(1);
  });

  it("긴 강의 중 한 구간만 안 되면 그 자리에 표시를 남기고 나머지는 이어 받아씁니다", async () => {
    const calls = fakeServers({ failFrom: "20:00" });
    const out = await transcribeFileWithGemini(file(2000), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 45 * 60 });
    expect(out.text).toBe("구간 00:00~20:00\n\n[20:00~40:00 구간은 받아쓰지 못했습니다]\n\n구간 40:00~끝");
    expect(out.missed).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(deleted(calls)).toBe(true);
  });

  it("첫 구간부터 안 되면(키·한도 문제) 이어 가지 않고 이유를 알립니다", async () => {
    const calls = fakeServers({ failFrom: "00:00" });
    await expect(
      transcribeFileWithGemini(file(2000), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 45 * 60 }),
    ).rejects.toBeInstanceOf(SttError);
    expect(generateCalls(calls)).toHaveLength(1);
  });

  it("출력 한도에 걸려 잘려도 받은 데까지는 쓰고, 잘렸다고 표시합니다", async () => {
    fakeServers({ finishReason: "MAX_TOKENS" });
    const out = await transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "k", lang: "ko-KR" });
    expect(out.text).toBe("제미나이가 받아쓴 글\n[녹음 뒷부분은 너무 길어 받아쓰지 못했습니다]");
    expect(out.missed).toBe(1);
  });

  it("긴 강의 영상은 구간만 잘라 보내고 화면은 낮은 해상도로 봅니다", async () => {
    const calls = fakeServers();
    await transcribeFileWithGemini(file(2000, "강의.mp4", "video/mp4"), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 45 * 60 });
    const gens = generateCalls(calls).map((c) => c.body as { contents: { parts: { text?: string; videoMetadata?: object }[] }[]; generationConfig: { mediaResolution?: string } });
    expect(gens.map((g) => g.contents[0].parts[1].videoMetadata)).toEqual([
      { startOffset: "0s", endOffset: "1200s" },
      { startOffset: "1200s", endOffset: "2400s" },
      { startOffset: "2400s" },
    ]);
    expect(gens.every((g) => g.generationConfig.mediaResolution === "MEDIA_RESOLUTION_LOW")).toBe(true);
    expect(gens[1].contents[0].parts[0].text).toContain("처음부터 끝까지"); // 잘라 보낸 구간 전체
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

  it("OpenAI는 10분이 넘는 녹음을 끝까지 못 받아쓰므로 Gemini로 받아씁니다", async () => {
    const calls = fakeServers();
    const out = await transcribeAudioFile(file(1000), { provider: "openai", apiKey: "sk-o", geminiKey: "AIza", lang: "ko-KR", durationSec: 30 * 60 });
    expect(out.switchedFrom).toBe("openai");
    expect(out.reason).toContain("10분");
    expect(calls.some((c) => c.url.includes("api.openai.com"))).toBe(false);
  });

  it("OpenAI 한도를 넘고 Gemini 키도 없으면 이유를 알려 줍니다", async () => {
    fakeServers();
    await expect(
      transcribeAudioFile(file(26 * 1024 * 1024), { provider: "openai", apiKey: "sk-o", lang: "ko-KR" }),
    ).rejects.toThrow(/25MB/);
  });
});

describe("길이를 모르는 녹음은 올린 뒤 Gemini에 길이를 물어 나눕니다 (PC 프로그램과 같음)", () => {
  it("녹음은 토큰 수 ÷ 25로 길이를 세고, 길면 20분씩 나눠 받아씁니다", async () => {
    const calls = fakeServers({ totalTokens: 90000 }); // 3,600초
    const out = await transcribeFileWithGemini(file(1000, "강의.aiff", "audio/aiff"), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: null });
    expect(calls[0].url).toMatch(/\/upload\/v1beta\/files$/); // 작아도 바로 담지 않고 올립니다
    expect(countCalls(calls)).toHaveLength(1);
    const count = countCalls(calls)[0].body as { contents: { parts: { fileData?: { fileUri: string } }[] }[] };
    expect(count.contents[0].parts[0].fileData?.fileUri).toBe("https://g/files/abc");
    expect(generateCalls(calls)).toHaveLength(3);
    expect(out).toEqual({ text: "구간 00:00~20:00\n\n구간 20:00~40:00\n\n구간 40:00~끝", missed: 0, stopped: undefined });
  });

  it("영상은 Gemini가 적어 준 길이(videoDuration)를 쓰고 토큰은 세지 않습니다", async () => {
    const calls = fakeServers({ videoDuration: "2700s" });
    await transcribeFileWithGemini(file(1000, "강의.avi", "video/avi"), { provider: "gemini", apiKey: "k", lang: "ko-KR" });
    expect(countCalls(calls)).toHaveLength(0);
    expect(generateCalls(calls)).toHaveLength(3);
  });

  it("길이를 끝내 모르면 한 번에 받아씁니다", async () => {
    const calls = fakeServers(); // countTokens 실패
    const out = await transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "k", lang: "ko-KR" });
    expect(out.text).toBe("제미나이가 받아쓴 글");
    expect(countCalls(calls)).toHaveLength(1);
    expect(generateCalls(calls)).toHaveLength(1);
  });

  it("짧은 녹음도 길이를 알면 세지 않고, 4MB가 넘으면 올려서 받아씁니다 (올린 만큼 진행률이 보임)", async () => {
    const calls = fakeServers();
    await transcribeFileWithGemini(file(INLINE_MAX_BYTES + 1024), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 300 });
    expect(calls[0].url).toMatch(/\/upload\/v1beta\/files$/);
    expect(countCalls(calls)).toHaveLength(0);
    expect(INLINE_MAX_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});

describe("Gemini가 빈 답을 돌려주면 받아쓴 것으로 치지 않습니다", () => {
  it("긴 강의 중 한 구간이 이유 없이 비면(OTHER) 표시를 남기고 빠진 구간으로 셉니다", async () => {
    fakeServers({ replyFor: { "20:00": { candidates: [{ finishReason: "OTHER" }] } } });
    const out = await transcribeFileWithGemini(file(2000), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 60 * 60 });
    expect(out.text).toBe("구간 00:00~20:00\n\n[20:00~40:00 구간은 받아쓰지 못했습니다]\n\n구간 40:00~끝");
    expect(out.missed).toBe(1);
  });

  it("짧은 녹음에서 후보가 없으면 '말소리가 없다'가 아니라 다시 하라고 알립니다", async () => {
    fakeServers({ replyFor: { 전체: {} } });
    const job = transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 60 });
    await expect(job).rejects.toMatchObject({ kind: "busy", message: expect.stringContaining("돌려주지 않았습니다") });
  });

  it("말소리가 없어 빈 글로 끝난 답(STOP)은 그대로 받아들입니다", async () => {
    fakeServers({ replyFor: { 전체: { candidates: [{ content: { parts: [] }, finishReason: "STOP" }] } } });
    const out = await transcribeFileWithGemini(file(1000), { provider: "gemini", apiKey: "k", lang: "ko-KR", durationSec: 60 });
    expect(out).toEqual({ text: "", missed: 0 });
  });
});

describe("OpenAI가 받지 않는 파일은 보내지 않고 Gemini로 넘깁니다 (PC 프로그램과 같음)", () => {
  const openaiCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("api.openai.com"));

  it.each(["opus", "aac", "mov", "m4v", "aiff", "aif"])(".%s 파일은 Gemini로 받아씁니다", async (ext) => {
    const calls = fakeServers();
    const out = await transcribeAudioFile(file(1000, `녹음.${ext}`, ""), { provider: "openai", apiKey: "sk-o", geminiKey: "AIza", lang: "ko-KR", durationSec: 60 });
    expect(openaiCalls(calls)).toHaveLength(0);
    expect(out.switchedFrom).toBe("openai");
    expect(out.reason).toContain(`.${ext} 파일을 받지 않습니다`);
    expect(out.switchForGood).toBe(false);
  });

  it("Gemini 키가 없으면 보내 보지 않고 이유를 알려 줍니다", async () => {
    const calls = fakeServers();
    await expect(
      transcribeAudioFile(file(1000, "녹음.opus", "audio/ogg"), { provider: "openai", apiKey: "sk-o", lang: "ko-KR", durationSec: 60 }),
    ).rejects.toThrow(/\.opus 파일을 받지 않습니다/);
    expect(calls).toHaveLength(0);
  });

  it("길이를 모르는 녹음은 Gemini 키가 있으면 Gemini로, 없으면 OpenAI로 보냅니다", async () => {
    let calls = fakeServers();
    const out = await transcribeAudioFile(file(1000), { provider: "openai", apiKey: "sk-o", geminiKey: "AIza", lang: "ko-KR", durationSec: null });
    expect(out.reason).toContain("길이를 알 수 없습니다");
    expect(openaiCalls(calls)).toHaveLength(0);
    calls = fakeServers();
    expect((await transcribeAudioFile(file(1000), { provider: "openai", apiKey: "sk-o", lang: "ko-KR" })).text).toBe("오픈에이아이가 받아쓴 글");
  });

  it("받는 형식이고 길이도 짧으면 OpenAI로 받아씁니다", async () => {
    const calls = fakeServers();
    const out = await transcribeAudioFile(file(1000, "녹음.m4a"), { provider: "openai", apiKey: "sk-o", geminiKey: "AIza", lang: "ko-KR", durationSec: 120 });
    expect(out).toEqual({ text: "오픈에이아이가 받아쓴 글" });
    expect(openaiCalls(calls)).toHaveLength(1);
  });
});
