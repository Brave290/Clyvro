INSERT INTO "changelog_entries" ("id", "title", "body", "tag", "status", "published_at", "updated_by") VALUES (
  'clx-google-signin-firebase', 'Google sign-in now runs on Firebase',
  'Continue with Google now signs you in through Firebase Authentication instead of Neon Auth: the Google popup opens, the sign-in token is verified on our servers against Google''s keys for our Firebase project, and your account is matched by your verified email exactly as before — same workspace, same data, same session. Email + password sign-in is unchanged, Neon remains our database host, and until the Firebase project details are switched on the button says so plainly rather than pretending.',
  'improvement', 'published', now(), 'system'
) ON CONFLICT ("id") DO NOTHING;
