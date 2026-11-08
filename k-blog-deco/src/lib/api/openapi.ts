import { z } from "zod";
import { BlogDesign, BriefSchema } from "@/lib/design/schema";

type Op = {
  summary: string;
  description?: string;
  body?: Record<string, unknown> | "multipart";
  tag: string;
};

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const ENDPOINTS: Record<string, Partial<Record<"get" | "post" | "put" | "patch" | "delete", Op>>> = {
  "/api/v1/me": { get: { tag: "계정", summary: "내 정보" } },
  "/api/v1/projects": {
    get: { tag: "프로젝트", summary: "내 프로젝트 목록" },
    post: { tag: "프로젝트", summary: "프로젝트 생성 (브리프 저장)", body: { type: "object", required: ["brief"], properties: { title: { type: "string" }, brief: ref("Brief") } } },
  },
  "/api/v1/projects/{id}": {
    get: { tag: "프로젝트", summary: "프로젝트 상세 (브리프·현재 디자인·이미지)" },
    patch: { tag: "프로젝트", summary: "제목·브리프 수정", body: { type: "object", properties: { title: { type: "string" }, brief: ref("Brief") } } },
    delete: { tag: "프로젝트", summary: "프로젝트 삭제" },
  },
  "/api/v1/projects/{id}/generate": {
    post: { tag: "AI", summary: "AI 디자인 생성", description: "레퍼런스·사진·요구사항으로 디자인을 만들고 새 버전으로 저장합니다. 최대 수 분 걸릴 수 있습니다.", body: { type: "object", properties: { brief: ref("Brief") } } },
  },
  "/api/v1/projects/{id}/revise": {
    post: {
      tag: "AI",
      summary: "자연어로 디자인 수정",
      body: {
        type: "object",
        required: ["instruction"],
        properties: {
          instruction: { type: "string", example: "버튼을 더 둥글게, 전체 톤을 네이비로" },
          design: ref("BlogDesign"),
          referenceAssetIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  "/api/v1/projects/{id}/design": {
    get: { tag: "디자인", summary: "현재 디자인 JSON" },
    put: { tag: "디자인", summary: "디자인 직접 저장 (새 버전)", body: { type: "object", required: ["design"], properties: { design: ref("BlogDesign"), note: { type: "string" } } } },
  },
  "/api/v1/projects/{id}/versions": { get: { tag: "디자인", summary: "버전 기록" } },
  "/api/v1/projects/{id}/versions/{versionId}": { get: { tag: "디자인", summary: "특정 버전 (디자인 포함)" } },
  "/api/v1/projects/{id}/versions/{versionId}/restore": { post: { tag: "디자인", summary: "이 버전으로 되돌리기" } },
  "/api/v1/projects/{id}/export": {
    get: { tag: "내보내기", summary: "파일 목록·네이버 규격·적용 가이드" },
    post: { tag: "내보내기", summary: "위젯 HTML 코드 생성", body: { type: "object", required: ["widgetAssets"], properties: { widgetAssets: { type: "object", additionalProperties: { type: "string" }, description: "메뉴 버튼 id → 위젯 PNG asset id" } } } },
  },
  "/api/v1/assets": {
    get: { tag: "이미지", summary: "내 이미지 목록 (?projectId=)" },
    post: { tag: "이미지", summary: "이미지 업로드 (multipart: file, kind, projectId, label)", body: "multipart" },
  },
  "/api/v1/assets/{id}": {
    patch: { tag: "이미지", summary: "이미지 라벨 수정", body: { type: "object", properties: { label: { type: "string" } } } },
    delete: { tag: "이미지", summary: "이미지 삭제" },
  },
  "/api/v1/references/inspect": {
    post: { tag: "레퍼런스", summary: "웹사이트/블로그 주소 분석", body: { type: "object", required: ["url"], properties: { url: { type: "string" }, projectId: { type: "string" } } } },
  },
  "/api/v1/tokens": {
    get: { tag: "API 토큰", summary: "토큰 목록" },
    post: { tag: "API 토큰", summary: "토큰 발급 (웹 로그인 세션 필요)", body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } },
  },
  "/api/v1/tokens/{id}": { delete: { tag: "API 토큰", summary: "토큰 삭제" } },
};

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, ops] of Object.entries(ENDPOINTS)) {
    paths[path] = {};
    const params = Array.from(path.matchAll(/\{(\w+)\}/g), (m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    for (const [method, op] of Object.entries(ops)) {
      paths[path][method] = {
        tags: [op.tag],
        summary: op.summary,
        ...(op.description ? { description: op.description } : {}),
        ...(params.length ? { parameters: params } : {}),
        ...(op.body
          ? {
              requestBody: {
                required: true,
                content:
                  op.body === "multipart"
                    ? { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, kind: { type: "string", enum: ["photo", "reference", "export"] }, projectId: { type: "string" }, label: { type: "string" } } } } }
                    : { "application/json": { schema: op.body } },
              },
            }
          : {}),
        responses: {
          "200": { description: "성공" },
          "4XX": { description: "오류", content: { "application/json": { schema: ref("Error") } } },
        },
      };
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "K 블로그 꾸미기 API",
      version: "1.0.0",
      description:
        "웹 화면이 쓰는 것과 같은 API 입니다. 웹에서는 세션 쿠키로, 외부 연동은 개인 API 토큰(Authorization: Bearer kbd_...)으로 인증합니다.",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "설정 > API 토큰에서 발급한 kbd_ 토큰" },
        cookieAuth: { type: "apiKey", in: "cookie", name: "kbd_session" },
      },
      schemas: {
        Brief: z.toJSONSchema(BriefSchema, { io: "input", unrepresentable: "any" }),
        BlogDesign: z.toJSONSchema(BlogDesign, { unrepresentable: "any" }),
        Error: {
          type: "object",
          properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } },
        },
      },
    },
  };
}

export const ENDPOINT_LIST = Object.entries(ENDPOINTS).flatMap(([path, ops]) =>
  Object.entries(ops).map(([method, op]) => ({ method: method.toUpperCase(), path, tag: op!.tag, summary: op!.summary })),
);
