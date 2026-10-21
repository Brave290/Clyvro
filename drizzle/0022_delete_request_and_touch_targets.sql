INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-delete-own-feature-request', 'Delete your own feature request completely',
  'On the Feature requests board, the person who suggested a request can now delete it completely — the request and every upvote on it leave the board — instead of only removing their own upvote. The delete is scoped to the author on the server, asks for confirmation first, and nobody can delete someone else''s request. The same release also grows small links across the public site to comfortable touch size and darkens muted text for readability.',
  'new', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
