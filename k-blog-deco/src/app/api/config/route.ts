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
      // 운영 설정 점검용 (값은 노출하지 않고 설정 여부만)
      setup: {
        database: Boolean(env.databaseUrl) || !process.env.VERCEL,
        storage: Boolean(env.supabaseUrl && env.supabaseServiceKey) || !process.env.VERCEL,
        naverLogin: naverLoginConfigured(),
        ai: aiConfigured(),
        appUrl: env.appUrl,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
