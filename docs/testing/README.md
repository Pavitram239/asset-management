# Module-by-module acceptance testing

Baseline: [PRD](../../PRD.md), [journeys](../../UX-FLOWS.md), and the current [contract](../openapi.json). Created 28 October 2026. Requirements and historical verification reports are not current test results.

## Execution order

| Module | Journey | PRD coverage | Current campaign status |
| --- | --- | --- | --- |
| M01 Accounts and onboarding | Register, verify, create company, login/logout, recover | Sections 3, 13; A01 | Paused/unaccepted: 20 Pass, 2 Partial; user left reset handoff pending. [Remaining-case evidence](RUN-2026-10-28-M01-REMAINING.md). [Backend failures resolved](BACKEND-REGRESSION-FIXES.md), 87 passing integration records. |
| M02 Employees and access | Invite, accept, roles/scopes, revoke, deactivate | Sections 3–4; A02–A03 | Starting independent checks; [cases](M02-employees-access.md) |
| M03 Company configuration | Departments, location hierarchy, categories, units | Sections 3–6; A03–A04, A09 | Not run |
| M04 Inventory | Three tracking modes, opening stock, lots, costs, files | Section 5; A03–A05 | Not run |
| M05 Requests and handovers | Request/approve/handover, direct issue, confirm/dispute | Section 7; A05–A07 | Not run |
| M06 Returns and movements | Inspect partial returns, transfers, off-site, damage/loss/disposal | Sections 6, 8; A08–A09 | Not run |
| M07 Procurement | Request/approval, quotations/orders, partial receiving, supplier resolution, invoices/payment records | Section 9; A10–A12 | Not run; execute submodules sequentially |
| M08 Maintenance | Fault, preventive/internal/external work, warranty, repair inspection | Section 10; A13 | Not run |
| M09 Stock checks | Count, discrepancy, reviewed correction, history | Section 8; A15 | Not run |
| M10 Notifications | In-app/email tasks, reminders, delivery recovery, dashboard | Section 11; A14 | Not run |
| M11 Reports | Inventory/custody/purchases/service/usage, CSV, currency/cost scope | Section 12; A03, A15 | Not run |
| M12 QR and connected journeys | Camera/manual lookup, purchase-to-repair-to-report | Sections 12–14; A01–A16 | Not run |

For procurement, run requests/approval first, then quotations/orders, receiving/inspection, supplier resolution, and invoices/payment records. No actual bank transfers.

## Test method and acceptance

Finish a module's case list before execution. For each case record actor, prerequisites, steps, expected and actual result, status, evidence and bug reference. Use statuses Not run, Pass, Fail, Blocked, Not implemented. A missing accepted feature is a PRD gap, not a pass or a scope reduction.

Run success, validation, denied/direct-link/cross-company access, persistence, duplicate submission, concurrency and failure/recovery cases as relevant. Check screen states, keyboard use, light/dark and 320/390/desktop layouts in each module. Verify quantities, custody, audit and files through the server/database when UI evidence alone is insufficient. Unit, HTTP/database and browser results remain separate.

Close a module only when mandatory cases have evidence, no required case remains failed/blocked/not implemented, and fixes have been retested with relevant regression checks. A blocked module can be paused with its unmet criteria visible; test only independent later work. Final release acceptance requires all A01–A16 plus cross-cutting requirements, and separate operational evidence for performance targets, backups, retention and recovery. Do not invent unspecified targets.

Use two synthetic companies, users at each intended scope, and example.test email addresses. Keep passwords, session cookies, one-use links and personal data out of evidence. Never reuse or clear the application database. Local captured mail proves local delivery only; live email/storage and actual phone-camera checks require their own evidence.

## Outputs

- [Workflow and user journey plan](WORKFLOW-PLAN.md)
- [Module 1 cases](M01-accounts-onboarding.md)
- [Bug sheet](BUG-SHEET.md)
- [Execution record](RUN-2026-10-28.md)
- [Resumed M01 execution](RUN-2026-10-28-M01-ROUND2.md)

This table is the module-level PRD coverage tracker. Each subsequent module must add requirement-level cases for every relevant PRD bullet before testing, including requirements beyond the numbered release examples.
