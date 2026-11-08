import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(), // 'naver' | 'dev'
    providerId: text("provider_id").notNull(),
    name: text("name"),
    nickname: text("nickname"),
    email: text("email"),
    profileImage: text("profile_image"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_provider_uq").on(t.provider, t.providerId)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(), // draft | generating | ready | error
    brief: text("brief").notNull(), // JSON (ProjectBrief)
    currentVersionId: text("current_version_id"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("projects_user_idx").on(t.userId, t.updatedAt)],
);

export const designVersions = sqliteTable(
  "design_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    versionNo: integer("version_no").notNull(),
    design: text("design").notNull(), // JSON (BlogDesign)
    source: text("source").notNull(), // ai-generate | ai-revise | manual | restore | template
    note: text("note"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("versions_project_no_uq").on(t.projectId, t.versionNo)],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    kind: text("kind").notNull(), // photo | reference | export
    label: text("label"),
    filename: text("filename"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    storageKey: text("storage_key").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("assets_project_idx").on(t.projectId), uniqueIndex("assets_key_uq").on(t.storageKey)],
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("api_tokens_hash_uq").on(t.tokenHash)],
);

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    kind: text("kind").notNull(), // generate | revise
    model: text("model").notNull(),
    status: text("status").notNull(), // ok | error | refusal
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("ai_runs_user_idx").on(t.userId, t.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type DesignVersionRow = typeof designVersions.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
