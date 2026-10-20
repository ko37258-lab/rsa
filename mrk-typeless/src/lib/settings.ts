import type { SttProvider } from "../ai/transcribe";
import type { ModeId } from "./modes";

export type EngineChoice = "auto" | "account" | "apikey" | "local";
export type EngineId = "account" | "apikey" | "local";
export type ModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
export type AccountTier = "quick" | "default" | "complex";
/** 음성 인식: 브라우저 음성인식(무료) 또는 녹음 후 받아쓰기 API */
export type SpeechEngine = "auto" | "browser" | "record";

export interface Settings {
  engine: EngineChoice;
  apiKey: string;
  model: ModelId;
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
  switch (settings.engine) {
    case "account":
      return accountAvailable ? "account" : "local";
    case "apikey":
      return hasKey ? "apikey" : "local";
    case "local":
      return "local";
    default:
      if (accountAvailable) return "account";
      if (hasKey) return "apikey";
      return "local";
  }
}
