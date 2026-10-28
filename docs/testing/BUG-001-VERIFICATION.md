# BUG-001 fix and retest — 28 October 2026

Outcome: **Fixed and locally retested; BUG-001 Closed.** This closes the stale-tab write defect, not the full Module 1 or release acceptance.

Subsequent [backend regression repairs](BACKEND-REGRESSION-FIXES.md) resolved the integration failures recorded below. The latest full dedicated suite has 87 passing records, 0 failures/skips. The original BUG-001 run results below remain historical evidence.

## Acceptance and implementation

Required: switching tab B must not retarget a form, read, upload or retry in tab A. Refresh must retain the displayed company; ordinary switching and verified creation must work. Current access remains enforced by the server.

Replaced shared localStorage selection with tab-specific sessionStorage consistently across the request interceptor, dashboard selection/logout/recovery, register loader, invitation acceptance, durable command intents and upload checks. Existing opaque retry keys retain their company. No server, schema, capability or endpoint changes; OpenAPI unchanged. Theme preferences remain shared.

Old shared selections are deliberately ignored. Reload existing application tabs after updating and reselect their companies. Fresh tabs require an explicit selection. Browser-duplicated tabs may initially copy sessionStorage but subsequent switches are independent. Refresh preserves each tab's selection. Cookies still authenticate the browser session; this change does not create separate user identities.

## Actual automated checks

| Check | Result |
| --- | --- |
| `npm test --workspace=client` | 7 passing records: six focused scenarios plus parent; 0 failed/skipped |
| `npm run build` | Passed |
| `npm test` | 15 passed, 0 failed, 9 integration tests skipped; no TEST_DATABASE_URL supplied to this command |
| `npm run test:integration` with dedicated TEST_DATABASE_URL | 69 passed, 3 failed records, 0 skipped |

Client tests exercise actual Axios interceptors and command/upload helpers with a recording adapter: independent tab context, ignored legacy shared selection, identity omission/explicit headers, lost-response command retry, staged/link upload routing and clearing only the requesting tab on 401. These are unit checks, not live-provider uploads.

Full database/HTTP integration has two failure causes: the configuration scope fixture's legacy physical product insertion is rejected by the inventory workflow guard; the PostgreSQL migration workflow reports ambiguous column `company`. The failed configuration child and parent are counted separately, yielding three failed records. This change modifies no server/migration files, and these paths do not execute frontend storage code. They remain unresolved; the integration suite is not passing. Local output: `.tmp/e2e/bug-001-unit.txt` and `.tmp/e2e/bug-001-integration.txt`.

## Live browser and database retest

Used the separate local API on 5101, localhost:5175 frontend and assetos_e2e_test database/schema m01_round2. The existing dirty working tree was preserved. The verified synthetic Beta owner created disposable Bug 001 Delta through the browser, repeating the original Alpha/Gamma reproduction with fresh Beta/Delta fixtures.

1. Paused the new-workspace XHR at HTTP 201, failed only the response, observed retry guidance, then retried identical details. Entered Delta; SQL confirmed one company. Cleared interception afterward.
2. A fresh tab showed no selected company despite the old shared selection; explicit selection worked.
3. Prepared FIX-BETA-001 in tab A showing Beta. Selected Delta in tab B, then saved A: header stayed Beta and SQL recorded the department only in Beta.
4. Prepared FIX-DELTA-001 in tab B. Switched A to Delta and back to Beta, then saved B: header stayed Delta and SQL recorded the department only in Delta.
5. Refreshed Delta and reopened Beta access settings. Each showed its own fixture; Delta did not show Beta's department.
6. Reviewed desktop at 1280 and mobile at 320x800/390x844. Mobile Beta retained selection after refresh while desktop stayed Delta. Screenshots inspected; temporary viewport overrides cleared.

Safe ignored local evidence:

- [SQL results and single recovered workspace](../../.tmp/e2e/bug-001-fixed-database.txt)
- [Desktop Beta context](../../.tmp/e2e/bug-001-fixed-beta.png)
- [320px selector](../../.tmp/e2e/bug-001-mobile-320.png)
- [390px selector after refresh](../../.tmp/e2e/bug-001-mobile-390.png)

The original misplaced test departments remain as historical fixtures. No production/application database or external service access changed. No live mail/storage or deployment verification is claimed. Invitation selection was updated consistently and its backend tests pass, but no new invitation browser journey was run for this fix.

## Module status

ONB-018 now passes the two-tab write/read/refresh retest. Latest M01 disposition: **19 Pass, 3 Partial, 0 Fail**. ONB-016/021/022 retain their unexecuted browser variants, so Module 1 acceptance stays open. The separate backend integration failures also prevent a full-suite green claim.
