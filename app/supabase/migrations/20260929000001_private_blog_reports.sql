-- MR.K private reporting site: 시작 SQL(001_private_blog_reports.sql) 검토 반영본.
--
-- 원본 대비 변경점(검토 결과):
--  * BEGIN/COMMIT 제거: Supabase CLI가 마이그레이션 파일 단위로 트랜잭션을 관리한다.
--  * Supabase는 public 스키마의 새 테이블·시퀀스·함수에 anon/authenticated 기본 권한을
--    부여한다. 테이블뿐 아니라 시퀀스·함수의 기본 권한도 명시적으로 회수한다.
--  * 저장 주체(saved_by)·저장 경로(save_source)를 기록해 리비전에 함께 남긴다.
--  * updated_at을 실제 payload 변경 시각으로 갱신하는 BEFORE UPDATE 트리거 추가.
--  * report_revisions를 추가 전용(append-only)으로 강제한다(UPDATE/DELETE/TRUNCATE 차단).
--  * collection_runs 오류 코드·안전 메시지 길이/형식 제한, 조회 인덱스 추가.
-- 서비스 역할 키는 절대 브라우저로 보내지 않는다.

CREATE TABLE public.report_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.report_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_admins FROM anon, authenticated;
GRANT SELECT ON public.report_admins TO authenticated;
CREATE POLICY admin_can_read_own_membership ON public.report_admins
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- 관리자 등록은 DB 소유자/서비스 역할만 가능하다. 자가 등록 경로는 없다.

CREATE TABLE public.blog_reports (
  report_id text PRIMARY KEY,
  blog_id text NOT NULL CHECK (blog_id = 'ko372'),
  report_type text NOT NULL CHECK (report_type IN ('weekly', 'baseline')),
  observed_on date NOT NULL,
  period_start date,
  period_end date,
  payload jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  save_source text NOT NULL DEFAULT 'admin_upload'
    CHECK (save_source IN ('admin_upload', 'ingest_api')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (report_type = 'weekly' AND period_start IS NOT NULL AND period_end IS NOT NULL
      AND period_end - period_start = 6
      AND report_id = blog_id || '_' || period_start::text || '_' || period_end::text)
    OR
    (report_type = 'baseline' AND period_start IS NULL AND period_end IS NULL
      AND report_id = blog_id || '_baseline_' || observed_on::text)
  ),
  CHECK (jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['schemaVersion','reportId','reportType','blogId','observedOn']
    AND payload ->> 'schemaVersion' = '1.0.0'
    AND payload ->> 'reportId' = report_id
    AND payload ->> 'reportType' = report_type
    AND payload ->> 'blogId' = blog_id
    AND payload ->> 'observedOn' = observed_on::text)
);
CREATE INDEX blog_reports_history_idx ON public.blog_reports(blog_id, report_type, period_end DESC);
CREATE UNIQUE INDEX unique_blog_week ON public.blog_reports(blog_id, period_start, period_end)
  WHERE report_type = 'weekly';

CREATE TABLE public.report_revisions (
  revision_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id text NOT NULL REFERENCES public.blog_reports(report_id) ON DELETE RESTRICT,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  saved_by uuid,
  save_source text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_revisions_report_idx ON public.report_revisions(report_id, saved_at DESC);

CREATE TABLE public.collection_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id text NOT NULL CHECK (blog_id = 'ko372'),
  expected_period_start date NOT NULL,
  expected_period_end date NOT NULL,
  status text NOT NULL CHECK (status IN ('running','succeeded','needs_login','failed')),
  report_id text REFERENCES public.blog_reports(report_id) ON DELETE RESTRICT,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  safe_message text CHECK (safe_message IS NULL OR char_length(safe_message) <= 300),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (expected_period_end - expected_period_start = 6),
  CHECK (status <> 'succeeded' OR report_id IS NOT NULL),
  CHECK (status = 'running' OR finished_at IS NOT NULL)
);
CREATE INDEX collection_runs_recent_idx ON public.collection_runs(blog_id, started_at DESC);
-- safe_message는 서버에서 길이·내용을 정제해 저장한다. 쿠키, Authorization 헤더,
-- 원시 페이지 HTML, 민감한 쿼리 문자열은 저장하지 않는다.

-- 리비전 스냅샷: 신규 저장과 payload 변경 시 새 리비전을 남긴다(이전 리비전은 그대로 유지).
CREATE OR REPLACE FUNCTION public.snapshot_report_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.payload IS DISTINCT FROM OLD.payload THEN
    INSERT INTO public.report_revisions(report_id, content_hash, payload, saved_by, save_source)
      VALUES (NEW.report_id, NEW.content_hash, NEW.payload, NEW.saved_by, NEW.save_source);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_report_revision AFTER INSERT OR UPDATE ON public.blog_reports
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_report_revision();

-- 실제 저장 시각: payload가 바뀐 경우에만 updated_at 갱신, created_at은 변경 불가.
CREATE OR REPLACE FUNCTION public.touch_blog_report()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER touch_blog_report BEFORE UPDATE ON public.blog_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_blog_report();

-- 감사 이력은 추가만 가능하다.
CREATE OR REPLACE FUNCTION public.reject_revision_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'report_revisions is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER report_revisions_append_only BEFORE UPDATE OR DELETE ON public.report_revisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_revision_mutation();
CREATE TRIGGER report_revisions_no_truncate BEFORE TRUNCATE ON public.report_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_revision_mutation();

ALTER TABLE public.blog_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blog_reports, public.report_revisions, public.collection_runs FROM anon, authenticated;
GRANT SELECT ON public.blog_reports, public.report_revisions, public.collection_runs TO authenticated;
CREATE POLICY admins_read_reports ON public.blog_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.report_admins WHERE user_id = (SELECT auth.uid())));
CREATE POLICY admins_read_revisions ON public.report_revisions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.report_admins WHERE user_id = (SELECT auth.uid())));
CREATE POLICY admins_read_runs ON public.collection_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.report_admins WHERE user_id = (SELECT auth.uid())));

REVOKE ALL ON SEQUENCE public.report_revisions_revision_id_seq FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_report_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_blog_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_revision_mutation() FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.report_admins, public.blog_reports, public.report_revisions, public.collection_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.report_revisions_revision_id_seq TO service_role;

-- 인증 사용자를 Supabase Auth에 만든 뒤, SQL Editor에서 실제 UUID를 직접 등록한다.
-- 예시 형태일 뿐 실행 가능한 자격 증명이 아니다:
-- INSERT INTO public.report_admins(user_id) VALUES ('<actual-auth-user-uuid>');
