# Complete screen mockups: coverage and verification

Reviewed on 18 October 2026. Scope: finish all remaining screen mockups, as explicitly clarified by the user. No application code, database schema, production account or external service was changed for this task.

## Design coverage

The complete conversation preview is based on [PRD.md](../PRD.md), [UX-FLOWS.md](../UX-FLOWS.md) and [DESIGN.md](../DESIGN.md). Each screen uses synthetic company/employee/item data. Actions update preview memory only.

| ID | Visual design included |
| --- | --- |
| S01 | Sign-in, registration, email verification and recovery variants |
| S02 | Workspace creation and invitation acceptance |
| S03 | Company setup and configuration checklist |
| S04 | Company overview and employee task view |
| S05 | Searchable inventory and tracking-mode filter |
| S06 | Item/unit overview, custody, history, warranty/support and lifecycle |
| S07 | Add/edit item definition, category, tracking mode and specifications |
| S08 | Existing-stock entry with source, location and acquisition information |
| S09 | Employee custody and receipt/return actions |
| S10 | Item request form and request history |
| S11 | Direct or approved-request issue and physical handover |
| S12 | Receipt confirmation, discrepancy report and manager resolution |
| S13 | Employee return request and manager inspection/condition split |
| S14 | Source/destination stock transfer |
| S15 | Purchase request, estimate, purpose and approval route |
| S16 | Sequential purchase decisions and item-request approval |
| S17 | Supplier quotation comparison and budget-renewal state |
| S18 | Purchase-order selection/detail and formal document preview |
| S19 | Partial delivery, acceptance, rejection and receipt posting |
| S20 | Supplier invoice and external-payment records |
| S21 | Supplier return, replacement, credit and undelivered cancellation |
| S22 | Work orders, faults, preventive service and inspected completion |
| S23 | Account-based members, activation and pending invitations |
| S24 | Location, department and category variants |
| S25 | Supplier/service-provider contacts and supporting documents |
| S26 | Starter/custom roles, scope and purchase-approval policy variants |
| S27 | Physical stock count, discrepancy review and explicit adjustment |
| S28 | Inventory, custody, purchase, maintenance and consumable reports; CSV preview |
| S29 | Notifications, read state and task navigation |
| S30 | Simulated camera states and manual QR/reference lookup |
| S31 | Audit/activity records and related-item navigation |
| S32 | Profile and notification preferences |

The review toolbar provides screen selection, preview persona, shared exception-state selection and Reset demo. These are review aids outside the depicted product. The product shell provides the normal module navigation, company context, inbox and scanning. Mobile navigation is collapsible.

## Browser evidence

| Check | Observed result |
| --- | --- |
| All 32 screen groups, desktop | Rendered with visible headings and their intended content |
| All 32 screen groups, 390-pixel frame | Rendered; representative phone layouts visually reviewed |
| All 32 screen groups, 320-pixel frame | Rendered; narrow overview and access configuration visually reviewed |
| Mobile navigation | Menu expanded successfully; company context remained visible |
| Registration/verification/company creation | Sample account proceeded through verification and immediate company creation to setup |
| Shared states | Empty, No access, Loading and Connection error examples appeared; Try again restored normal content |
| Existing stock and custody | Existing-stock entry, direct handover, employee confirmation, inspected partial return and location transfer updated the sample records |
| Purchasing | Invalid accepted quantity was blocked; partial receipt preserved rejected/undelivered quantities; supplier replacement resolution worked |
| Approvals | Requester self-approval was blocked; sequential decisions, over-budget quotation reapproval and order issue worked |
| Invoice/payment | Invoice and payment record actions worked without transferring money |
| Maintenance | Seeded service work completed and restored the affected sample quantity |
| People/company administration | Invitation preparation, location creation and contact creation worked locally |
| Custom roles and policy | A custom role started without permissions; permission controls and purchase rules saved in preview |
| Stock count | Submitting a count left stock unchanged; reviewed correction explicitly adjusted it |
| Reports/profile/notifications | CSV preview, profile save and mark-as-read actions worked |
| Employee variants | Restricted administration view, own custody selector and fault report without company service-cost controls were reviewed |
| Lifecycle | Retirement updated the sample lifecycle quantity and item history |
| Source checks | Script syntax valid, 32 unique screen renderers, fragment below 1 MB; documentation links checked |

## Boundaries

This is a connected design prototype, not an implemented service. It does not establish backend authorization, concurrency safety, database persistence, file-storage behavior or production readiness. Role previews illustrate intended visibility and never replace server-side enforcement.

Email delivery, camera scanning, file attachments, supplier communication, verification/recovery and payment actions are simulated. CSV export produces an inspectable text preview. Files are not uploaded, messages are not sent, camera permission is not requested and money is not transferred. Navigation may be remembered by the conversation; sample business records reset when the preview is reloaded or Reset demo is used.

The action walkthroughs use representative sample records and transitions. They are not exhaustive business-rule tests. Date/currency data are illustrative; detailed batch allocation, individual-unit intake, quantity precision, invoice reconciliation, approval revision and operational recovery rules still need implementation design in their respective stages. Dark-theme color pairs are defined; the visual browser review recorded here used the active light theme. A formal accessibility audit was not performed.

The production application and earlier uncommitted work were preserved. Follow [IMPLEMENTATION.md](../IMPLEMENTATION.md) when separately implementing the agreed product.
