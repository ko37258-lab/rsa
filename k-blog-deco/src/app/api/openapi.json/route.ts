import { connection } from "next/server";
import { env } from "@/lib/env";
import { buildOpenApi } from "@/lib/api/openapi";

/** OpenAPI 3.1 명세 — Postman, Swagger UI, 자동화 도구에서 바로 불러올 수 있습니다. */
export async function GET() {
  await connection();
  return Response.json(buildOpenApi(env.appUrl), { headers: { "Cache-Control": "no-store" } });
}
