# Product requirements: AssetOS

Version: 1.0 product scope, agreed on 18 October 2026.

Status: This document records the product scope accepted in discussion. It defines the intended first release; it does not claim these features are implemented. Detailed screen designs, schema changes and interfaces follow this document.

## 1. Purpose and audience

AssetOS is a service for multiple companies to manage purchases, reusable equipment and consumable stock. Each company has an isolated workspace with its own people, locations, categories, permissions and workflows. Categories are configurable: the product must accommodate IT equipment, kitchen equipment and other organizational items.

Product promise: know what the company owns, where it is, who is responsible, what it costs and what needs attention.

The immediate objective is a credible, complete working product demonstrating real business workflows. The longer-term objective is commercialization. The first release includes procurement, inventory, custody and maintenance as connected workflows.

## 2. First-release scope

| Area | Required outcome |
| --- | --- |
| Company onboarding | Verified users immediately create their own workspace without platform-owner approval |
| Employees and access | Login accounts for every employee, invitations, starter/custom roles and scoped permissions |
| Inventory | Individually tracked reusable assets, quantity-tracked reusable stock and consumables |
| Locations | Flexible hierarchy, multiple branches, off-site custody and movement history |
| Custody | Employee requests and direct manager issues, reusable receipt confirmation, partial/full returns |
| Procurement | Purchase requests, amount-based approvals, quotations, orders, deliveries, inspection and invoice/payment tracking |
| Maintenance and support | Internal/external service work, preventive maintenance, repairs, warranties and provider contacts |
| Accountability | Damage/loss records, custody history, physical stock checks and audit history |
| Notifications | In-app and email notifications for actionable events and upcoming deadlines |
| Reporting | Inventory, custody, purchases, maintenance cost and consumable usage reports with CSV export |
| Access format | Responsive web application, QR labels and phone-camera scanning |

Full procurement belongs to this first release. Delivery stages in [IMPLEMENTATION.md](IMPLEMENTATION.md) order the work; they do not move accepted modules to a later release.

## 3. Company onboarding and employee lifecycle

- A person registers and verifies their email, then immediately creates a workspace and becomes its initial owner.
- Ownership of a new workspace grants no access to another company's records.
- The owner configures company details, locations, departments and item categories, and invites employees.
- Every employee has a login account. Do not introduce employee/custodian records without accounts. A pending invitation is not yet an active employee eligible to receive items.
- Employees join existing workspaces through invitations and verify their email before receiving assignments.
- A person can belong to multiple companies and switch workspace context. Permissions remain specific to each membership.
- Deactivating membership blocks access while retaining historical custody, purchases, approvals and audit records. Outstanding reusable items remain visible for recovery.
- Shared items may remain assigned to a department or location without an individual custodian.

## 4. Roles, permissions and scope

Provide company owner, administrator, asset manager and employee starter roles, plus company-defined custom roles and permissions.

| Starter role | Intended responsibility |
| --- | --- |
| Company owner | Controls the workspace and appoints administrators |
| Administrator | Manages company configuration, employees, access and company-wide operations |
| Asset manager | Manages inventory, requests, issues, returns and maintenance within assigned scope |
| Employee | Requests items, confirms receipt, views own items and reports problems |

Separate what a person may do from where they may do it. Scopes include the whole company, selected departments and selected locations; employees' ordinary custody access concerns their own items. Purchasing, approval, cost visibility, stock adjustments, maintenance and access management need distinct capabilities. A kitchen manager need not see IT assets or purchasing prices.

Only appropriately authorized people may grant access. Ordinary employees cannot expand their own permissions. Protect owner continuity and record access changes. Enforce company and object scope on every operation, including direct links, downloads, reports, notifications and QR lookups.

## 5. Inventory model

### Three tracking modes

| Mode | Example | Required tracking |
| --- | --- | --- |
| Individually tracked reusable | Laptop, refrigerator, individually tagged specialist equipment | Unique asset identity, location, custodian, condition, warranty, service and lifecycle history |
| Quantity-tracked reusable | Identical pans or chairs | Quantities by location, custodian, purchase batch and availability/condition; issue and return movements |
| Consumable stock | Cleaning liquid, disposable plates | Receipts, issues, consumption-related stock reduction, units of measure and replenishment information |

