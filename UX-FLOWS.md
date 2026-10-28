# User journeys and screen specifications

Design draft: 18 October 2026. Based on the accepted [product requirements](PRD.md). These are proposed screen structures and interaction rules, not implemented screens or additional approved product requirements. [DESIGN.md](DESIGN.md) supplies the visual foundation.

## 1. Navigation and shared shell

Use one application shell with workspace selection, notifications, profile and a clearly labeled Scan action. Desktop uses a sidebar; mobile uses a compact header and expandable navigation. Keep the selected company visible during every action. Switching company must leave a clean context; prompt about unsaved input before abandoning it.

Navigation is capability-driven, including custom roles. Persona examples below explain intended access, not hardcoded role checks.

| Area | Screens | Typical audience |
| --- | --- | --- |
| Home | My tasks, attention dashboard, recent activity | Everyone, with scoped content |
| My items | Custody list, handover confirmation, return request, fault report | Employees |
| Requests | Request an existing item, my requests, purchase request | Employees and managers |
| Approvals | Pending decisions, request/order detail and history | Eligible approvers |
| Inventory | Register, item detail, individual units, batches, issue/return, transfers | Authorized inventory staff |
| Purchasing | Purchase requests, quotations, orders, receipts, invoices/payment records | Authorized purchasing staff |
| Maintenance | Faults, work orders, schedules, warranty/support | Authorized service staff |
| Stock checks | Check sessions, count entries, discrepancies and adjustments | Authorized inventory staff |
| Reports | Inventory, custody, purchasing, maintenance and usage exports | Authorized reporting users |
| Company | People/invitations, locations, departments, categories, suppliers/providers, roles, approval rules, audit | Appropriate management capabilities |

Employees see personal tasks and requestable items rather than unrestricted stock, supplier pricing or company reports. A request catalog needs only requestable descriptions, category and unit; permission to request does not imply permission to inspect individual units or costs. This catalog behavior is a proposed UX detail.

## 2. Reusable screen patterns

- Lists: title and one primary action, visible filters, result count, records, pagination, meaningful empty state. Keep personal and management views recognizable without duplicate modules.
- Record details: name/reference, separate status labels, primary next action, summary, related records, attachments and history. Use permission-filtered sections.
- Transaction forms: identify people/items and location, enter quantities/details, review consequences, then submit an explicitly named action such as Record handover or Accept delivery.
- Approval detail: read the request and selected quotation, see approved versus proposed amount, current approver, prior decisions and reason fields. Approval controls appear only for the current eligible step.
- Small actions use a focused dialog; multi-line purchasing, receiving and physical counts use full pages. Modal actions restore focus to the trigger.
- Every mutation returns a reference and next state. If submission outcome is uncertain, offer to check the record before attempting another write.

## 3. Screen inventory

Screen IDs describe design surfaces; multiple IDs can share components or a page with tabs. They are not URL or API contracts.

