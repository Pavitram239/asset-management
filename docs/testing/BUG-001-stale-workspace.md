# BUG-001: stale tab submits to another workspace

Status: Closed after local fix/retest on 28 October 2026. Severity: High. Type: Defect. Module/case: M01 / ONB-018. Originally reproduced twice against commit `3cf746e` plus the current uncommitted working tree, using synthetic data in `assetos_e2e_test`, schema `m01_round2`. [Fix and validation](BUG-001-VERIFICATION.md).

PRD basis: sections 3 and 13 require company-specific context and no accidental data mixing during workspace switching. The actor legitimately owns Alpha and Gamma; this is a wrong-target write within existing memberships, not evidence of bypassing server authorization into an unauthorized company.

## Reproduction

1. Sign in as a verified synthetic owner with both Module 1 Alpha and Module 1 Gamma.
2. In tab A, select Alpha and open Access management. Keep this page open. Enter a new department code/name in Create department.
3. In tab B for the same browser session, select Gamma.
4. Return to tab A. Its selected organization still displays Alpha and the department form still belongs to the displayed Alpha page.
5. Submit the department from tab A.
6. Inspect the resulting department's organization in PostgreSQL and the updated page context.

Expected: the stale form is either invalidated with an explicit context-change message or submits only to its original Alpha context after the appropriate checks. Switching another tab must not silently retarget a prepared form.

Actual: the request succeeds in Gamma. Tab A changes its displayed context to Gamma after the save. Both test department rows, `STALE-M01` and `STALE-M01-2`, exist under Gamma; neither was created under Alpha.

## Evidence

- [Pre-submit DOM observation](../../.tmp/e2e/bug-001-before.json): selectedCompany Alpha, code STALE-M01-2, captured after tab B switched to Gamma and before Save.
- [Prepared department form](../../.tmp/e2e/bug-001-before.png): synthetic form values before the repeated save; the header is outside this viewport, so use the DOM observation for the company context.
- [Database result](../../.tmp/e2e/bug-001-database.txt): both department rows belong to Gamma.
- [Run report](RUN-2026-10-28-M01-ROUND2.md): live browser sequence and environment.

Evidence files under `.tmp` are local ignored artifacts. No token, password or session-cookie values are included.

## Inspected boundary and retest criteria

Before the fix, the request interceptor in [customFetch.js](../../client/src/utils/customFetch.js) read the current organization from shared localStorage at request time. [DashboardLayout.jsx](../../client/src/pages/DashboardLayout.jsx) switched that shared value and reloaded only the initiating tab. The [Access management](../../client/src/pages/AccessManagement.jsx) request then used the other tab's newer selection, before refreshing the displayed context after saving. The fixed client now consistently uses tab-specific sessionStorage.

The original testing run applied no fix. The subsequent fix uses tab-specific sessionStorage throughout company selection, requests, retries and file operations. Both directions of the browser/database reproduction now pass, along with lost-response retry and responsive switching. See [actual validation and remaining integration failures](BUG-001-VERIFICATION.md). Keep prepared-form context, scoped reads, file routing and durable retries in future regression coverage.
