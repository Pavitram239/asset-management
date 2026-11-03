# Bug sheet

Only reproducible observed failures belong here. Four confirmed defects are recorded below, all closed after local retests. Remaining coverage limitations are in the execution records.

Latest review: [M02 continuation, 3 November 2026](RUN-2026-11-03-M02.md), with 38 fresh passing integration records. The earlier full integration run passed 87/87. M01 remains paused with two partial browser cases; M02 remains unaccepted.

| Bug ID | Module / test | Type | Summary and steps | Expected | Actual | Severity | Status | Evidence | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | M01 / ONB-018 | Defect | Keep Alpha Access management open in tab A; switch tab B to Gamma; save a department from stale A. [Details](BUG-001-stale-workspace.md) | Retain original company or block stale form | Original: department landed in Gamma. Fixed: each tab retains its own selection | High | Closed | [Fix, browser and SQL evidence](BUG-001-VERIFICATION.md) | 28 Oct 2026, local working tree: reciprocal Beta/Delta writes, refresh, mobile and lost-response retry passed |
| BUG-002 | Database / populated legacy upgrade | Defect | Seed pre-cutover products and run current migrations | Preserve records and complete transactional upgrade | Original: ambiguous company column/variable aborted migration 012 | High | Closed | [Repair/checksum evidence](BACKEND-REGRESSION-FIXES.md) | 28 Oct 2026: populated upgrade, checksum and preserved custody/metadata/ledger assertions passed in full 87-record integration run |
| BUG-003 | Inventory configuration / unlinked products | Defect | Create an unlinked legacy product after migration 012 | Preserve current unlinked API/scopes; protect linked units | Original: guard rejected all unlinked creation | High | Closed | [Migration 013 and regressions](BACKEND-REGRESSION-FIXES.md) | 28 Oct 2026: configuration scopes and real product CRUD/history passed; linked physical writes still rejected; full suite passed |
| BUG-004 | M02 / ACC-020 | Defect | Deactivate selected-workspace employee, then refresh employee dashboard. [Details](BUG-004-deactivation-feedback.md) | Explain unavailable workspace in ordinary language | Fixed: persistent access-unavailable notice; no technical toast or stale inventory | Low | Closed | [Fix and proof](BUG-004-deactivation-feedback.md#fix-and-actual-retest--3-november-2026) | 3 Nov 2026: original browser journey, desktop/390px review and HTTP denial passed; build and 7 frontend records passed |

Types: Defect, PRD gap. Severity: Critical (company isolation/security breach or widespread data loss), High (core workflow blocked or stock/access incorrect), Medium (partial workflow failure with workaround), Low (minor usability/presentation). Set severity from observed impact.

Statuses: Open → In progress → Ready for retest → Closed; Blocked when a named dependency prevents progress. Retest records date, test ID, environment/version and result. Do not close because code changed without rerunning the failed scenario.

To add a bug, create a row with the next BUG-### ID, synthetic setup, numbered reproduction steps, expected/actual behavior and a safe evidence reference. Link the same ID from the failed test case. Do not place credentials or token-bearing URLs here.