Choose a tracking mode when creating an item. A company may track a high-value pan individually rather than pooling it. Category and tracking mode are separate concepts.

Common information includes item name, category, relevant specifications, photos/documents and organizational context. Individual units and purchase batches carry applicable acquisition, warranty and support information. Category-specific fields accommodate different industries.

### Quantities and movement

- Keep location, custody, condition and lifecycle separate. An item can be with an employee, off-site and awaiting repair at the same time.
- Distinguish available, issued, awaiting inspection, damaged and under-maintenance quantities. Lost, consumed or disposed quantities remain explainable through history without being counted as available stock.
- Reusable issue changes availability and custody, not the number originally acquired. Consumable issue reduces stock and does not normally create a return obligation.
- Every quantity change records item, quantity/unit, source/destination where applicable, actor, time, reason and supporting workflow.
- Prevent negative stock, over-issuing and duplicate stock changes from repeated submissions. Concurrent issues must not allocate the same available units twice.
- Preserve separate purchase batches with supplier, date, quantity, unit cost and warranty. Later purchases must not overwrite earlier acquisition details.
- Repairs and partial returns affect only the relevant units or quantity. Damaged returns do not immediately become available.

Example: 10 pans available; 2 issued to an employee leaves 8 available and 2 with the employee. Returning 1 usable pan leaves 9 available and 1 outstanding. If that returned pan is damaged, it remains unavailable until disposition is recorded.

## 6. Locations and transfers

Support a flexible company -> site/branch -> building -> floor -> room/storage structure. Companies can omit unnecessary levels. A small restaurant may use Restaurant -> Kitchen; a larger company may use Mumbai -> Building A -> Floor 2 -> Meeting room.

Quantities can be split across locations. Transfers record source, destination, quantity or individual units, actor and time. Off-site custody, including employee home use, retains company ownership and the responsible employee. Location-based access applies consistently to these movements.

## 7. Requests, issues and receipt confirmation

### Both issue paths

1. Employee request: employee requests an item/quantity, an authorized manager approves, and the manager records physical handover.
2. Direct issue: an authorized manager selects employee, item and quantity and records physical handover without a preceding employee request.

Approval and handover are separate events. Decrease available stock when physical handover is recorded. Capture recipient, issuer, item/unit or quantity, time and source location. Support long-term assignments and temporary loans with expected return dates where applicable.

### Employee confirmation

- Reusable items require employee confirmation after handover, including direct issues and quantity-based issues.
- Employees can confirm or report wrong quantities, damage or items not received.
- Keep handovers visibly awaiting confirmation or disputed until resolved; lack of response does not imply receipt.
- A disputed handover retains its history. Resolution explicitly accounts for physical units and custody rather than silently restoring stock.
- Consumables do not require employee receipt confirmation; the authorized issuer's record is sufficient.

## 8. Returns, damage, loss and stock checks

Support partial and full reusable returns. Managers inspect returned items and record received quantity and condition before releasing usable items to available stock. Keep outstanding quantities visible. Capture damage/loss notes, photos and history, and route repairable items into maintenance when appropriate.

Physical stock checks compare recorded inventory with observed items or quantities by location. Record missing, unexpected and mismatched items and retain checking history. Corrections require authorized, traceable adjustments; do not silently replace balances with observed counts.

Maintain lifecycle history through retirement/disposal. Financial liability or automatic salary deductions for lost/damaged items are outside this scope.

## 9. Full purchasing workflow

### Request, quotation and order

1. Employee submits requested items, quantities, business reason, required date and estimated budget.
2. Configured approvers review the request and budget.
3. Authorized purchasing staff record/upload supplier quotations and compare cost, delivery, warranty and support terms.
4. Purchasing selects a supplier and creates a formal purchase order with agreed items, quantities, prices and terms for delivery to the supplier.
5. Retain the relationship between request, approval, quotations, selected supplier and order.

Supplier delivery method (for example, downloadable order or outbound email) will be specified during screen/integration design. The workflow must support communicating a formal order; it must not imply an external supplier portal exists.

