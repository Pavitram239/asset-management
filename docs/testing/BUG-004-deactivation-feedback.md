# BUG-004 — Technical message after workspace access is removed

Module: M02 Employees and access, ACC-020. Type: Defect. Severity: Low. Status: Closed after local retest, 3 November 2026.

Observed twice on 28 October 2026 in the local browser campaign, using synthetic fixtures in the dedicated `assetos_e2e_test` database, schema `m01_round2`. Fixed and original scenario retested on 3 November 2026.

## Reproduction

1. Sign in as the synthetic invited employee with active membership in Module 1 Beta.
2. Select that workspace and open its dashboard.
3. In a separate authenticated owner session, deactivate the employee membership.
4. Refresh the employee dashboard with its previous workspace selected.

Expected: remove unavailable company data and explain that access to the workspace is no longer available, with an appropriate next step.

Actual: company selection/data are removed and the workspace setup screen appears, but a transient message says **“Select an active organization using X-Organization-Id”**. A browser user cannot act on that HTTP-header instruction. The setup screen also does not explain the loss of access.

## Evidence and impact

- [Saved accessibility state](../../.tmp/e2e/bug-004-deactivation-state.txt) contains the exact message.
- [Saved browser screenshot](../../.tmp/e2e/bug-004-deactivation.png).
- Independent HTTP checks confirmed the employee's existing session was denied company access immediately; account, legacy assignment and assignment history remained intact. This is a feedback defect; no unauthorized access or data loss was observed.

Investigate dashboard workspace invalidation and error presentation. The precise request ordering has not been established. Do not weaken server authorization to change this feedback.

## Retest criteria

Repeat the four steps on desktop and mobile. Confirm clear access-removal feedback, no HTTP-header instruction, no stale company content, continued server denial, and a usable account/workspace navigation path. Test another available workspace as well as an account with no remaining memberships.

## Fix and actual retest — 3 November 2026

Dashboard recovery now returns a workspace-unavailable state and fetches account navigation without organization context. It displays a persistent, accessible notice explaining lost access and contacting the administrator; when other memberships exist it also directs the user to choose another organization. The inventory loader stops on membership denial rather than continuing after its parallel parent clears selection. A late inventory denial uses ordinary-language feedback, and a missing-context response during recovery is not shown as a technical toast. Other unexpected loader failures propagate instead of being silently ignored. Server authorization and API contracts are unchanged.

Acceptance criteria for this fix: selected workspace becomes unavailable after owner deactivation; no stale inventory or technical header instruction; explanation and account navigation remain usable; server still denies company access.

- Explicitly reactivated the synthetic employee through an authenticated owner session, signed in through the browser, selected Beta and verified its assigned laptop was visible. Then deactivated through the owner session and refreshed the employee dashboard. The new notice appeared, no old asset or technical toast remained, and the selector contained no active company.
- Reviewed desktop and 390px layout; mobile DOM checks showed no horizontal overflow. [Desktop proof](../../.tmp/e2e/bug-004-fixed-desktop.png), [mobile proof](../../.tmp/e2e/bug-004-fixed-mobile.png).
- Real HTTP check: removed-company asset access returned 403; identity-only account navigation returned 200 and zero active companies. Final synthetic membership remains inactive.
- `npm run build` passed. `npm test --workspace=client` passed all 7 Node records (6 child scenarios and their parent). `git diff --check` passed. No backend code changed; the earlier 38 integration records were not rerun for this frontend-only fix.
- Another remaining-membership browser variant was not exercised in this retest; full ACC-020 state coverage and ACC-014 remain partial. Closing this specific reproduced bug does not accept the module. No deployment, live storage or mail-provider verification.
