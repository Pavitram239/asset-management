# M02 Employees and access

PRD basis: sections 3–4 and 13; A02–A03. M01 password validation/keyboard recovery is paused at the user's requested human handoff; this module uses independently established verified accounts/workspaces. Custody, report/export and business-notification end-to-end portions of A02/A03 also require their owning later modules; do not infer those from these foundation checks.

Synthetic fixtures: an owner with two test companies; a new invited employee, another verified account, department/location-scoped manager, second administrator, and inactive membership. Use local captured mail, no live recipients. Test methods may combine browser journeys with real HTTP/database assertions; distinguish these in the run report.

| ID | Journey / action | Expected outcome | Basis |
| --- | --- | --- | --- |
| ACC-001 | Owner reviews starter roles and protected ownership | Owner/admin/manager/employee roles exist with delivered capabilities; ownership is separate from editable names | PRD 4 |
| ACC-002 | Invite an address before registration with Employee/self access | Pending invitation and encrypted capture; no account/membership/grants created by invitation | PRD 3, 4 |
| ACC-003 | Empty/invalid email, missing/invalid role/scope, foreign department/location/role | Understandable validation; no unintended invitation or access | PRD 4, 13 |
| ACC-004 | Wrong verified account opens and attempts invitation | Denied; no membership or leaked company access | PRD 3–4, 13 |
| ACC-005 | Matching account registers but remains unverified, then verifies and accepts | Cannot join before verification; explicit acceptance creates reviewed membership/grants only | PRD 3; A02 |
| ACC-006 | Joined employee refreshes and reviews workspace/own-item access | Correct company selected; exact granted self scope; no administrative access | PRD 3–4; A02–A03 |
| ACC-007 | Repeat acceptance with same key; replay after cache expiry; different new key | One membership/assignment; durable recovery only while current access permits it | PRD 13 |
| ACC-008 | Invite same pending address twice; invite active/inactive existing member | Duplicate rejected; no overwrite, escalation or silent reactivation | PRD 3–4, 13 |
| ACC-009 | Revoke invitation with reason, then attempt acceptance | Visible revoked history, no new membership, stale/repeated command handled safely | PRD 3–4, 13 |
| ACC-010 | Accept expired or malformed invitation | No access created; understandable invalid/expired response | PRD 13 |
| ACC-011 | Revoke inviter authority or alter invited role before acceptance | Current authority/snapshot checked; stale proposal cannot grant broader access | PRD 4, 13 |
| ACC-012 | Unauthorized member creates invitation, grants own permissions or changes own role/membership | Server denial; effective access unchanged; denied UI appropriate | PRD 4; A03 |
| ACC-013 | Admin creates custom role/direct grants, changes/revokes them | Current grants combine additively, take effect on next request, remain company-specific | PRD 4, 13 |
| ACC-014 | Department/location manager reads permitted items, tries outside scope/costs/direct links | Scope/field denial through server and UI; no restricted cost/file disclosure | PRD 4; A03 |
| ACC-015 | Owner assigns a legacy fixture to joined employee, deactivates membership, retries existing session | Subsequent company access denied; account/history/assignment retained. Legacy assignment evidence is not full custody acceptance | PRD 3, 13; A02 foundation |
| ACC-016 | Deactivated employee retries old invitation; admin reviews reactivation explicitly | Invitation cannot silently restore membership; only authorized explicit change can reactivate | PRD 3–4 |
| ACC-017 | Attempt last owner/admin removal and concurrent admin removals | At least one owner and access administrator retained transactionally | PRD 4, 13 |
| ACC-018 | Switch workspaces and attempt foreign membership/role/invitation IDs | No cross-company operations or accidental grant mixing, including stale tabs | PRD 3–4, 13 |
| ACC-019 | Observe audit/history for invite, acceptance, revocation and access changes | Actor/time/decision traceable; failed changes do not create successful grants | PRD 13 |
| ACC-020 | Review invitation/join/access screens at desktop, 320/390px, light/dark and keyboard; loading/empty/denied/error/retry | Reachable controls, visible focus, useful states, no blocking overflow; local mail only | PRD 12–13 |

Every case starts Not run. Close only with expected/actual results, environment/version, safe evidence and any bug ID. Keep unexecuted variants explicit. Full A02 custody recovery and A03 exports/notifications remain cross-module gates.