### Configurable purchase approvals

- Start with a simple one-approver configuration; companies can define sequential chains based on purchase amount in their configured currency.
- Select approvers by role and relevant organizational scope. Show the requester progress, pending approval step and rejection reasons.
- No requester self-approval. An eligible alternate or configured escalation handles the request; unresolved routing blocks progression rather than bypassing approval.
- Separate approval of the need/estimated budget from approval of the final price.
- An authorized purchaser may issue an order within the approved amount and scope unless the company requires final-order approval.
- Exceeding the approved amount or materially changing the approved purchase requires renewed approval before issue.
- Companies may require finance approval for every final purchase order.
- Thresholds shown in discussion were examples, not prescribed product defaults.

Example: a refrigerator request approved for 30,000 can proceed at a selected quotation of 28,000 if scope is unchanged and no additional final-order approval is configured. A quotation of 35,000 requires renewed approval.

### Delivery, inspection and stock creation

Support partial deliveries and record accepted, rejected and damaged quantities separately. Only accepted receipts increase usable stock or create usable individual assets. Link each receipt to its order and acquisition batch; prevent duplicate receiving.

Example: order 20 pans; receive 12, accept 10 and reject 2. Available stock increases by 10. Show 8 not yet delivered and 2 rejected awaiting explicit replacement, credit or cancellation resolution. Do not treat the order as fully satisfied.

Support order cancellation, outstanding quantities and supplier returns with traceable resolution. Prevent cancellation from silently deleting delivered items or completed financial/history records.

### Invoices, costs and payment records

Link invoices to orders and receipts. Record supplier, currency, quantities, unit prices, applicable taxes/charges, delivery charges, documents and payment status/references. Preserve purchase costs and subsequent maintenance expenses so reports explain acquisition and repair spending.

Payment tracking records payments made through the company's payment process. Executing bank/card transfers, general-ledger accounting and automated depreciation are separate future scope. Do not aggregate unlike currencies into a misleading total; currency conversion policy is a detailed design decision.

## 10. Maintenance, warranties and support

- Employees report faults against items they use. Managers schedule preventive maintenance and arrange repairs.
- Support internal employees and external service providers. Internal staff have login accounts; external providers are contact records initially and do not need accounts.
- Provider information includes company/name, phone/email, service specialties and related contracts.
- Work records include affected item or quantity, problem, responsible employee/provider, schedule, work dates, costs, attachments and outcome.
- Items undergoing maintenance are unavailable; for quantity-based items, remove only the affected quantity from availability. Return repaired items through an explicit completion/inspection outcome.
- Store warranty dates, coverage information, supplier/manufacturer or service-provider contacts, support links and contract documents against the appropriate unit or batch.
- Preserve repair and warranty history when stock moves or staff leave.

## 11. Notifications and attention dashboard

Provide both in-app and email notifications for approval tasks/results, reusable receipt confirmations, overdue returns, maintenance deadlines and upcoming warranty expiry. The dashboard surfaces actionable work and overdue/pending items within the viewer's access.

Notify responsible recipients, scope every notification to its company and avoid disclosing restricted cost or asset information. Notification delivery failure must not lose the underlying request, approval or inventory transaction. Reminder timing, preferences and delivery/retry behavior will be specified during detailed design.

## 12. Reports, exports and physical access

Reports cover inventory/availability by category and location, employee custody and overdue items, purchases and costs, maintenance spending and consumable usage. Support CSV export with the same row and field permissions as the screen. Report the basis of each cost total and preserve currency distinctions.

The first release is a responsive web app usable on phones and computers. Provide QR labels and phone-camera scanning to reach authorized item information or actions. A QR code does not grant access. Include manual lookup when camera access is unavailable. Review forms, tables, scanning and actions at mobile sizes and with keyboard navigation.

## 13. Cross-cutting acceptance requirements

