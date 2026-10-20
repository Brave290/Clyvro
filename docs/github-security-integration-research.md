# GitHub security assistant implementation notes

Research checked 2026-10-20 against official GitHub and Model Context Protocol documentation.

## Verified implementation constraints

A GitHub App installation token is the right credential for scoped repository access. GitHub returns its permissions, repository access and expiry; the token expires after one hour. The app can request a narrower permission set and a subset of the installation's repositories, but cannot expand beyond what the installation granted. The documented endpoint can return up to 500 repositories. Keep the token short-lived and server-side only. [1]

GitHub webhooks must be authenticated before parsing or acting on their event. Verify `X-Hub-Signature-256` against the exact UTF-8 request body using HMAC-SHA256, require the `sha256=` prefix, and compare signatures in constant time. Reject missing/malformed signatures and unknown event types. [2]

A structured Check Run for a commit can be created only by a GitHub App with the repository `Checks: write` permission. OAuth apps and ordinary authenticated users cannot create Check Runs. Check Runs detect pushes only in the repository where they were created; forked-repository pushes are not covered automatically. Therefore Clyvro must clearly identify unsupported fork cases and must not claim that findings block a merge unless the customer also requires the Clyvro Check Run in branch protection. [3]

The official TypeScript SDK repository identifies SDK v2 as the stable line implementing the 2026-07-28 MCP spec. The v2 server package is `@modelcontextprotocol/server`, with schemas from `zod/v4`. `createMcpHandler` builds a fresh server per HTTP request and is stateless by default, suitable for serverless deployment. [4] [5]

The SDK handler does not authenticate tokens or validate Host/Origin. The application must validate the bearer token before calling `handler.fetch(request, { authInfo })`. The official authorization guidance expects a verified `AuthInfo` with a populated expiry and, when audience checking is used, a matching resource. The SDK's MCP HTTP authentication helpers validate a token but do not issue one; issuing a token requires an authorization server or a separately designed Clyvro token-issuance flow. Host/Origin checks are also an application responsibility. [6]

## Product implications

- Use a GitHub App, not an OAuth App, for pre-production Check Runs.
- Keep each installed GitHub account/repository association bound to the owning Clyvro organization; restrict access to explicit installed repositories.
- Do not accept webhook payloads until the signature has been checked against the raw body.
- Use idempotency keyed by GitHub delivery ID and check head SHA so webhook retries or refreshes do not duplicate scans, notifications, or writes.
- Treat Check Runs as advisory until the customer requires them in branch protection. Preserve fork limitations in the UX.
- Keep MCP authorization explicit: use a per-user/per-organization Clyvro token or standards-based OAuth resource-server flow; never make the endpoint anonymous or use a shared global secret.
- Require user approval before any remediation workflow writes to a connected repository.

## References

[1]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app "Generating an installation access token for a GitHub App"
[2]: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries "Validating webhook deliveries"
[3]: https://docs.github.com/en/rest/checks/runs?apiVersion=2026-03-10 "REST API endpoints for check runs"
[4]: https://github.com/modelcontextprotocol/typescript-sdk "Official Model Context Protocol TypeScript SDK"
[5]: https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html "Serve over HTTP with the MCP TypeScript SDK"
[6]: https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html "Require authorization for a hosted MCP server"


## OSV dependency-query contract

OSV's `POST /v1/querybatch` accepts an array of queries, each using either a package version or a versioned PURL (not both). It guarantees that response items keep the same order as the input, but returns vulnerability IDs and modified timestamps rather than full vulnerability records. Clyvro should therefore fetch full records only for matched IDs and keep package inventory limits to bound response size. [7] The API overview currently documents no request-rate limit and warns that HTTP/1.1 responses have a 32 MiB size limit; Clyvro should still enforce per-scan package and time budgets. [8]

[7]: https://google.github.io/osv.dev/post-v1-querybatch/ "POST v1 querybatch"
[8]: https://google.github.io/osv.dev/api/ "OSV API"


## OSV dependency-query contract

OSV `POST /v1/querybatch` accepts an array of package/version or commit queries. For packages, send a package name and ecosystem with a version, or a versioned PURL—not both. Response items stay aligned with request order and return vulnerability IDs plus modification timestamps; fetch full records only for matched IDs. [7] The OSV API overview documents no current request-rate limit and a 32 MiB response limit over HTTP/1.1, but Clyvro should still cap packages and time per scan. [8]

[7]: https://google.github.io/osv.dev/post-v1-querybatch/ "POST v1 querybatch"
[8]: https://google.github.io/osv.dev/api/ "OSV API"