| ID | Screen | Key content and primary action |
| --- | --- | --- |
| S01 | Sign in, registration and verification | Account fields, email verification status, resend/recovery states |
| S02 | Workspace entry | Create company or accept invitation; invitation identity and expiration |
| S03 | Company setup | Company details; locations/departments/categories; invite colleagues; setup progress |
| S04 | Home and tasks | Scoped approvals, receipt confirmations, overdue returns, maintenance/warranty attention; open a task |
| S05 | Inventory register | Tracking-mode/category/location filters; unit/quantity summaries; add item |
| S06 | Item and unit detail | Identity, quantities or serial/tag, location/custody, batches, warranty/support, cost-permission section and history |
| S07 | Add/edit item | Category, tracking mode, unit, relevant specifications, image; save item definition |
| S08 | Stock receipt or opening balance | Existing-stock reason/source or linked accepted purchase receipt, quantity/individual identities, location and batch; record stock once |
| S09 | My items | Issued units/quantities, receipt state, due dates, return/fault actions |
| S10 | Request item and request detail | Item, quantity, destination/use, loan dates where needed; submit and track request |
| S11 | Issue/handover | Approved request or direct issue, active recipient, available units/batches, source, due date, condition; record handover |
| S12 | Confirm receipt/dispute | Expected items, issuer, quantities and condition; confirm or report a discrepancy |
| S13 | Return and inspection | Outstanding custody, physically received quantities, condition split, notes/photos; finalize inspected return |
| S14 | Transfer | Source/destination, units/batches/quantity, reason, summary of affected stock; record transfer |
| S15 | Purchase request | Requested lines, reason, required date and estimate; submit for approval |
| S16 | Approvals inbox/detail | Current tasks, approved budget, quotation/order changes, decision history; approve or reject |
| S17 | Quotation comparison | Supplier offers, price/currency, delivery, warranty/support and attachments; select quotation |
| S18 | Purchase order list/detail | Supplier, ordered lines, terms, approval state, receipts, invoices, outstanding obligations; issue order |
| S19 | Receive/inspect delivery | Ordered/previously received quantities, actual delivery, accepted/rejected split, unit identities/batches and locations; post receipt |
| S20 | Invoice and payment records | Order/receipt references, charges, total/currency, invoice attachment, recorded payments; save invoice or payment record |
| S21 | Supplier return/order resolution | Affected receipt/lines, physical stock impact, reason and replacement/credit/cancellation resolution; record resolution |
| S22 | Fault and maintenance work | Item/quantity, problem, responsible internal employee or provider, schedule, progress, cost and outcome; assign or complete work |
| S23 | People and invitations | Account/membership state, role/scope, outstanding custody and invitations; invite or manage membership |
| S24 | Locations, departments and categories | Hierarchy, stock summaries, category fields and units; manage company structure |
| S25 | Suppliers and service providers | Contacts, specialties, support links, contracts and related purchases/jobs; manage contact |
| S26 | Roles and approval rules | Capabilities, scope, sequential amount rules, approvers and optional final-order approval; review/save configuration |
| S27 | Physical stock check | Scope/location, recorded baseline, observed counts, discrepancies, correction review; submit count/apply authorized adjustments |
| S28 | Reports and export | Report selector, scope/date/currency filters, rows, totals and CSV export |
| S29 | Notifications | In-app tasks/updates, read state and authorized deep links |
| S30 | QR scanner | Camera permission, scan result and manual lookup; open authorized context |
| S31 | Audit/history view | Scoped actor, action, time, target and changes; inspect a related record |
| S32 | Account profile | Personal details and account preferences |

Opening balance is a proposed operational entry path for equipment a company already owns, not a bulk import feature. It must retain source/reason, acquisition evidence where known, and audit history. A received purchase must not also be entered as an opening balance.

## 4. Journeys

### J01. Company starts and invites an employee

Actor: company creator, then invited employee. Screens: S01 -> S02 -> S03 -> S23 -> S02 -> S04.

The creator verifies email, creates a company immediately, and sees a setup checklist. Recommend a short initial setup with optional configuration completed later. The owner invites a colleague and chooses role/scope. The colleague signs in or registers using the invited identity, accepts membership and reaches their scoped task view. Pending invitees cannot be selected as active recipients.

Handle expired invitations, wrong signed-in identity, verification resend and users already belonging to another company. Never grant access based only on a matching email domain. Preserve the existing company's records during workspace switching.

PRD evidence: A01-A03.

### J02. Manager adds existing equipment

Actor: authorized inventory manager. Screens: S05 -> S07 -> S08 -> S06.

Choose category and tracking mode. A laptop receives an individual asset identity; a pooled pan item uses quantity and unit; disposable plates use consumable stock. Save the definition, then record existing stock with location, source/reason and batch/acquisition details where known. An item definition with no stock is valid; it must not imply availability.

On the detail screen, show individual units separately from pooled quantities. Keep condition, location and custody distinct. The same category can support different tracking modes; protect tracked history from casual mode changes.

PRD evidence: A04-A05.

### J03. Employee requests two reusable pans

Actors: employee and authorized manager. Screens: S10 -> S16 -> S11 -> S12 -> S09.

Employee requests 2 pans. Manager approves the request, then separately selects available quantity/batch and records physical handover. Stock becomes 8 available and 2 issued from an original 10. The employee sees a receipt-confirmation task for 2 pans and confirms or reports an incorrect quantity/condition.

Approval alone does not record a stock movement. Proposed first-release behavior: approval is permission to issue, not a guaranteed reservation; recheck availability at handover. If availability changed, explain what is available and retain the request for a deliberate decision. Do not silently short-issue a request.

A dispute remains linked to the original handover until an authorized resolution accounts for physical units. Retrying confirmation must not duplicate inventory changes.

PRD evidence: A05-A07.

### J04. Manager directly issues items

Actors: authorized manager, recipient for reusable items. Screens: S05/S06 -> S11 -> S12/S09.

The manager chooses Record issue, selects an active employee, chooses units/quantity and source, and reviews the resulting availability before recording the handover. Reusable items require employee confirmation. Consumable issue finishes with a record and stock reduction without a return obligation or receipt-confirmation task.