- Enforce company isolation for records, attachments, exports, notifications, searches and direct identifiers. Workspace switching never combines data accidentally.
- Read current access for sensitive actions and ensure deactivation/revocation takes effect on subsequent requests.
- Preserve transactional consistency between workflow state, quantities, custody and audit history. Guard duplicate actions and concurrent updates.
- Validate required fields and quantities; provide understandable loading, empty, denied, validation, success and failure states.
- Keep history of actors, times, decisions and meaningful changes. Corrections must be explainable.
- Preserve authorized private file delivery and explicit cleanup/recovery behavior.
- Verify keyboard usability, readable light/dark presentation and responsive behavior. Accessibility is an acceptance requirement, not a completed audit claim.
- Define expected volumes, performance targets, retention and hosting/backup procedures before production release; none have been measured or agreed yet.

## 14. Release acceptance scenarios

| ID | Scenario | Observable result |
| --- | --- | --- |
| A01 | Verified user creates a company | Immediate access as owner, with no access to another company |
| A02 | Invited employee accepts; membership is later deactivated | Account-based participation; access revoked while custody/history remain |
| A03 | Kitchen manager has limited scope and no cost permission | Can perform granted kitchen work; cannot read restricted assets or costs through screens, direct links or exports |
| A04 | Company adds a laptop, pooled pans and disposable plates | Each follows its selected tracking mode; category-specific information remains usable |
| A05 | Two managers issue the last available reusable unit concurrently | At most one successful allocation; no negative quantity or duplicate custody |
| A06 | Employee requests reusable items and another receives a direct issue | Both produce handovers and employee confirmation tasks |
| A07 | Employee disputes quantity/condition | Dispute stays visible with history until authorized resolution accounts for the items |
| A08 | Employee returns one of two pans, damaged | One remains outstanding; returned damaged pan is unavailable pending disposition |
| A09 | Stock moves between branches; laptop is used off-site | Quantities and custody remain traceable and company-scoped |
| A10 | Final purchase amount exceeds approved budget | Order cannot be issued until required renewed approvals complete; requester cannot self-approve |
| A11 | 20 ordered, 12 delivered, 10 accepted, 2 rejected | Stock increases by 10 once; 8 undelivered and 2 rejected remain explainable |
| A12 | Supplier return or cancellation follows a partial receipt | Stock, outstanding order obligations, invoice links and history remain consistent |
| A13 | Internal or external repair affects 2 of 10 pooled items | Only affected quantity is unavailable; provider, cost, warranty and completion are recorded |
| A14 | Approval or deadline requires attention | Authorized recipients have in-app/email notifications; delivery failures do not undo business records |
| A15 | Stock check finds a mismatch and a report is exported | Discrepancy and authorized correction are traceable; export respects access and cost permissions |
| A16 | Employee scans a QR code on a phone | Authorized context opens; another company's/private data remains inaccessible |

These scenarios are release requirements, not test results. Record evidence when implemented.

## 15. Existing implementation versus target

The previously inspected repository contains registration/login, organization selection, asset CRUD/search/filter/pagination, overview, QR downloads, profile editing, directory, dynamic access management, assignment history, audit and authorized files. See [README](README.md) and [RBAC implementation](docs/RBAC-IMPLEMENTATION.md) for that baseline.

The baseline uses operator provisioning for the first owner and does not establish the self-service onboarding described here. Existing department/organization permissions do not establish the new location-scoped model. Existing product records and QR downloads do not establish pooled stock, procurement or camera scanning. Reuse working capabilities, verify them, and implement the gaps explicitly.

[API.md](API.md), [DATABASE.md](DATABASE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) describe current technical behavior. Evolve them as features are designed and delivered. This PRD is authoritative for intended scope, not for what an existing endpoint already does.

## 16. Boundaries and remaining detailed design

Native mobile apps, subscription billing, SSO/MFA, supplier login portals, GPS tracking, automated payments, full accounting/depreciation and broad third-party integrations are outside the agreed first-release scope. Bulk import was proposed earlier but not explicitly resolved; CSV export is accepted. Do not silently treat an import subsystem as a release requirement.

Detailed design must resolve units/fractional quantity rules, tracking-mode conversion and batch allocation; approval fallback and rule-change behavior; financial rounding/currency treatment and receipt/invoice discrepancy handling; reminder schedules; and production volume/retention/recovery targets. These do not reopen the accepted product direction. Use conservative, documented defaults where appropriate and raise only consequential unresolved business choices when designing the affected workflow.
