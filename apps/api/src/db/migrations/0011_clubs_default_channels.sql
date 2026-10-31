INSERT INTO "club_channels" ("id", "club_id", "kind", "name", "slug")
SELECT
  gen_random_uuid(),
  c."id",
  v."kind"::"channel_kind",
  v."name",
  v."slug"
FROM "clubs" c
CROSS JOIN (
  VALUES
    ('ANNOUNCEMENTS'::text, 'Announcements'::text, 'announcements'::text),
    ('GENERAL'::text, 'General'::text, 'general'::text),
    ('EVENTS'::text, 'Events'::text, 'events'::text)
) AS v("kind", "name", "slug")
WHERE NOT EXISTS (
  SELECT 1 FROM "club_channels" ch WHERE ch."club_id" = c."id"
)
ON CONFLICT ("club_id", "slug") DO NOTHING;
