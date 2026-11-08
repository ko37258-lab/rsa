import type { NextRequest } from "next/server";
import { readFile, isValidKey } from "@/lib/storage";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/**
 * 업로드 이미지 공개 주소. 네이버 위젯 코드가 이 주소로 이미지를 불러옵니다.
 * 키는 추측 불가능한 랜덤 값이며 내용은 바뀌지 않으므로 오래 캐시합니다.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/files/[key]">) {
  const { key } = await ctx.params;
  if (!isValidKey(key)) return new Response("Not found", { status: 404 });
  const bytes = await readFile(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": TYPES[key.split(".").pop()!] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
