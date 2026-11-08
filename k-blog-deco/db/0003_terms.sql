-- 약관 동의 기록 (버전·시각). 동의 전 사용자는 서비스 기능을 쓸 수 없습니다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_agreed_at bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version text;
