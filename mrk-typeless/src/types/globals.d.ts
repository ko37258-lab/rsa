// 빌드 시 vite.config.ts의 define으로 채워집니다.
declare const __ARTIFACT__: boolean;

// claude.ai 아티팩트 런타임이 주는 `sample` 기능 (내 Claude 계정으로 질문)
// 전체 정의는 플랫폼이 제공하며, 여기에는 이 앱이 쓰는 부분만 적습니다.
interface ClaudeSampleError {
  code: string;
  message: string;
  text?: string;
}

interface ClaudeSampleOptions {
  onText?: (update: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  modelTier?: "quick" | "default" | "complex";
  cache?: boolean;
}

interface ClaudeSampleFn {
  (input: string, options?: ClaudeSampleOptions): Promise<{ text: string; truncated: boolean }>;
}

interface Window {
  claude?: {
    use(name: "sample"): Promise<ClaudeSampleFn | null>;
  };
}

// Web Speech API: TypeScript DOM 정의에 생성자가 빠져 있어 필요한 만큼만 선언합니다.
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}
