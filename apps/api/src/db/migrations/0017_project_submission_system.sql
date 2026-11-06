-- Migration 0017: Event-specific configurable project submissions & unified submissions table
ALTER TABLE events ADD COLUMN IF NOT EXISTS project_submission_config JSONB;

CREATE TABLE IF NOT EXISTS project_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
  project_title TEXT,
  project_abstract TEXT,
  demo_url TEXT,
  repo_url TEXT,
  deck_key TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_submissions_event_team_idx
  ON project_submissions (event_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_submissions_event_user_idx
  ON project_submissions (event_id, user_id)
  WHERE team_id IS NULL;

CREATE INDEX IF NOT EXISTS project_submissions_event_id_idx ON project_submissions (event_id);
CREATE INDEX IF NOT EXISTS project_submissions_user_id_idx ON project_submissions (user_id);
CREATE INDEX IF NOT EXISTS project_submissions_team_id_idx ON project_submissions (team_id);

-- Backfill existing team submissions so zero historical data is lost
INSERT INTO project_submissions (event_id, team_id, user_id, project_title, project_abstract, repo_url, demo_url, deck_key, created_at, updated_at)
SELECT t.event_id, t.id, t.leader_id, t.project_title, t.project_abstract, t.repo_url, t.demo_url, t.deck_key, COALESCE(t.submitted_at, NOW()), COALESCE(t.submitted_at, NOW())
FROM teams t
WHERE t.project_title IS NOT NULL
ON CONFLICT DO NOTHING;
