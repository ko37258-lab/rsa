import { connection } from "next/server";
import { env, aiConfigured, naverLoginConfigured } from "@/lib/env";
import { NAVER_SPEC } from "@/lib/naver/spec";

/** 공개 설정: 로그인 방식·AI 모드 (런타임 환경 변수 기준) */
export async function GET() {
  await connection();
  return Response.json(
    {
      naverLogin: naverLoginConfigured(),
      devLogin: env.allowDevLogin,
      ai: aiConfigured() ? { mode: "claude", model: env.aiModel } : { mode: "template", model: null },
      naverSpec: NAVER_SPEC,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
