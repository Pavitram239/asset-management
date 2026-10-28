# M01 remaining cases — 28 October 2026

Latest status: **20 Pass, 2 Partial, 0 Fail; paused/unaccepted**. User explicitly chose to leave the password-entry handoff pending. ONB-016 and ONB-021 remain partial; ONB-022 is now Pass with the evidence below. No new confirmed application defect.

Environment: existing isolated assetos_e2e_test database/schema m01_round2, API 5101, localhost:5175 frontend and local captured mail worker. Applied corrective migration 013 only to this dedicated long-lived test schema so continuation matches repaired source. No application database/external service changed. Dirty working tree preserved.

## Actual continuation

- Registered a fresh synthetic account using keyboard controls at 320px in light theme. Tab reached every field and Register with visible focus; submission completed. Initial sign-in encountered restored input contents; selecting/replacing the field values through keyboard controls completed login. No application defect inferred from that test-input correction.
- Followed captured verification, signed in and created Remaining Cases Workspace using keyboard-accessible controls. Reviewed readable field labels, validation guidance and mobile layout. New account verification flags were not modified directly in SQL.
- Established another real HTTP login session before profile email changes, stored only in ignored local fixtures. Changed email through the browser profile form using keyboard navigation; verification cleared and the notice showed the updated address.
- Corrected an overly strict test assumption: the current OpenAPI profile contract revokes old-address mail tokens, not existing login sessions. Both sessions correctly remained authenticated with session version 0. The prior session saw the updated unverified email and only its original company. The initial helper assertion expecting 401 was a test-expectation error, not an application bug or a passing check.
- Issued a recovery link to the intermediate address, then changed profile email again. Both the pending intermediate verification token and recovery token were rejected over real HTTP with 400 INVALID_TOKEN. The old verification link also displayed invalid/expired in the browser. Latest final-address link verified successfully. Safe output: [link/session checks](../../.tmp/e2e/m01-remaining-links.txt).
- Requested recovery through keyboard controls and prepared the final reset form at 390px in dark theme. Asked the user to exercise short/mismatched/over-byte passwords, then complete a valid reset and sign-in using keyboard where possible. **User selected “Leave the handoff pending.” No new password was entered/submitted by the agent, no validation success is inferred, and no reset occurred in this continuation.**

The computer-use handoff rule requires the human to enter and submit new credentials. The reset form is preserved for later; mail links expire, so request a fresh capture if needed. The pending test does not block independent invitation/access testing with other verified fixtures.

## Case disposition

| Case | Status | Remaining scope |
| --- | --- | --- |
| ONB-016 | Partial, human step pending | Browser new-password field validation/correction; existing service tests cover token expiry/replay and limits |
| ONB-021 | Partial, human step pending | Added keyboard registration, login, workspace creation, profile changes, verification and recovery request; full keyboard reset and remaining layout/state matrix still incomplete |
| ONB-022 | Pass | Browser email change/reverification plus independent prior-session and old-address verification/recovery denial checked against current contract; sessions intentionally retained on email change |

The prior 19 passing cases retain their earlier evidence; ONB-022 adds one completed case. Full M01 acceptance and full PRD/release acceptance are not claimed. Independent M02 testing may proceed with the unmet M01 gate visible.
