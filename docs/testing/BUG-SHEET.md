# Bug sheet

Only reproducible observed failures belong here. Three confirmed defects are recorded below, all fixed and locally retested. Remaining coverage limitations are in the execution records.

Latest review: [backend regression fixes, 28 October 2026](BACKEND-REGRESSION-FIXES.md). The full dedicated integration suite now passes (87/87); Module 1 still has three partially tested browser cases.

| Bug ID | Module / test | Type | Summary and steps | Expected | Actual | Severity | Status | Evidence | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | M01 / ONB-018 | Defect | Keep Alpha Access management open in tab A; switch tab B to Gamma; save a department from stale A. [Details](BUG-001-stale-workspace.md) | Retain original company or block stale form | Original: department landed in Gamma. Fixed: each tab retains its own selection | High | Closed | [Fix, browser and SQL evidence](BUG-001-VERIFICATION.md) | 28 Oct 2026, local working tree: reciprocal Beta/Delta writes, refresh, mobile and lost-response retry passed |
| BUG-002 | Database / populated legacy upgrade | Defect | Seed pre-cutover products and run current migrations | Preserve records and complete transactional upgrade | Original: ambiguous company column/variable aborted migration 012 | High | Closed | [Repair/checksum evidence](BACKEND-REGRESSION-FIXES.md) | 28 Oct 2026: populated upgrade, checksum and preserved custody/metadata/ledger assertions passed in full 87-record integration run |
| BUG-003 | Inventory configuration / unlinked products | Defect | Create an unlinked legacy product after migration 012 | Preserve current unlinked API/scopes; protect linked units | Original: guard rejected all unlinked creation | High | Closed | [Migration 013 and regressions](BACKEND-REGRESSION-FIXES.md) | 28 Oct 2026: configuration scopes and real product CRUD/history passed; linked physical writes still rejected; full suite passed |

Types: Defect, PRD gap. Severity: Critical (company isolation/security breach or widespread data loss), High (core workflow blocked or stock/access incorrect), Medium (partial workflow failure with workaround), Low (minor usability/presentation). Set severity from observed impact.

Statuses: Open → In progress → Ready for retest → Closed; Blocked when a named dependency prevents progress. Retest records date, test ID, environment/version and result. Do not close because code changed without rerunning the failed scenario.

To add a bug, create a row with the next BUG-### ID, synthetic setup, numbered reproduction steps, expected/actual behavior and a safe evidence reference. Link the same ID from the failed test case. Do not place credentials or token-bearing URLs here.
