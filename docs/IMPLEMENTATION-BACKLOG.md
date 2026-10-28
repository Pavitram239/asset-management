# Implementation backlog

Dependency order, updated 20 October 2026. B00/B01 baseline/company foundations and B02/B03 encrypted outbox/local mail/verified identity/recovery are delivered locally; [company evidence](COMPANY-FOUNDATION-VERIFICATION.md) and [identity/delivery evidence](IDENTITY-DELIVERY-VERIFICATION.md) record the checks. B04 onboarding is also delivered as recorded below; B05–B23 remain **planned**. This is not a release-completion claim: live mail, business notifications and typed attachments with later modules remain open. B01 seeds ownership.manage; future business permissions ship with their enforcing modules. [PRD](../PRD.md) defines scope, [workflows](WORKFLOWS.md) define transitions and [permissions](PERMISSIONS.md) define access. Preserve unrelated working-tree changes.

## Delivery slices

20 October update: B04 workspace creation/invitations is now also delivered locally; [onboarding verification](WORKSPACE-ONBOARDING-VERIFICATION.md) records evidence. B05–B23 remain planned. Earlier B02/B03 reports are historical snapshots. Live mail and full custody/release acceptance remain open.

Each row means persistence, service/API, relevant UI, contract/document updates and evidence together. Parallel work is not assumed. Dependencies may reuse baseline code but must verify it in the new workflow.

| ID | Slice and observable acceptance | Depends on | PRD / screens | Required evidence |
| --- | --- | --- | --- | --- |
| B00 | Baseline fixtures and migration harness: empty/legacy installations preserve existing UUIDs and checksum protection; record current tests/build status | None | Cross-cutting | Dedicated TEST_DATABASE_URL; tenant fixtures; current contract compatibility; no rewrite of applied migrations |
| B01 | Ownership, company settings and capability seeds: last owner/admin protected; explicit legacy owner review; currencies/time zone validated | B00 | A01/A03; S03/S26 | Concurrent owner/admin removal, least-privilege seeds, reviewed mapping and migration rerun |
| B02 | Outbox/worker and private-file foundation: transaction events survive failures; staged metadata/cleanup safe; local mail adapter captures messages | B00 | A14; shared messaging/files | Rollback/lease/retry/unknown-provider outcome tests; private storage failure paths recorded separately; add typed target links with their owning module |
| B03 | Verified identity, recovery and sessions: tokens expire/consume once; password reset invalidates old sessions; existing users not silently verified | B00/B02 | A01/A02; S01/S32 | Token replay/expiry, generic recovery, throttling, session-version transition, captured-mail flow, no secret logging |
| B04 | Verified self-service workspace and invitations: owner of a new company only; matching verified employee accepts; deactivation preserves custody | B01/B02/B03 | A01/A02; S02/S03/S23 | End-to-end account/company/invite replay; foreign-company denial; inviter revocation race; browser setup flow |
| B05 | Locations, category fields, units and location scopes: flexible tree; descendant access/move impact; quantities match unit precision | B01/B04 | A03/A04/A09; S03/S24/S26 | Cycles/cross-tenant FKs, location-move impact, union scopes, archived references, keyboard/mobile forms |
| B06 | Shared command/ledger infrastructure plus minimal item/lot/unit persistence: balanced postings, locked balances, version/idempotency lookup and transactional audit/outbox | B03/B05 | A05/A11/A15; shared | Synthetic typed fixtures, last-unit race, duplicate/changed-key payload, crash/response-loss recovery, journal and unit uniqueness, rollback |
| B07 | Catalog, acquisition lots, individual units and opening balances: three modes; known/unknown costs and warranty; private attachments | B05/B06 | A04/A03; S05-S08/S25 | Exact-decimal validation, unique tags, lot history, no cost leaks, repeat opening command, responsive inventory |
| B08 | Legacy cutover and compatibility: preserve /products and _id IDs, assignment references/history/files; add imported-custody persistence; physical legacy edits route safely or return WORKFLOW_REQUIRED | B07 | A03/A04; S05/S06/S31 | Legacy backfill reconciliation incl archived/deleted units, unknown location/cost, imported custody, old-binary gate; current contract changes |
| B09 | Item requests and handovers: request approval separate from stock issue; direct issues; reusable confirmation and explicit disputes; consumables have no normal return task | B04/B07/B08 | A05-A07; S09-S12 | Two-manager race, active verified recipients, partial request fulfillment, wrong confirmer, dispute recovery, both browser journeys |
| B10 | Inspected partial returns, transfers and lifecycle: exact original lots, transit, damage/loss/recovery and custody continuity | B09 | A08/A09; S13/S14/S31 | 2-pan partial damaged return; partial transit receipt/loss; off-site custodian; duplicate and scoped source/destination commands |
| B11 | Supplier/provider contacts, request/quote/order drafts and exact cost calculations: currency-separated totals and cost-permission views | B07 | A10; S15/S17/S18/S25 | Quote comparison, supported tax/rounding fixtures, private price documents, no mixed-currency totals |
| B12 | Versioned approval policies, routing/inbox and final-order approval: sequential current-role checks, no self-approval, material changes renew authorization | B01/B03/B11 | A10/A14; S16/S26 | Within-budget versus over-budget example; stale/concurrent decision; missing approver; revoked role; policy/revision changes |
| B13 | Issue/amend/cancel order and formal supplier document: approved exact revision; cancellation retains delivered commitments | B12 | A10/A12; S18/S21 | Generated snapshot, email failure independent, renewed scope approval, split orders cannot reuse request budget/quantity, no cancellation erasure |
| B14 | Partial delivery/inspection, accepted-stock acquisition and separate rejection obligations | B06/B07/B13 | A11; S08/S19 | 20/12/10/2 scenario, unique individual tags, one posting per receipt, concurrent receipts, rejected goods excluded |
| B15 | Supplier returns/replacements/credits: accepted-stock physical returns, repeated rejected replacements and eligible cancellation | B10/B14 | A12; S21 | Original/replacement arithmetic, original-lot stock return, no in-custody silent return, retained invoices/history |
| B16 | Invoices, matching/discrepancies, credit documents and payment/reversal records | B11/B14/B15 | A12; S20 | Quantity/amount allocation bounds, unique supplier invoice, partial payments/reversals, currency consistency, no actual transfers |
| B17 | Faults, preventive plans, internal/external work, intake/completion inspection and expenses/warranty | B03/B10/B11 | A13; S06/S22/S25 | Only 2 of 10 unavailable; responsibility retained explicitly; partial repair; provider/expense scope; due occurrence dedup |
| B18 | In-app/email business events, preferences and reminder schedules integrated across workflows; actionable home | B09/B12/B14/B17 | A14; S04/S29/S32 | Delivery failure/recovery, permission revocation before send, obsolete job cancellation, timezone boundaries, no sensitive subject/body leaks |
| B19 | Stock-check baseline/count/review and authorized correction | B06/B10 | A15; S27 | Stale count after stock movement, recount/reconciliation, variance journal, role separation and no submit-time overwrite |
| B20 | Inventory/custody/purchase/service/usage reports and CSV export | B16/B17/B19 | A03/A15; S28 | Scoped aggregation versus known fixtures, cost redaction, currency-separated spending bases, CSV formula escaping and reconciliation |
| B21 | QR labels/scanning and manual fallback; protected deep links | B07/B09 | A16; S30 | Actual phone/permission denial, unauthorized UUID/workspace, no credentials in label, scan has no write effect |
| B22 | Full screen/state/accessibility review, profile/history and workspace-switch recovery | B18/B20/B21 | A01-A16; S01-S32 | Keyboard/light/dark/320/390/desktop; loading/empty/denied/error/expired/conflict states; complete live journeys rather than prototype simulation |
| B23 | Release evidence and operational rehearsal: migrate/restore/reconcile, worker/storage failures, measured synthetic load, documented deployment configuration | B22 | A01-A16 | npm test; frontend build; dedicated DB/HTTP integration; configured provider/storage checks; restore evidence; unresolved risks explicit; no incidental deployment |

