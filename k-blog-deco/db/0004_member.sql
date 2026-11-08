-- 회원 코드 확인 기록 (MEMBER_ACCESS_CODE 가 설정된 경우에만 사용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_verified_at bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_code_fails bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_code_last_fail_at bigint;
