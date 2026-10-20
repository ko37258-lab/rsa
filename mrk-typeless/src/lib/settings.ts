import type { SttProvider } from "../ai/transcribe";
import type { ModeId } from "./modes";

export type EngineChoice = "auto" | "account" | "apikey" | "gemini" | "local";
export type EngineId = "account" | "apikey" | "gemini" | "local";
export type ModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
export type GeminiModelId = "gemini-3.8-flash" | "gemini-4-argon" | "gemini-3.5-flash-lite";
export type AccountTier = "quick" | "default" | "complex";
/** 음성 인식: 브라우저 음성인식(무료) 또는 녹음 후 받아쓰기 API */
export type SpeechEngine = "auto" | "browser" | "record";

export interface Settings {
  engine: EngineChoice;
  apiKey: string;
  model: ModelId;
  geminiKey: string;
  geminiModel: GeminiModelId;
  effort: "low" | "medium";
  accountTier: AccountTier;
  speechLang: string;
  speechEngine: SpeechEngine;
  sttProvider: SttProvider;
  sttKey: string;
  targetLanguage: string;
  signature: string;
  styleNote: string;
  autoPolish: boolean;
  autoCopy: boolean;
  mode: ModeId;
}

export const DEFAULT_SETTINGS: Settings = {
  engine: "auto",
  apiKey: "",
  model: "claude-opus-5-5",
  geminiKey: "",
  geminiModel: "gemini-3.8-flash",
  effort: "low",
  accountTier: "quick",
  speechLang: "ko-KR",
  speechEngine: "auto",
  sttProvider: "elevenlabs",
  sttKey: "",
  targetLanguage: "영어",
  signature: "",
  styleNote: "",
  autoPolish: true,
  autoCopy: true,
  mode: "clean",
};

export const MODEL_OPTIONS: { id: ModelId; label: string; note: string }[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "가장 정확함" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "정확도와 속도의 균형" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "가장 빠르고 저렴함" },
];

export const GEMINI_MODEL_OPTIONS: { id: GeminiModelId; label: string; note: string }[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", note: "빠르고 정확함 (권장)" },
  { id: "gemini-4-argon", label: "Gemini 4 Argon", note: "가장 정확함, 느림" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", note: "가장 빠르고 저렴함" },
];

export const TIER_OPTIONS: { id: AccountTier; label: string; note: string }[] = [
  { id: "quick", label: "빠르게", note: "1~2초 안에 정리 (권장)" },
  { id: "default", label: "꼼꼼하게", note: "생각한 뒤 정리, 수 초~수십 초" },
  { id: "complex", label: "가장 꼼꼼하게", note: "긴 글·어려운 글에" },
];

export const SPEECH_LANGS = [
  { id: "ko-KR", label: "한국어" },
  { id: "en-US", label: "영어 (미국)" },
  { id: "ja-JP", label: "일본어" },
  { id: "zh-CN", label: "중국어 (간체)" },
];

export const TARGET_LANGS = ["영어", "일본어", "중국어(간체)", "베트남어", "한국어"];

/** 설정과 사용 가능 여부를 보고 이번에 쓸 엔진을 정합니다. */
export function resolveEngine(settings: Settings, accountAvailable: boolean, apiKeyAllowed: boolean): EngineId {
  const hasKey = apiKeyAllowed && settings.apiKey.trim().length > 0;
  const hasGemini = apiKeyAllowed && settings.geminiKey.trim().length > 0;
  switch (settings.engine) {
    case "account":
      return accountAvailable ? "account" : "local";
    case "apikey":
      return hasKey ? "apikey" : "local";
    case "gemini":
      return hasGemini ? "gemini" : "local";
    case "local":
      return "local";
    default:
      if (accountAvailable) return "account";
      if (hasKey) return "apikey";
      if (hasGemini) return "gemini";
      return "local";
  }
}

/** 녹음 받아쓰기에 쓸 키: Gemini를 고르면 정리용 Gemini 키를 같이 씁니다. */
export function sttKeyFor(settings: Settings): string {
  return settings.sttProvider === "gemini" ? settings.geminiKey : settings.sttKey;
}