Use meaningful backend tests for business rules, integration tests for database locking/FKs/HTTP/private storage and browser review for user flows. Do not add tests that merely repeat presentation implementation. Documentation-only changes require content/link/contract checks, not an application rebuild.

## Acceptance coverage

| PRD scenario | Primary slices | Evidence required before marking accepted |
| --- | --- | --- |
| A01 | B01/B03/B04 | Verified self-service company ownership without existing-company access |
| A02 | B03/B04/B09/B10 | Invite identity, inactive access denial, retained outstanding custody/history |
| A03 | B05/B07/B12/B20 | Scope and cost denial through API/UI/files/audit/exports/notifications |
| A04 | B05/B07/B08 | Three modes, category fields, lots and preserved legacy IDs |
| A05 | B06/B09 | Concurrent last-unit physical issue, idempotent result and nonnegative balance |
| A06 | B09 | Requested and direct reusable handover both require actual recipient confirmation |
| A07 | B09/B10 | Dispute retained; resolution accounts for every affected allocation |
| A08 | B10/B17 | One of two returned damaged, one outstanding, no false availability |
| A09 | B05/B10 | Partial transit, branch scopes and off-site custody/history |
| A10 | B11-B13 | Exact-revision final approval, budget/scope renewal, no requester self-approval |
| A11 | B14 | 20 ordered / 12 delivered / 10 accepted / 2 rejected, posted once |
| A12 | B13/B15/B16 | Returns, replacements, cancellation, invoice/payment references reconcile |
| A13 | B17 | Two of ten in service; internal/external providers, expenses, warranty/outcome |
| A14 | B02/B12/B18 | Durable authorized in-app/email tasks and failure recovery |
| A15 | B19/B20 | Traceable stale-safe correction and authorized CSV/report totals |
| A16 | B21/B22 | Phone scanning/manual fallback with current access enforcement |

## Screen coverage and shared work

S01 B03; S02 B04; S03 B01/B04/B05; S04 B18; S05/S06/S07/S08 B07/B08/B14/B17; S09/S10/S11/S12 B09; S13/S14 B10; S15 B11; S16 B12; S17 B11; S18 B11/B13; S19 B14; S20 B16; S21 B15; S22 B17; S23 B04; S24 B05; S25 B11/B17; S26 B01/B05/B12; S27 B19; S28 B20; S29 B18; S30 B21; S31 B08/B10/B22; S32 B03/B18/B22. B22 reviews all 32 groups against live behavior.

## Completion record per slice

Record the implemented outcome, migration numbers/checksums, paths and operation IDs promoted from planned to current, permission mapping, scenario fixtures, actual check results, browser widths/states and skipped external dependencies. Update affected guides when code differs. Keep first-release scope intact; an incomplete slice is not accepted because its mockup or contract exists. Production launch requires explicit environment decisions and deployment authorization beyond local implementation.

B08 acceptance and preservation decisions are detailed in [legacy cutover design](LEGACY-CUTOVER-DESIGN.md). This is design work, not migration/runtime evidence.
