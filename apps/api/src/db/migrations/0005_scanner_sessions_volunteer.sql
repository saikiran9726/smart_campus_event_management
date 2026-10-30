ALTER TABLE "scanner_sessions" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "scanner_sessions" ADD COLUMN IF NOT EXISTS "volunteer_name" text;
