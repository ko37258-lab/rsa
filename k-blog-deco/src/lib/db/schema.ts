import { pgTable, text, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";

// 시각 값은 모두 밀리초 epoch (bigint, JS number 로 다룸)
const ms = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(), // 'naver' | 'dev'
    providerId: text("provider_id").notNull(),
    name: text("name"),
    nickname: text("nickname"),
    email: text("email"),
    profileImage: text("profile_image"),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_provider_uq").on(t.provider, t.providerId)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(), // draft | generating | ready | error
    brief: text("brief").notNull(), // JSON (ProjectBrief)
    currentVersionId: text("current_version_id"),
    lastError: text("last_error"),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
  },
  (t) => [index("projects_user_idx").on(t.userId, t.updatedAt)],
);

export const designVersions = pgTable(
  "design_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    versionNo: bigint("version_no", { mode: "number" }).notNull(),
    design: text("design").notNull(), // JSON (BlogDesign)
    source: text("source").notNull(), // ai-generate | ai-revise | manual | restore | template
    note: text("note"),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [uniqueIndex("versions_project_no_uq").on(t.projectId, t.versionNo)],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    kind: text("kind").notNull(), // photo | reference | export
    label: text("label"),
    filename: text("filename"),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    width: bigint("width", { mode: "number" }),
    height: bigint("height", { mode: "number" }),
    storageKey: text("storage_key").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("assets_project_idx").on(t.projectId), uniqueIndex("assets_key_uq").on(t.storageKey)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: ms("last_used_at"),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [uniqueIndex("api_tokens_hash_uq").on(t.tokenHash)],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    kind: text("kind").notNull(), // generate | revise
    model: text("model").notNull(),
    status: text("status").notNull(), // ok | error
    // 입력 토큰은 단가가 다른 세 항목으로 나눠 기록합니다 (서로 겹치지 않음, 합 = 전체 입력). 재시도가 있으면 모든 시도의 합.
    inputTokens: bigint("input_tokens", { mode: "number" }), // 캐시를 거치지 않은 입력 (정가)
    cacheWriteTokens: bigint("cache_write_tokens", { mode: "number" }), // 프롬프트 캐시에 새로 쓴 입력 (cache_creation_input_tokens)
    cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }), // 프롬프트 캐시에서 읽은 입력 (cache_read_input_tokens)
    outputTokens: bigint("output_tokens", { mode: "number" }),
    durationMs: bigint("duration_ms", { mode: "number" }),
    error: text("error"),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("ai_runs_user_idx").on(t.userId, t.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type DesignVersionRow = typeof designVersions.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
