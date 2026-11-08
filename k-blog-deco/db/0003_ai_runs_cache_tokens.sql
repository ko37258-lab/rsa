-- ai_runs 에 프롬프트 캐시 토큰 열 추가.
-- input_tokens 는 캐시를 거치지 않은 입력만 셉니다 (시스템 프롬프트·도구 스키마는 캐시됨).
-- 전체 입력 토큰 = input_tokens + cache_write_tokens + cache_read_tokens 이며 세 항목의 단가가 다릅니다.
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS cache_write_tokens bigint; -- 캐시에 새로 쓴 입력 (cache_creation_input_tokens)
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS cache_read_tokens bigint;  -- 캐시에서 읽은 입력 (cache_read_input_tokens)