Example consumable issue: 100 disposable plates minus 20 issued leaves 80 in stock. Preserve recipient and issuer history even though no reusable custody balance is created.

PRD evidence: A04-A06.

### J05. Partial return, damage and repair

Actors: employee, receiving manager, service employee/provider. Screens: S09 -> S13 -> S22 -> S06.

An employee with 2 pans asks to return 1. A request alone does not increase available stock. The manager physically receives 1, records condition and inspection, and leaves 1 outstanding with the employee. If damaged, the returned pan remains unavailable; a repair work record references that quantity and batch. On completion, an inspected usable outcome restores availability. Unsupported assumptions about which physical unit was repaired must not be added to pooled history.

Managers can also record a physical return directly. Record physical receipt separately from inspection completion where inspection is delayed, so an item is not simultaneously listed with the employee and available on the shelf. Detailed custody transition rules are a design follow-up.

PRD evidence: A08 and A13.

### J06. Purchase and receive twenty pans

Actors: requester, approvers, purchasing staff, receiver, finance-capable staff. Screens: S15 -> S16 -> S17 -> S18 -> S19 -> S20.

Create the request with 20 pans and an estimate. Complete configured sequential approvals. Compare quotations, select supplier and create the order. Display approved budget beside the final amount; require renewed approval for increased amount/material scope change, and any configured final-order approval. Show an actionable blocking state if the requester is the only eligible approver; do not silently self-approve.

Issue the order and produce the formal supplier document. Record delivery of 12 pans: accept 10 and reject 2. Post 10 to the selected inventory location/batch exactly once. Order detail now shows 8 undelivered and 2 rejected awaiting resolution. Record invoice/payment references separately from physical stock.

S21 handles supplier returns, replacements, credits and cancellations without erasing receipts. A credit or payment entry does not itself create or remove physical stock. A paid invoice does not mean an order is fully delivered; a delivered order does not mean paid.

PRD evidence: A10-A12.

### J07. Transfer stock or manage off-site equipment

Actor: authorized manager. Screens: S06 -> S14 -> S06/S09.

Select source and destination, item/units/batch, quantity and reason. Display availability and affected locations before submission. Confirm permission for both sides. Record the move in history and update both quantities consistently. Off-site use retains employee custody and company ownership; it does not become a separate company.

Physical dispatch/arrival states for shipments between branches need detailed transition design before implementation. A source-to-destination transfer must not create two available copies of the same stock.

PRD evidence: A09.

### J08. Fault, scheduled maintenance and warranty

Actors: employee and service manager. Screens: S09/S06 -> S22 -> S25 -> S06.

Report a fault with description/photo and affected item/quantity. The service manager reviews warranty/support details and chooses an internal employee or external provider contact. Schedule and track work, record dates/costs/documents and finish with an explicit outcome. Only affected stock becomes unavailable. Planned maintenance follows the same work record with a scheduled trigger rather than an employee fault report.

A provider contact has no login or permission to company records. Purchasing and service contacts may refer to the same company without implying shared access.

PRD evidence: A13-A14.

### J09. Count inventory and inspect reports

Actor: authorized counter and adjustment/reporting staff. Screens: S27 -> S31 -> S28.

Choose location and scope, record observed units/counts, review differences and submit the check. Applying an authorized correction is a separate, explicit action with reason and audit record. Handle movement during the count through a defined snapshot/reconciliation policy; never silently overwrite current stock using an old count.

Reports filter location/category/date and currency as appropriate. Separate ordered, received and paid totals. Export respects the exact viewer's access, including hidden cost fields. Do not combine pans, litres and laptops into an unexplained quantity KPI.

PRD evidence: A15.

### J10. Scan a label and resolve a task

Actor: any authorized employee. Screens: S30 -> S06/S09, or S29/S04 -> the relevant detail screen.

User starts Scan, grants camera permission and opens the corresponding item or unit. Manual lookup remains available for denied permission or unsupported camera access. After sign-in, preserve the intended reference but verify company/membership before showing details. A label or notification never bypasses authorization.

If a task is already completed, show its current outcome instead of another active action. If access has been revoked, show a clear access state without leaking item details. Email failure leaves the in-app task and business record intact.

PRD evidence: A03, A14 and A16.

## 5. Key screen compositions

### Home

Header: company and user context. First section: tasks requiring the viewer's action. Main content: scoped overdue returns, maintenance/warranty attention and recent activity. Employees lead with Confirm receipt, My items and My requests; managers lead with approvals and operational exceptions. Metrics must have explicit scope and units; avoid decorative totals.

### Inventory and item detail

