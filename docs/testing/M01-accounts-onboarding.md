# M01 Accounts and onboarding

PRD baseline: sections 3, 4 and 13, A01; recovery/session checks also follow the implemented identity contract. Invitations and deactivation are tested in M02. UX draft guidance is supplementary and does not independently add PRD scope.

## Fixtures and journeys

Use synthetic Company Alpha and Company Beta with distinct verified owners, a fresh unverified account and an account with no memberships. Choose unique example.test addresses per run. Capture email in the isolated local database with the configured worker; do not bypass verification by editing user flags for the primary browser journey.

- J01 New owner: register → retrieve captured verification message → open link → verify → create Alpha → see owner context → refresh → logout/login → re-enter Alpha.
- J02 Returning owner: login → choose Alpha → open permitted company page → logout → try old protected URL.
- J03 Recovery: request recovery → open captured link → reset password → login with new password → reject old password/session.
- J04 Isolation: independently create Beta → Alpha owner attempts Beta identifiers/direct URLs → denied → confirm both companies remain unchanged.

## Cases

Every row starts Not run. Record actual results and evidence in the run record, including the case ID; do not infer a browser pass from an automated API test.

| ID | Actor/setup | Steps | Expected result | Basis |
| --- | --- | --- | --- | --- |
| ONB-001 | Fresh user | Register valid name/email/password; inspect resulting account/context | Account created; no existing-company membership or permissions; verification pending | PRD 3–4; contract |
| ONB-002 | Fresh user | Submit missing fields, malformed email, invalid password; correct fields | Useful validation; no unintended account; recoverable inputs retained | PRD 13; contract field rules |
| ONB-003 | Registered email | Register same email again with case/whitespace variations | Normalization/uniqueness enforced; no second account or access escalation | Identity contract |
| ONB-004 | Unverified user | Login if permitted, attempt workspace creation through UI and direct API | Creation denied until verified; no company or owner grant created | PRD 3; A01 |
| ONB-005 | Fresh user; worker | Follow J01 verification using captured message | Correct account verified; subsequent request can create workspace | PRD 3; A01 |
| ONB-006 | Verification tokens | Retry consumed link; use expired, malformed and other-account links | No unauthorized verification; understandable failure; account unchanged | PRD 13; identity contract |
| ONB-007 | Unverified account | Resend verification; repeat submission and test throttling | Contract-defined resend/retry behavior; no duplicate business effect or token disclosure | PRD 13; contract |
| ONB-008 | Verified user | Create Alpha with valid name, currency, time zone | Immediate initial owner access without platform approval; saved configuration survives refresh | PRD 3; A01 |
| ONB-009 | Verified user | Submit invalid/empty company settings, then correct | Invalid creation rejected atomically; valid retry succeeds | PRD 13; current contract |
| ONB-010 | Verified user | Double-click creation; replay same command; retry after lost response | Stable command creates company once; changed payload with same key conflicts; no duplicate owner records | PRD 13; command contract |
| ONB-011 | Owner | Complete J02; refresh and reopen workspace | Correct account/company and current permitted actions restored | PRD 3–4 |
| ONB-012 | Any account | Wrong password, unknown email, repeated failed logins | No authenticated access; understandable response and enforced retry window | PRD 13; identity contract |
| ONB-013 | Logged-in owner | Logout; back/refresh/direct protected URL and old session request | Protected data requires authentication; logout behavior matches current session contract | PRD 4, 13; contract |
| ONB-014 | Known and unknown emails | Request recovery for each | Generic response avoids account enumeration; only eligible account receives recovery message | Identity contract |
| ONB-015 | Owner with two sessions | Complete J03; retry old password and prior sessions | New password works; old password and pre-reset sessions rejected | PRD 13; identity contract |
| ONB-016 | Recovery links | Replay consumed link; use expired/malformed link; enter invalid new password | No unauthorized reset; valid correction possible according to token rules | PRD 13; identity contract |
| ONB-017 | Alpha/Beta owners | Complete J04 via company IDs, protected pages and API context | No cross-company reads/writes; no membership gained by registration/domain | PRD 3–4, 13; A01 |
| ONB-018 | Account legitimately in two companies | Switch Alpha/Beta repeatedly; refresh; use stale tab | Selected company clear; queries and writes use correct context; no mixed data | PRD 3, 13; M02 fixture dependency |
| ONB-019 | Worker interrupted | Stop isolated worker, register/request recovery, restart worker | Durable pending message recovers; underlying account/workspace records remain consistent | PRD 13; local delivery contract |
| ONB-020 | Browser offline/server unavailable | Interrupt registration/creation response; reconnect and check outcome before retry | Useful error/loading recovery; command lookup avoids duplicate company creation | PRD 13; contract |
| ONB-021 | Desktop and 320/390px | Run J01–J03, keyboard-only, light/dark | Labels/focus/errors readable; actions reachable; no blocking overflow | PRD 12–13 |
| ONB-022 | Profile owner | Change account email through supported flow; test old/new verification links and sessions | Current contract's verification/revocation rules enforced; no takeover or leaked company access | Identity contract; PRD 13 |

## Exit evidence

For each case: status, exact steps/data variation, actual outcome, safe screenshot/reference, API/database confirmation where relevant, and bug ID. Record browser/version, viewport, application revision/working-tree state and mail adapter. A01 remains unaccepted until the full browser journey and isolation checks pass. Live email is separately blocked until a live provider is available; local capture must not be labelled live delivery.
