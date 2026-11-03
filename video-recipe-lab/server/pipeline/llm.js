// 분석·대본을 어느 AI 로 만들지 고르는 곳. Claude 와 Gemini 는 같은 규칙(prompts.js)을 쓴다.
import { providers } from '../config.js';
import { askClaude } from './claude.js';
import { askGemini } from './gemini.js';
import { ANALYZE_SYSTEM, AnalysisSchema, analyzeUser, SCRIPT_SYSTEM, ScriptSchema, scriptUser } from './prompts.js';

const ask = (opts) => (providers().text === 'gemini' ? askGemini(opts) : askClaude(opts));

export function analyzeBenchmark(args) {
  return ask({ system: ANALYZE_SYSTEM, user: analyzeUser(args), schema: AnalysisSchema, effort: 'medium' });
}

export function writeScript(args) {
  return ask({ system: SCRIPT_SYSTEM, user: scriptUser(args), schema: ScriptSchema, effort: 'high' });
}