Register columns: item/name, tracking mode, category, location summary, availability, attention state and permitted actions. A grouped item opens detail with quantity breakdown by location/batch and current custody. An individual unit opens its tag/serial, custodian and condition. Separate warranty/support, history, files and permission-protected costs into clear sections. One generic status must not replace custody, condition and availability.

### Handover and return

Use a compact sequence: person and stock -> quantity/condition/dates -> review -> recorded result. Make the source location and available quantity visible alongside the entered quantity. The return form starts from outstanding custody and requires a condition breakdown. Display the expected resulting balance before posting.

### Purchasing workspace and order detail

Purchasing list groups requests, quotations, orders, receipts and invoices with links to related records. Order detail leads with next action and separate approval, delivery and payment summaries. Show ordered, accepted, rejected, outstanding and cancelled quantities per line. Provide formal document download and a traceable issued state. Do not simulate sending until the eventual delivery mechanism reports a real outcome.

### Maintenance and stock check

Maintenance list shows affected items, quantity, responsible person/provider, due date and work status. Work detail connects fault, warranty, repair expenses and outcome. Stock checks prioritize location and count-entry controls, then discrepancy review. Both support photographs and audit history without making users re-enter the same asset identity.

## 6. State and interaction rules

| Situation | Required experience |
| --- | --- |
| New company has no data | Setup checklist and permitted next action, not broken charts |
| Filters return no results | Explain no matches and allow clearing filters |
| No active membership | Create/accept-workspace paths where eligible; no other-company data |
| Validation error | Inline field error, preserved input, focus on error summary |
| Insufficient quantity or concurrent change | Refresh relevant stock, explain conflict, require review before retry |
| Network timeout after mutation | Show uncertainty and check resulting record before offering resubmission |
| Permission revoked | Block further actions, clear restricted views and show safe recovery navigation |
| Approver unavailable/self-approval blocked | Visible pending/blocking reason and authorized reassignment/escalation path |
| Pending employee confirmation | Persistent task and status; no automatic confirmation |
| Files or notification delivery fail | Business outcome remains explicit; retry attachment/delivery without repeating movement |
| Destructive correction, loss or retirement | Identify affected items/quantity, explain consequences, collect reason and retain history |
| Mobile or keyboard use | Reach every primary action; stacked forms, readable records, visible focus and usable dialogs |

Use explicit labels such as Record handover, Confirm receipt, Record inspection and Record payment. Do not use a generic Done button for materially different business transitions. Receiving, payment and approval status must remain separately visible.

## 7. Relation to existing application

Existing routes in client/src/App.jsx provide login/registration, dashboard inventory, add/edit product, profile, users, statistics and access management. These can inform implementation reuse; they are not a ready-made navigation plan for all new workflows. The current inventory register, forms, profile and access shell will evolve. Preserve working route compatibility until a migration is deliberately designed.

The following are design defaults, not newly approved business policies: minimal onboarding checklist, requestable catalog exposure, opening-balance entry, approval without guaranteed reservation, dialog/page choices and navigation grouping. Detailed design still needs unit precision/batch allocation, physical branch shipment and return inspection transitions, approval fallback/rule revisions, invoice reconciliation and notification timing. Use PRD boundaries and raise only consequential decisions at the relevant implementation stage.

## 8. Coverage and review order

| PRD scenarios | Journeys | Key screens |
| --- | --- | --- |
| A01-A03 | J01, J10 | S01-S04, S23, S26, S29-S32 |
| A04-A05 | J02-J04 | S05-S12, S24 |
| A06-A08 | J03-J05 | S09-S13, S16, S22 |
| A09 | J07 | S06, S09, S14, S24 |
| A10-A12 | J06 | S15-S21, S25-S26 |
| A13 | J05, J08 | S06, S13, S22, S25 |
| A14 | J08, J10 | S04, S16, S22, S29 |
| A15 | J09 | S27-S28, S31 |
| A16 | J10 | S06, S09, S30 |

Review the shell and Home first, then inventory and handover/return, then procurement and receiving, then maintenance/reports/admin. Every accepted module stays in the first-release plan. Visual mockups should use synthetic examples clearly identified as such; they do not constitute a tested or implemented workflow.

## 9. Mockup completion

All 32 screen groups now have connected visual mockups in the complete conversation preview. Screen-level variants include authentication/recovery, company structure tabs, item lifecycle, maintenance/fault forms, approval rules, reports and shared exception states. They remain design proposals for review. [Coverage and browser verification](docs/MOCKUP-VERIFICATION.md) records what was checked; application implementation remains separate work.
