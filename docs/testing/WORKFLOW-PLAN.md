# End-to-end workflow plan

Prepared 28 October 2026. This is a test design, not a new execution report. Reuse the [module tracker](README.md), [M01 cases](M01-accounts-onboarding.md), [bug sheet](BUG-SHEET.md) and [earlier run](RUN-2026-10-28.md). The [PRD](../../PRD.md) defines expected behavior; the [current API contract](../openapi.json) describes available interfaces. Planned interfaces and mockups do not prove implementation.

## One module at a time

1. Start with M01. Review the earlier browser-access blocker and establish the permitted test environment before resuming browser work. Do not repeat earlier results as fresh passes.
2. Expand only the active module into executable cases: requirement reference, actor, setup, exact steps, expected outcome, actual outcome, status and evidence. M01 already has 22 cases.
3. Walk the complete browser journey, then its validation, permission, retry and recovery branches. Use server/database checks to confirm persisted state, audit, quantities and access where needed. API-only checks cannot pass the browser journey.
4. Record observed failures in the existing bug sheet. Distinguish a reproducible defect, a verified missing PRD feature, and an environment blocker. A planned feature stays required even when unavailable to test.
5. Retest fixes and relevant regression paths. Publish a short module report: passed/failed/blocked/not implemented/not run counts, evidence, bug IDs and unmet requirements.
6. Close the module only when all mandatory cases pass with evidence. Otherwise keep it open; document a pause before testing an independent module. Do not silently advance past an unresolved dependency.

For procurement, treat M07.1–M07.5 below as separate sequential test batches. Keep the whole procurement module open until all five pass.

## People and reusable test data

Use two isolated synthetic companies, Alpha and Beta. Within Alpha use an owner, administrator, kitchen-scoped manager without cost access, employee, purchaser, approver and finance user. Give users only the capabilities needed for each case; starter role names alone do not establish authorization. Include an unverified user, pending invite, inactive membership and legitimate multi-company user.

Create a flexible branch/location tree, Kitchen and IT departments, category-specific fields, a laptop tracked individually, 10 pooled pans, and consumable plates. Use distinct acquisition lots, known costs and different currencies for reconciliation. Use synthetic contacts and example.test addresses. Configure the example purchase amounts as test fixtures, never assumed product defaults.

Use a dedicated test database and local captured mail for initial runs. Keep credentials, one-use links, private uploads and personal data out of evidence. Live mail/storage results require separately configured test providers. Do not alter external service access or deploy as part of testing.

## Module journeys and observable outcomes

These are workflow families. Before executing a module, split each into individual success and failure cases covering every relevant PRD bullet, not just A01–A16.

| Batch | Actors and journey | Key observable outcomes | PRD basis |
| --- | --- | --- | --- |
| M01 Accounts/onboarding | Fresh user registers → verifies email → creates Alpha → becomes owner → logs out/in; recover password and change profile/email | No existing-company access from signup; unverified creation denied; single-use links; correct session revocation; saved company context | §§3–4, 13; A01; implemented identity contract |
| M02 Employees/access | Owner invites → employee registers/verifies/accepts → admin sets starter/custom roles and scoped/direct grants → changes/revokes access → deactivates membership | Pending users cannot receive items; no self-escalation; current grants enforced on next request; last owner/admin protected; history and outstanding custody retained; multi-company switching isolated | §§3–4, 13; A02–A03 |
| M03 Configuration | Admin configures company details, departments, branch/room tree, categories/fields and quantity units → edits/archives/moves configuration | Flexible omitted levels; reviewed scope changes; category and mode remain separate; historical definitions/units remain explainable; invalid/cross-company references denied | §§3–6, 13; A03–A04, A09 |
| M04 Inventory | Manager creates laptop, pooled pans and consumables → records opening lots → searches/filters/pages/details → edits metadata → reviews files/history | Correct identities, category fields, location/condition/availability; separate lots/cost/warranty; stock survives refresh; no negative/duplicate opening stock; costs and private files scope-filtered; legacy /products, _id and assignment IDs preserved | §§4–5, 13; A03–A04; compatibility rules |
| M05 Requests/handovers | Employee requests reusable item → manager approves → physical handover → employee confirms; repeat as direct issue and consumable issue | Approval alone does not reduce stock; reusable handovers await explicit confirmation; consumables reduce stock without normal return obligation; temporary/long-term custody and due dates supported | §§5, 7; A05–A06 |
| M05 Dispute/concurrency | Employee reports short/damaged/not-received handover → authorized resolution; two managers issue the last unit concurrently; repeat submission | Dispute visible until accounted resolution; no silent stock restoration; at most one last-unit allocation; retry creates no second custody or stock movement | §§5, 7, 13; A05, A07 |
| M06 Returns | Employee returns one of two issued pans → manager inspects damaged return → routes disposition; repeat usable and full return | One remains outstanding; damaged return stays unavailable; usable return becomes available only after inspection; quantities and actor/time history reconcile | §§5, 8; A08 |
| M06 Movement/lifecycle | Manager splits stock between branches → records laptop at employee home → handles loss, retirement/disposal | Source/destination access enforced; ownership/custody/location remain distinct; loss/disposal excluded from availability with retained history and attachments | §§5–6, 8, 13; A09 |
| M07.1 Purchase request/approval | Employee requests item, quantity, reason, required date and estimate → configured role/scope approvers approve/reject sequentially | Progress/reasons visible; no self-approval; missing/revoked approver blocks or uses authorized alternate; amount/currency thresholds and concurrent/stale decisions safe | §9; A10 |
| M07.2 Quotations/orders | Purchaser records and compares quotations/terms → selects supplier → prepares formal order → satisfies required final approval → issues supplier document | Request/quote/order links retained; 30,000 approved vs 28,000 unchanged scope follows configured rules; 35,000 or material scope change requires renewal; finance-required approval enforced | §9; A10 |
| M07.3 Delivery/inspection | Order 20 pans → deliver 12 → accept 10/reject 2 → retry receiving → complete later receipt | Stock increases by 10 once; 8 undelivered and 2 rejected unresolved remain visible; damaged quantities separate; receipt linked to order/lot; individual identities unique | §9; A11 |
| M07.4 Supplier resolution | Resolve rejected delivery via replacement/credit/cancellation; return accepted goods; cancel remaining order after partial receipt | Stock, remaining obligations and invoice/history references reconcile; no erasure of delivered goods; repeated actions cannot repeat movement | §9; A12 |
| M07.5 Invoices/payments | Finance links invoice to order/receipt → records taxes/charges/currency → records partial/full payments and references → reviews discrepancy | Acquisition costs retained; payment records reconcile; supplier documents protected; unlike currencies separate; records do not execute financial transfers | §9; A12 |
| M08 Maintenance/support | Employee reports fault → manager schedules preventive or repair work with internal employee/external contact → records warranty/support, dates, costs/files → completes inspection | Repairing 2 of 10 affects only 2; completion explicitly releases usable quantity; partial repair and failures traceable; history survives transfer/deactivation; external provider needs no login | §10; A13 |
| M09 Stock checks | Counter counts location → mismatch reviewed → authorized correction → recount/history | Observed counts do not silently overwrite stock; movement during count is reconciled; missing/unexpected items and correction actor/reason remain traceable | §8; A15 |
| M10 Notifications/dashboard | Trigger approvals/results, confirmation tasks, overdue returns, maintenance and warranty reminders → open task → interrupt/restart delivery | In-app and email reach authorized recipients; actionable dashboard matches scope; failed delivery preserves business record; retry/duplicate events safe; revoked users receive no restricted content | §11; A14 |
| M11 Reports/export | Authorized user reviews inventory/availability, custody/overdue, purchase/cost, maintenance and usage reports → filters/exports CSV | Known fixture totals reconcile; location/category scope retained; restricted rows/costs excluded through direct export; total basis and currency distinctions clear | §12; A03, A15 |
| M12 QR | Print label → scan on phone → authenticate/select authorized context → view permitted item/action; deny camera and use manual lookup | QR grants no access; foreign IDs denied; no secret/private download URL in label; actual phone camera and fallback work | §12; A16 |
| M12 Connected regression | Verified owner creates company → invites team → configures inventory → purchases/receives → issues/confirms → damaged partial return → repairs → counts → reports; repeat key isolation/switching checks | IDs and workflow links persist across modules; quantities, custody, cost, tasks and audit agree; all A01–A16 have supporting evidence | §§3–14; A01–A16 |

