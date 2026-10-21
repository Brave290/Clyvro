INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-flow-screenshots-all-pages', 'Flow Scan: screenshots of every visited page, desktop + mobile',
  'Flow Scan now screenshots every page the browser visits — not just the first pages — on both the desktop (1280×800) and phone (390×844) viewports. The phone pass renders each page individually, so every thumbnail in the report opens a preview with a Desktop / Mobile toggle for that exact page. Any capture that exceeds the size cap is simply absent and labelled as such; only viewports actually captured are shown.',
  'improvement', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
