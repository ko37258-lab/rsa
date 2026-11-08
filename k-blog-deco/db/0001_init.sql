-- K 블로그 꾸미기 초기 스키마 (Postgres / Supabase)
-- 서버는 postgres 역할로 접속하므로 RLS 를 우회합니다. 공개 API(anon 키)로는 아무 행도 보이지 않도록 RLS 만 켜 둡니다.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, provider text NOT NULL, provider_id text NOT NULL,
  name text, nickname text, email text, profile_image text,
  created_at bigint NOT NULL, updated_at bigint NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_uq ON users(provider, provider_id);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY, user_id text NOT NULL, title text NOT NULL, status text NOT NULL,
  brief text NOT NULL, current_version_id text, last_error text,
  created_at bigint NOT NULL, updated_at bigint NOT NULL);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, updated_at);

CREATE TABLE IF NOT EXISTS design_versions (
  id text PRIMARY KEY, project_id text NOT NULL, version_no bigint NOT NULL,
  design text NOT NULL, source text NOT NULL, note text, created_at bigint NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS versions_project_no_uq ON design_versions(project_id, version_no);

CREATE TABLE IF NOT EXISTS assets (
  id text PRIMARY KEY, user_id text NOT NULL, project_id text, kind text NOT NULL,
  label text, filename text, mime text NOT NULL, size bigint NOT NULL,
  width bigint, height bigint, storage_key text NOT NULL, created_at bigint NOT NULL);
CREATE INDEX IF NOT EXISTS assets_project_idx ON assets(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS assets_key_uq ON assets(storage_key);

CREATE TABLE IF NOT EXISTS api_tokens (
  id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, prefix text NOT NULL,
  token_hash text NOT NULL, last_used_at bigint, created_at bigint NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_hash_uq ON api_tokens(token_hash);

CREATE TABLE IF NOT EXISTS ai_runs (
  id text PRIMARY KEY, user_id text NOT NULL, project_id text, kind text NOT NULL,
  model text NOT NULL, status text NOT NULL, input_tokens bigint, output_tokens bigint,
  duration_ms bigint, error text, created_at bigint NOT NULL);
CREATE INDEX IF NOT EXISTS ai_runs_user_idx ON ai_runs(user_id, created_at);