## Checks repeated within each module

- Success, empty, loading, validation, denied, stale/conflict, server failure and recoverable connection-loss states.
- Required fields, quantities/precision and invalid identifiers; cancelled forms; refresh/back navigation and persistence.
- Company, department, location, own-item and cost boundaries through UI, direct API, links, files, search, totals, export and notifications as applicable. Repeat after revocation and workspace switch.
- Duplicate clicks/retries, concurrent sensitive commands and rollback: state, stock, custody, audit and queued events must agree.
- Desktop and 390/320px layouts, keyboard/focus, labels/errors, light/dark presentation; real phone scanning in M12. Record the exact browser, widths and observed states.
- Upload size/type/signature, authorized retrieval, replacement/removal, provider failure and cleanup where files are supported. Local metadata checks do not prove real provider success.

Reuse existing backend and dedicated PostgreSQL/HTTP tests. Run `npm test`, `npm run build` and `npm run test:integration` with a dedicated `TEST_DATABASE_URL` as relevant evidence during execution; explicitly record skips. Use current-contract API assertions for implemented routes; record absent accepted workflows as gaps rather than calling the planned contract as if it ran. Postman can provide reusable request/assertion checks where useful; no workspace publishing is needed for this local plan.

## Simple bug sheet and module report

Keep one shared [bug sheet](BUG-SHEET.md). Each row needs ID, module/test, Defect or PRD gap, concise reproduction steps, expected, actual, severity, status, evidence and retest result. Record environment/version with the evidence. Assign severity from observed impact. Environment blockers belong in the run record, linked from the affected tests.

Use Open → In progress → Ready for retest → Closed. Close only after the original scenario and related regression pass. A missing PRD feature can be logged after its absence is verified; it is not automatically an observed runtime defect.

Each module report should contain: tested environment/revision; requirement and case coverage; browser versus API/database evidence; result counts; open bugs; blocked dependencies; retest results; and an explicit Accepted or Unaccepted outcome. A passing test count alone is not PRD acceptance.

## Current starting point and release gate

No new application tests were run while preparing this plan. The earlier run records one desktop registration pass and supporting automated checks, with M01 browser work blocked by a saved site permission. That historical state must be rechecked before continuing. No confirmed defect is added merely from that blocker.

Current contract descriptions identify catalog/opening stock foundations, with later custody, purchasing, maintenance and reporting still planned. Source files or migrations alone do not establish delivery. Review the active implementation for each module before classifying a feature as testable or missing; do not treat accepted first-release modules as optional.

Final acceptance requires all mandatory PRD requirements, A01–A16 and cross-cutting checks to pass. Production readiness also requires agreed volumes/performance targets, measured results, hosting, retention, private storage/live delivery and backup/restore evidence. Unresolved targets remain explicit requirements to resolve, not invented thresholds or implicit passes. This plan authorizes no deployment.
