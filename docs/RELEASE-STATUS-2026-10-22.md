# Clyvro release status — 2026-10-22

## Completed in this pass

- Payment receipts remain in the durable notification outbox when SMTP is unavailable. They are no longer permanently marked as skipped, so enabling SMTP later allows queued receipts to be delivered.
- Successful payment settlement now attempts a bounded receipt flush immediately instead of waiting for the daily dispatcher. The dispatcher remains the recovery path for transient provider failures and older queued mail.
- Billing shows the latest three payment attempts as a compact preview.
- Added `/app/billing/history` with server-backed pagination (10 rows per page), total/page count, responsive rows, empty state, and previous/next controls.
- Added a regression test for the SMTP-outage/retry behavior.

## Email setup required in Vercel

The code cannot send a real receipt until a production mail transport is configured. In Vercel Production, set one of these supported configurations:

- `SMTP_URL` using `smtp://` or `smtps://`, or
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_SECURE=1`

Also set `EMAIL_FROM` to a sender address authorized by the provider, for example `Clyvro <no-reply@your-verified-domain.com>`. Redeploy after saving the variables.

Then open **Admin → Email delivery** and run the built-in test. It sends only to the signed-in platform administrator and reports safe readiness information. Check spam/junk as well as the inbox. After the test passes, complete one Flutterwave test-mode payment and verify that both the plan and receipt arrive.

Existing pending receipt rows will be picked up by the dispatcher after SMTP is enabled. A payment that was never verified successfully will not receive a receipt.

## UI/history audit outcome

The page-family audit found several broader issues that are not honestly solved by a visual-only sweep:

- Several scan, readiness, project, client, team, schedule, and admin histories are capped without navigation to older records.
- Some lists are unbounded and need server-side pagination before adding only client-side controls.
- Scan forms and reports are copy-dense on small screens.
- Destructive actions are inconsistent: some use the shared confirmation dialog and others act immediately.
- Some polling/history requests lack visible retry/error states.

The next engineering slice should establish a shared `{ items, total/pageCount, hasMore }` pagination contract and reusable responsive history row before applying it to each family. This avoids giving users a “pagination” button that still cannot reach data hidden by an upstream hard cap.

## Verification

The current changes passed:

- TypeScript check
- Focused email, Flutterwave, and production-readiness tests: 18 tests passed
- Production build
- `git diff --check`

The build still reports the existing Next.js advisory warnings for unoptimized `<img>` usage in navigation/auth/sidebar components; these are performance warnings, not build failures.

## Recommended next steps

1. Configure and test SMTP in Vercel Production.
2. Re-run a Flutterwave test-mode checkout and confirm plan activation plus receipt delivery.
3. Add server-backed pagination to scan/readiness/project/client/team/schedule/admin history endpoints.
4. Standardize member removal, invite cancellation, suspension, restore, and plan override through `ConfirmDialog`.
5. Run the 320/375/414/768px responsive QA pass after the data contracts are complete.
