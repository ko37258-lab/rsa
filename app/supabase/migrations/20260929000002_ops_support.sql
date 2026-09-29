-- 운영 보조 테이블: 다중 서버에서도 동작하는 요청 제한, 원자료 파일 보관, Aside 연결 상태.
-- 모든 쓰기는 서버(service_role)에서만 수행한다.

-- 1) 요청 제한(로그인·수집 API). 프로세스 메모리가 아닌 DB 카운터를 사용한다.
--    bucket 값은 서버에서 SHA-256으로 해시한 식별자만 저장한다(IP·이메일 원문 저장 금지).
CREATE TABLE public.rate_limit_hits (
  bucket text NOT NULL CHECK (bucket ~ '^[a-z_]{1,32}:[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1 CHECK (hits > 0),
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limit_hits_window_idx ON public.rate_limit_hits(window_start);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit arguments';
  END IF;
  v_window := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.rate_limit_hits(bucket, window_start, hits)
    VALUES (p_bucket, v_window, 1)
    ON CONFLICT (bucket, window_start)
    DO UPDATE SET hits = public.rate_limit_hits.hits + 1
    RETURNING hits INTO v_hits;
  DELETE FROM public.rate_limit_hits WHERE window_start < clock_timestamp() - interval '2 days';
  RETURN v_hits <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

-- 2) 관리자가 등록한 원자료 파일(XLSX/CSV). public/ 디렉터리나 저장소에 두지 않는다.
CREATE TABLE public.source_files (
  source_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id text NOT NULL DEFAULT 'ko372' CHECK (blog_id = 'ko372'),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200 AND file_name !~ '[/\\[:cntrl:]]'),
  media_type text NOT NULL CHECK (media_type IN (
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
  sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  content bytea NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(content) = byte_size)
);
ALTER TABLE public.source_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.source_files FROM anon, authenticated;
-- 목록 메타데이터만 관리자에게 읽기 허용. 파일 본문은 서버 다운로드 경로로만 제공한다.
GRANT SELECT (source_id, blog_id, file_name, media_type, byte_size, sha256, uploaded_at)
  ON public.source_files TO authenticated;
CREATE POLICY admins_read_source_meta ON public.source_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.report_admins WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.source_files TO service_role;

-- 3) Aside 연결 상태. 행이 없으면 '자동화 미연결'이다. 관리자가 연결을 직접 등록해야만 바뀐다.
CREATE TABLE public.integration_settings (
  blog_id text PRIMARY KEY CHECK (blog_id = 'ko372'),
  aside_connected boolean NOT NULL DEFAULT false,
  first_run_on date,
  connected_at timestamptz,
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT aside_connected OR (first_run_on IS NOT NULL AND connected_at IS NOT NULL))
);
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_settings FROM anon, authenticated;
GRANT SELECT ON public.integration_settings TO authenticated;
CREATE POLICY admins_read_integration ON public.integration_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.report_admins WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.integration_settings TO service_role;
