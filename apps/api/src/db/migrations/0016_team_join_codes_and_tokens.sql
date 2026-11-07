-- Migration 0016: Expand team invite code length, add code status, expiry and invitation tokens
ALTER TABLE teams ALTER COLUMN invite_code TYPE VARCHAR(32);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS code_status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS teams_invite_token_idx ON teams (invite_token);
