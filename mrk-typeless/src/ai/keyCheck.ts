// 설정 화면의 '키 확인': 토큰을 쓰지 않는 가벼운 요청으로 키가 맞는지만 봅니다.
import { failureMessage, GEMINI_BASE, readFailure } from "./gemini";

export interface KeyCheck {
  ok: boolean;
  message: string;
}

/** Gemini 키: 모델 목록 한 개만 받아 봅니다 (무료, 토큰 소모 없음). */
export async function checkGeminiKey(apiKey: string, signal?: AbortSignal): Promise<KeyCheck> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "키를 먼저 넣어 주세요." };
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}?pageSize=1`, { headers: { "x-goog-api-key": key }, signal });
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") throw e;
    return { ok: false, message: "Google 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요." };
  }
  if (!res.ok) return { ok: false, message: failureMessage(await readFailure(res), "정리") };
  return { ok: true, message: "Gemini 키가 맞습니다. 이제 말하면 Gemini가 정리합니다." };
}

/** Claude 키: 모델 목록 한 개만 받아 봅니다 (토큰 소모 없음). SDK는 아티팩트 빌드에서 빠지므로 늦게 불러옵니다. */
export async function checkClaudeKey(apiKey: string, signal?: AbortSignal): Promise<KeyCheck> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "키를 먼저 넣어 주세요." };
  if (__ARTIFACT__) return { ok: false, message: "claude.ai 안에서는 API 키 대신 내 Claude 계정을 씁니다." };
  const sdk = await import("@anthropic-ai/sdk");
  const client = new sdk.default({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 });
  try {
    await client.models.list({ limit: 1 }, { signal });
    return { ok: true, message: "Claude 키가 맞습니다. 이제 말하면 Claude가 정리합니다." };
  } catch (e) {
    if (e instanceof sdk.APIUserAbortError) throw e;
    if (e instanceof sdk.AuthenticationError) return { ok: false, message: "Claude 키가 맞지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 확인해 주세요." };
    if (e instanceof sdk.PermissionDeniedError) return { ok: false, message: "이 키로는 쓸 수 없습니다. Claude 개발자 플랫폼에서 키 권한과 결제 설정을 확인해 주세요." };
    if (e instanceof sdk.APIConnectionError) return { ok: false, message: "Claude 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요." };
    if (e instanceof sdk.APIError) return { ok: false, message: `Claude 오류 (${e.status ?? "알 수 없음"}): ${e.message}` };
    return { ok: false, message: "키를 확인하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
  }
}
