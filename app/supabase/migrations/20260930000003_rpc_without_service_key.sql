-- 서비스 역할 키 없이 운영하기 위한 쓰기 함수들.
-- 웹 서버는 anon 키 + 로그인 세션(또는 수집 토큰)으로만 DB를 호출하고,
-- 모든 쓰기는 아래 SECURITY DEFINER 함수 안에서 관리자 소속/토큰을 다시 확인한 뒤 수행한다.
-- 테이블 직접 쓰기 권한은 여전히 anon/authenticated 에 없다.

-- 수집 토큰: 원문이 아닌 SHA-256 해시만 저장한다. 행이 없으면 수집 API는 동작하지 않는다.
CREATE TABLE public.blog_ingest_tokens (
  blog_id text PRIMARY KEY CHECK (blog_id = 'ko372'),
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.blog_ingest_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blog_ingest_tokens FROM anon, authenticated;
GRANT ALL ON public.blog_ingest_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.blog_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.report_admins WHERE user_id = (SELECT auth.uid()));
$$;

-- 'admin' 또는 'machine'을 돌려주고, 권한이 없으면 42501 오류.
CREATE OR REPLACE FUNCTION public.blog_authorize(p_token text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_token IS NOT NULL THEN
    IF length(p_token) >= 32 AND EXISTS (
      SELECT 1 FROM public.blog_ingest_tokens
      WHERE blog_id = 'ko372' AND token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    ) THEN
      RETURN 'machine';
    END IF;
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF public.blog_is_admin() THEN
    RETURN 'admin';
  END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

-- 저장 상태(해시·시각). 멱등성/충돌 판단용.
CREATE OR REPLACE FUNCTION public.blog_report_state(p_report_id text, p_token text DEFAULT NULL)
RETURNS TABLE (content_hash text, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.blog_authorize(p_token);
  RETURN QUERY SELECT r.content_hash, r.updated_at FROM public.blog_reports r WHERE r.report_id = p_report_id;
END;
$$;

-- 수집 토큰용 보고서 조회(관리자는 RLS 읽기를 그대로 사용).
CREATE OR REPLACE FUNCTION public.blog_get_report(p_report_id text, p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.blog_authorize(p_token);
  SELECT jsonb_build_object(
    'report_id', report_id, 'report_type', report_type, 'observed_on', observed_on,
    'period_start', period_start, 'period_end', period_end, 'content_hash', content_hash,
    'save_source', save_source, 'created_at', created_at, 'updated_at', updated_at, 'payload', payload)
  INTO v FROM public.blog_reports WHERE report_id = p_report_id;
  RETURN v;
END;
$$;

-- 신규 저장. 키 값은 payload에서 파생하고 테이블 제약이 다시 검증한다. 같은 ID가 있으면 23505.
CREATE OR REPLACE FUNCTION public.blog_insert_report(p_payload jsonb, p_hash text, p_token text DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mode text := public.blog_authorize(p_token);
  v_type text := p_payload ->> 'reportType';
  v_at timestamptz;
BEGIN
  INSERT INTO public.blog_reports (report_id, blog_id, report_type, observed_on, period_start, period_end,
                                   payload, content_hash, saved_by, save_source)
  VALUES (
    p_payload ->> 'reportId', p_payload ->> 'blogId', v_type, (p_payload ->> 'observedOn')::date,
    CASE WHEN v_type = 'weekly' THEN (p_payload #>> '{period,start}')::date END,
    CASE WHEN v_type = 'weekly' THEN (p_payload #>> '{period,end}')::date END,
    p_payload, p_hash,
    CASE WHEN v_mode = 'admin' THEN auth.uid() END,
    CASE WHEN v_mode = 'admin' THEN 'admin_upload' ELSE 'ingest_api' END)
  RETURNING updated_at INTO v_at;
  RETURN v_at;
END;
$$;

-- 교체 저장: 이전 해시가 일치하는 행만 원자적으로 갱신. 일치하지 않으면 NULL(=412).
CREATE OR REPLACE FUNCTION public.blog_update_report(p_payload jsonb, p_hash text, p_expected_hash text, p_token text DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mode text := public.blog_authorize(p_token);
  v_at timestamptz;
BEGIN
  UPDATE public.blog_reports
     SET payload = p_payload,
         content_hash = p_hash,
         observed_on = (p_payload ->> 'observedOn')::date,
         saved_by = CASE WHEN v_mode = 'admin' THEN auth.uid() END,
         save_source = CASE WHEN v_mode = 'admin' THEN 'admin_upload' ELSE 'ingest_api' END
   WHERE report_id = p_payload ->> 'reportId' AND content_hash = p_expected_hash
  RETURNING updated_at INTO v_at;
  RETURN v_at;
END;
$$;

-- 수집 시작/실패 기록(토큰 전용)
CREATE OR REPLACE FUNCTION public.blog_create_run(p_token text, p_start date, p_end date, p_status text, p_error_code text, p_message text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF p_token IS NULL OR public.blog_authorize(p_token) <> 'machine' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('running', 'needs_login', 'failed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.collection_runs (blog_id, expected_period_start, expected_period_end, status, error_code, safe_message, finished_at)
  VALUES ('ko372', p_start, p_end, p_status, p_error_code, p_message, CASE WHEN p_status = 'running' THEN NULL ELSE now() END)
  RETURNING jsonb_build_object('run_id', run_id, 'status', status, 'started_at', started_at) INTO v;
  RETURN v;
END;
$$;

-- 수집 종료 기록(토큰 전용). 성공은 해당 주간 보고서가 실제 저장돼 있을 때만.
CREATE OR REPLACE FUNCTION public.blog_finish_run(p_token text, p_run_id uuid, p_status text, p_report_id text, p_error_code text, p_message text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.collection_runs; v jsonb;
BEGIN
  IF p_token IS NULL OR public.blog_authorize(p_token) <> 'machine' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.collection_runs WHERE run_id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'running' THEN RAISE EXCEPTION 'run finished' USING ERRCODE = 'P0003'; END IF;
  IF p_status NOT IN ('succeeded', 'needs_login', 'failed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'succeeded' THEN
    IF p_report_id IS DISTINCT FROM ('ko372_' || r.expected_period_start || '_' || r.expected_period_end) THEN
      RAISE EXCEPTION 'report mismatch' USING ERRCODE = 'P0004';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.blog_reports WHERE report_id = p_report_id) THEN
      RAISE EXCEPTION 'report not saved' USING ERRCODE = 'P0005';
    END IF;
  END IF;
  UPDATE public.collection_runs
     SET status = p_status,
         report_id = CASE WHEN p_status = 'succeeded' THEN p_report_id END,
         error_code = CASE WHEN p_status = 'succeeded' THEN NULL ELSE p_error_code END,
         safe_message = CASE WHEN p_status = 'succeeded' THEN NULL ELSE p_message END,
         finished_at = now()
   WHERE run_id = p_run_id
  RETURNING jsonb_build_object('run_id', run_id, 'status', status, 'finished_at', finished_at) INTO v;
  RETURN v;
END;
$$;

-- Aside 연결 등록/해제(관리자 전용)
CREATE OR REPLACE FUNCTION public.blog_set_integration(p_connected boolean, p_first_run date, p_note text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.blog_authorize(NULL) <> 'admin' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.integration_settings (blog_id, aside_connected, first_run_on, connected_at, note, updated_by, updated_at)
  VALUES ('ko372', p_connected, CASE WHEN p_connected THEN p_first_run END, CASE WHEN p_connected THEN now() END, p_note, auth.uid(), now())
  ON CONFLICT (blog_id) DO UPDATE SET
    aside_connected = EXCLUDED.aside_connected, first_run_on = EXCLUDED.first_run_on,
    connected_at = EXCLUDED.connected_at, note = EXCLUDED.note,
    updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
END;
$$;

-- 원자료 등록(관리자 전용). 같은 해시는 기존 ID 반환.
CREATE OR REPLACE FUNCTION public.blog_add_source(p_file_name text, p_media_type text, p_sha256 text, p_content_b64 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_bytes bytea := decode(p_content_b64, 'base64'); v_id uuid;
BEGIN
  IF public.blog_authorize(NULL) <> 'admin' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF encode(sha256(v_bytes), 'hex') <> p_sha256 THEN RAISE EXCEPTION 'hash mismatch' USING ERRCODE = '22023'; END IF;
  SELECT source_id INTO v_id FROM public.source_files WHERE sha256 = p_sha256;
  IF FOUND THEN RETURN jsonb_build_object('result', 'unchanged', 'source_id', v_id); END IF;
  INSERT INTO public.source_files (file_name, media_type, byte_size, sha256, content, uploaded_by)
  VALUES (p_file_name, p_media_type, octet_length(v_bytes), p_sha256, v_bytes, auth.uid())
  RETURNING source_id INTO v_id;
  RETURN jsonb_build_object('result', 'created', 'source_id', v_id);
END;
$$;

-- 원자료 내려받기(관리자 전용)
CREATE OR REPLACE FUNCTION public.blog_get_source(p_source_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF public.blog_authorize(NULL) <> 'admin' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object('file_name', file_name, 'media_type', media_type, 'content_b64', encode(content, 'base64'))
    INTO v FROM public.source_files WHERE source_id = p_source_id;
  RETURN v;
END;
$$;

-- 요청 제한은 로그인 전(anon)에도 호출해야 하므로 정의자 권한으로 실행한다.
-- bucket 형식은 테이블 CHECK(해시 식별자)가 제한한다.
ALTER FUNCTION public.consume_rate_limit(text, integer, integer) SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.blog_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blog_authorize(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.blog_report_state(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_get_report(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_insert_report(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_update_report(jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_create_run(text, date, date, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_finish_run(text, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_set_integration(boolean, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blog_add_source(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.blog_get_source(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.blog_is_admin() TO authenticated;
-- 토큰 경로는 로그인 세션 없이(anon) 호출된다. 함수 안에서 토큰/관리자를 확인한다.
GRANT EXECUTE ON FUNCTION public.blog_report_state(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_get_report(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_insert_report(jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_update_report(jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_create_run(text, date, date, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_finish_run(text, uuid, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_set_integration(boolean, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blog_add_source(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blog_get_source(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO anon, authenticated;
