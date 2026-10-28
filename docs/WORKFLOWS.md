# Workflow rules

Implementation rules, updated 19 October 2026. These describe the accepted [PRD](../PRD.md). Protected ownership/settings, account verification/recovery/session revocation and encrypted local delivery now have [runtime evidence](IDENTITY-DELIVERY-VERIFICATION.md). Workspace/invitation transitions are now delivered; business transitions below remain planned; [backlog](IMPLEMENTATION-BACKLOG.md) records delivery status. Read with [database design](../DATABASE.md), [permissions](PERMISSIONS.md) and [planned API](openapi-planned.json).

## Shared command rules

Every posted command rechecks current membership and capability scope, takes the organization lock and affected record locks, checks expectedVersion, and commits state, inventory entries, audit and notification events together. A version conflict requires reload/review. Exact decimal quantities must fit the item's unit precision. Posted documents are corrected through linked compensating records, never rewritten or deleted.

An Idempotency-Key identifies one actor's intent for one operation in one company. Store a canonical request hash and durable result pointer. Same key and payload returns the committed result; different payload returns IDEMPOTENCY_MISMATCH. A rolled-back transaction has no committed result and can be retried with the same key. A duplicate arriving while the first transaction is pending waits within a bounded timeout, then returns COMMAND_IN_PROGRESS with retry guidance. A lost response is recovered through command lookup with the same operation/key; cached response expiry never permits a second posting. Authorization is checked again before returning a previous result. Account-only commands use account context; anonymous recovery requests use rate limiting and generic responses instead of an authenticated command lookup.

No transition calls email/storage providers while holding inventory locks. Business completion and delivery completion are separate outcomes. Every transition records actor, time, reason where applicable, previous/current revision and source command.

## W01. Account, workspace and membership

B04 now implements the workspace/invitation transitions below; [onboarding verification](WORKSPACE-ONBOARDING-VERIFICATION.md) records the local evidence. Existing legacy provisioning APIs remain restricted to authorized administrators for compatibility. First-release location/custody/task-routing extensions remain in their owning slices.

Account verification: unverified -> verified through a recipient-bound, unexpired, single-use token. Resending revokes superseded tokens. Public recovery always returns a generic accepted result; a successful reset consumes the token, changes the password and increments session_version. Authentication compares current session version; old tokens lacking the claim mean version 0 during the transition, not a verification bypass.

A signed-in verified account creates a workspace atomically with its active membership, protected ownership, starter roles and initial grants. A replay creates one company. New ownership grants no existing-company access. Registration itself still grants nothing. Company setup may be incomplete without blocking access to the new company.

Invitation: pending -> accepted, revoked or expired. Acceptance requires the matching verified email/account and rechecks the inviter's current authority and proposed grants. Grant/scope edits revoke/reissue the invitation. Acceptance creates/reactivates the membership only through explicit authorized policy; an invitation cannot silently override an active membership's existing grants. Existing active member invites are rejected with a useful conflict. Reactivation of a deactivated member is an explicit membership-management action, not implicit invitation acceptance.

Deactivation blocks access and new handovers, cancels future task routing to that membership and retains outstanding custody/history. It does not return stock. Protect the last active owner and the existing last access administrator independently. Ownership transfer adds the eligible new owner before removing an old one under the same lock. Legacy owner mapping and email verification are reviewed migration steps, not inferred from role names.

## W02. Catalog and acquisition

Catalog: active <-> inactive. Item mode and base unit become immutable after any stock posting. Category field changes preserve historical values, validate future writes and flag incompatible records; they do not destroy unknown legacy attributes. Archive blocks new acquisition/issue, while returns, repair resolution and historical reads remain possible.

Opening-stock draft -> posted or cancelled. Posting requires an explicit existing-stock reason, date, location, quantities/units, lot details and optional known cost. Opening stock is not a substitute for procurement receiving. Individual lines require one identity/tag per unit. Tags are company-unique; serials need not be. Corrections reference the original posting and use the adjustment workflow.

Available inventory comes only from posted opening stock, accepted procurement receipts, inspected usable returns/repairs/transfers or reviewed positive corrections. A metadata edit never changes balances. Unknown purchase price/warranty remain unknown. A later receipt produces a new lot rather than overwriting an older acquisition.

## W03. Requests, handovers and confirmation

Item request: draft -> submitted -> approved or rejected; requester may cancel before handover. Approved requests become partially_fulfilled or fulfilled through handovers; cancellation applies only to the remaining quantity. Approval authorizes the stated item/quantity/use/dates; it does not reserve stock or guarantee availability. Recheck actual stock at handover. An amendment after submission creates a revision and a new decision.

Handover draft -> posted or cancelled. A posted document has a separate confirmation dimension: awaiting_confirmation, confirmed, disputed, resolved or legacy_imported. Direct issues and approved-request issues use the same posting service. Recipient must be an active verified company member. Employee-to-department matching is not required; issuer must be authorized for the source stock and recipient context. Shared stock can remain in a department/location account without a personal handover.

For reusable stock, posting moves available -> custody, creates the return obligation and confirmation task. For consumables, posting moves available -> consumed and records recipient/purpose without a normal return obligation or confirmation task. A handover cannot mix tracking modes; this keeps confirmation and return behavior explicit. Repeated confirmation never issues stock again. Only the named recipient can confirm or dispute their receipt; managers cannot impersonate the employee.

A dispute records observed quantity/condition, reason and evidence while original custody remains unresolved. Resolution records one or more outcomes: recipient accepts original custody; issuer physically recovers stock through inspected return; verified handover correction reverses only the quantity proven never delivered; damaged quantity enters repair/inspection; missing quantity becomes an explicit loss record. Every affected allocation must be accounted for. Do not restore availability merely because an employee clicks Not received. The employee sees the resolution and can report a further issue without erasing the earlier dispute.

Temporary loans carry a due date; long-term assignments may omit it. Extending a due date is a versioned authorized amendment with audit/reminder update, not another issue. Membership deactivation does not close outstanding custody.

## W04. Return and inspection

Return draft -> received -> inspected/partially_inspected -> completed. A request to return is an intent; it does not change stock. An authorized manager records actual physical receipt against outstanding original allocations, bounded by unreturned quantity. Receipt moves custody -> inspection and reduces the employee's outstanding physical obligation once. It does not make the stock available.

Inspection splits received quantity into usable, damaged or retained-for-inspection; their sum must equal the received quantity. Usable moves inspection -> available. Damaged moves inspection -> damaged and may be taken into maintenance. Uninspected quantity stays unavailable. Correct a mistaken receipt with an explicit compensating command only if dependent movements allow it; otherwise require reconciliation.

Example: two pans issued from lot L, one returned damaged. The ledger leaves one in custody and one in damaged stock. Employee outstanding is one; available does not increase. A manager may record receipt and inspection in one UI submission, but both facts and their posting remain distinct within the transaction.

## W05. Transfers, loss and lifecycle

Transfer: draft -> dispatched -> partially_received -> completed; cancellation only before dispatch. Dispatch moves exact source allocations into in_transit. Destination receipt splits accepted/inspection/damaged quantities and leaves the remainder in transit. Receiver needs destination authority; dispatcher needs source authority and permission to create the movement to that destination. Reading both ends does not itself authorize both physical actions. Instant same-person relocation can perform dispatch and receipt atomically only with both capabilities/scopes.

Transit loss requires an explicit loss outcome and reason, not a short receipt silently closing the transfer. Same-company movement preserves lot, warranty and individual identity. Off-site location is separate from employee custody; moving an employee-held unit must preserve its responsible custodian until a return/reassignment is recorded. A transfer does not silently reassign an employee's obligation.

Lifecycle command records lost, retired, disposed or recovered outcomes for exact source allocations. Retirement makes stock unavailable but still company-owned; disposal and confirmed loss are separate terminal outcomes. Recovery of a lost item moves it into inspection and records whether the original custody obligation remains or is cleared. Block disposal/retirement of unresolved custody unless the command explicitly resolves that obligation with appropriate authority and reason. Never bill employees or execute salary deductions.

## W06. Purchase requests and approvals

Purchase request: draft -> submitted -> approval_pending -> approved/rejected; requester withdrawal before order commitment preserves the revision. Submitted lines/estimate/currency/department/destination are immutable in that revision. Changing them makes a new revision and approval instance. Quotes may be prepared earlier, but order issue requires current authorization.

At submission select a policy version for the exact currency and total estimate, snapshot ordered role steps and organizational scope, and retain the approved document fingerprint. Amount ranges must cover the relevant currency without overlaps/gaps; missing policy or eligible approver blocks progression with a visible routing reason. Sequential steps open one at a time. Approvers must currently hold the configured role and purchase.approve capability for the whole request scope. Requesters cannot approve their own purchase at any step. A sole owner must appoint an eligible alternate; there is no hidden self-approval exception. The same eligible non-requester may fill successive roles unless the company explicitly requires distinct people.

Approve/reject requires the current pending step/version. First valid concurrent decision wins. Rejection requires a reason and closes that instance. Reassignment/escalation must identify an eligible alternate, retain routing history and never bypass a required step. Revoked/deactivated approvers cannot act; existing decisions remain attributed historical facts. Policy edits create versions and do not rewrite active instances; explicitly restarting an active approval supersedes its old instance with a visible reason.

Final-order authorization is separate. A selected quote within the current approved amount and unchanged line scope may be issued by a purchaser unless policy requires final-order approval. Higher totals, changed items/quantities/currency/destination/terms materially affecting the purchase require a final-order approval instance for that exact revision. The approved request still establishes the need; final-order decisions authorize the changed commitment. Raising an amount then lowering it does not resurrect a superseded decision invisibly. Changed revision fingerprints invalidate prior final-order authorization.

Split orders share the same request budget and line quantities. Lock request commitment allocations at issue: the sum of active issued commitments must fit the approved quantities/budget plus explicitly authorized order-specific changes. A second order cannot reuse the full request allowance. Snapshot existing commitments in final-order approval context and revalidate before issue; a competing commitment can require renewed review. Superseded order revisions/decisions are not summed as extra authorization. Only an explicit eligible cancellation releases an unfulfilled commitment; a payment, credit or supplier return does not silently create a fresh budget.

A free-text requested item must specify a base unit. Before accepting its receipt, select/create a catalog definition with the matching approved unit/tracking/category scope; a material substitution requires renewed authorization. API detail responses include stable line IDs for quotations, receiving, credits and custody allocation references.

Compare quantities, unit price, tax, charges and delivery on a documented currency basis. No implicit currency conversion. Per-line totals are rounded using the currency's configured minor-unit rule, then declared tax/charge totals are added; persist the calculation inputs and result. Policy examples in the PRD are examples, not seeded thresholds.

## W07. Orders, delivery and supplier resolution

Order document: draft -> approval_pending/authorized -> issued -> closed; a wholly unreceived order may be cancelled with history. Operational summaries (partially_received, fully_received, replacement_pending) are derived from line obligations, not one overloaded editable status. Issued revision is immutable; amendments need a new reviewed revision, delta commitment and renewed authorization where material. Never reduce below already delivered quantities. Generate a formal downloadable order from the issued snapshot. Supplier email is optional delivery; its failure does not unissue the order. Contacts have no portal/login.

Delivery receipt: draft -> posted. Capture actual delivered quantity, accepted and rejected/damaged splits, original versus replacement obligation, location, individual tags and lot/warranty details. First-release receipt posting includes the inspection decision; an uninspected delivery can be saved as a draft but cannot become available. Rejected goods are recorded in a supplier-resolution holding record and excluded from usable company stock. Accepted quantity posts acquisition -> available exactly once. Rejected individual units do not get usable product identities unless later accepted. A corrected posted receipt needs compensating resolution, not a second ordinary receipt.

For each line retain original ordered quantity, agreed cancelled remainder, original delivered/accepted/rejected quantities, unresolved rejected goods, accepted goods later returned and replacement obligations/deliveries. Do not calculate outstanding merely as ordered minus accepted.

Example: 20 ordered, 12 delivered, 10 accepted and 2 rejected. Original undelivered is 8; usable stock is 10; rejected unresolved is 2. Supplier agreement to replace the rejected 2 creates a separate replacement obligation. Receiving those replacements can add 2 accepted without changing original ordered quantity. Receiving the remaining original 8 then yields 20 accepted. A rejected replacement can be replaced again without adding another original commitment.

Supplier resolution draft -> agreed -> dispatched/settled -> closed as applicable. It explicitly identifies rejected goods or exact previously accepted allocations, physical return, replacement, credit or cancelled remaining commitment. Returning accepted available stock moves it to returned_to_supplier; employee-held or in-repair items must first be explicitly recovered/resolved. Returning never silently alters invoice/payment records. Credits/reference adjustments preserve original invoices; recording an agreed credit is distinct from receiving money. Pending rejected goods remain visible until disposition/replacement/credit/cancellation is recorded. Cancellation changes only eligible unfulfilled commitments and retains all receipts/history.

An order closes only when every original/replacement/rejection obligation has an explicit final outcome. Financial settlement is displayed independently and may still be outstanding. No stock is created for a cancellation, quotation, payment or credit note.

## W08. Invoice and payment records

Invoice: draft -> recorded -> matched or discrepancy -> settled/partially_settled derived from allocations. Supplier invoice number is unique per supplier/company; supplier/currency/order consistency is required. Allocate invoiced quantities to accepted receipt lines without double billing. Block over-allocation and show price/tax/quantity mismatch. An authorized reviewer records an explicit explanation/approval for a supported discrepancy; this never rewrites a PO or creates inventory. Credit documents link the original invoice and affected lines; payment/allocation reversals are append-only.

Payment record contains external reference, payment date, amount/currency and invoice allocations. Allocation sum cannot exceed payment amount, and invoice settlement cannot exceed the adjusted payable amount. Unallocated amounts remain visible rather than silently paid against another currency/company. A correction posts a reversal and, if needed, a replacement record. No bank/card transfer is executed. Reports keep acquisition costs, invoiced amounts, cash records and maintenance expenses separate to avoid double counting.

The acquisition lot snapshots issued-order net unit price (or declared opening-stock cost), labelled with that source/basis; taxes, delivery/other charges, invoice discrepancies and later expenses remain separately reportable. An invoice does not silently overwrite the original batch cost. Cost reports must name their basis; this is not a general-ledger valuation policy.

## W09. Faults and maintenance

Fault: reported -> triaged -> linked_to_work/resolved. Reporting alone does not move stock. Work order: draft -> scheduled -> in_progress -> awaiting_inspection -> completed; cancellation allowed before intake, or after explicit return of all taken-in quantities. Internal responsible person is an active membership; external provider is a contact. Capture dates, coverage/support, expenses and evidence.

Intake moves exact affected available/damaged/custody allocations -> maintenance. Where custody remains legally/operationally outstanding, retain its custody-line dimension; physical provider location is independent. Alternatively record an inspected return first, explicitly clearing that responsibility. Completion splits repaired/needs_more_work/unrepairable quantities; inspection releases repaired goods to available or the original outstanding custody context. Unrepairable quantity needs an explicit retirement/loss/disposal decision. Do not make all 10 pans unavailable when only 2 enter repair. Scheduled work without intake changes no availability.

Preventive plans create idempotent due occurrences by plan/date, avoiding duplicate work orders. Rescheduling updates future jobs, retaining earlier occurrences. Warranty expiry is the first uncovered date; Coverage through is converted by the UI once. Date-based reminders use company time zone, including daylight-saving boundaries.

## W10. Physical counts and reports

Count: draft -> counting -> submitted -> reviewed -> adjusted/closed. Capture selected location/account balances and versions at the baseline, observed values and evidence separately. An employee-held asset is not silently counted as missing store stock; define the check's included buckets. Submission never updates inventory. Review calculates variance and proposes exact allocations/reasons.

Posting an adjustment locks current balances and compares baseline versions. If movements occurred, return COUNT_STALE and require reconciliation/recount or explicit documented reconciliation against intervening movements; never overwrite current stock with an old observed total. Adjustment requires its own capability and produces a journal against variance plus audit. A reviewer may differ from the counter; separation can be configured without presuming every company has two inventory staff.

Reports use authorized rows before aggregation and authorize cost fields independently. Inventory shows available/custody/inspection/damaged/maintenance/transit and terminal outcomes separately. Purchasing shows original/replacement obligations and invoiced/paid amounts independently. No mixed-currency grand total. Usage counts consumable postings with explicit correction handling. CSV output uses the identical row/field policy and escapes spreadsheet formula-leading cells. An export is a current authorized snapshot, not a reusable public file URL.

## W11. Notifications, files and QR

Business events create deduplicated in-app notices and email jobs in the same transaction. Default proposed reminders: pending confirmation and overdue loans daily, maintenance 7 days before/due date, warranty 30/7 days before expiry. Company configuration may change timing; this is a technical starting default, not a new scope approval. Key each occurrence by event/entity/date/recipient/channel. Stop obsolete jobs when records resolve; recheck permission and recipient state at delivery. Security/account mail is separate from optional business channel preferences.

Worker jobs: pending -> leased -> delivered, retry_scheduled or failed. Expired leases are reclaimable; bounded exponential retry with jitter and operator-visible terminal failure. Unknown provider outcomes can duplicate an email, but never a business posting. Avoid prices and sensitive details in subjects; links authorize again. Delivery delay does not remove dashboard tasks. Selecting a provider, sending live mail and proving recovery belong to implementation/deployment evidence.

Attachment upload: staged -> linked or cleanup_pending -> deleted. Check signature/size/tenant target and file-specific permission; avoid uploading under long database locks. Lost client responses must be recoverable by upload identity. Failed linkage queues cleanup; deletion verifies no surviving live reference. Downloads use the private gateway and current resource/field permissions.

QR references identify unit/item records without granting access. Scan -> login if needed -> explicit workspace/membership check -> authorized lookup/action. Do not automatically switch into an unauthorized company or expose its name. Camera denial/unsupported scanning has manual lookup; repeated QR scan never performs a stock mutation.

Requestable-catalog access alone may resolve the permitted item-level view; it never reveals a private unit's identity, location or custodian. A unit label still requires actual unit/custody visibility before returning unit detail.

## Delivered location/category/unit setup (B05)

Locations form flexible company trees. Creation/metadata edits and archive/reactivate use durable commands; moving a subtree is separate. Preview captures expectedVersion, new parent, named scope gains/losses and current grants/tree/role-permission fingerprint for 15 minutes. Confirm requires the same actor/context and explicit acknowledgement. Pending invitation scopes are included; acceptance separately revalidates current inviter coverage. Cycles, foreign parents and routing below inactive ancestors are rejected. Existing references/historical scope survive archive. Category edits retain immutable definition revisions; unit meaning and scale cannot be edited. [Verification](INVENTORY-CONFIGURATION-VERIFICATION.md) does not claim stock postings/catalog attribute writes, which remain B06/B07 work.

## Delivered catalog/opening/private-file workflows (B07)

Catalog create/update snapshots item revisions; changed category definitions flag incompatible records and block new opening acquisition until reviewed. Archive never removes stock/history. Existing-stock posting validates current item/destination authority, active routing, exact base quantity, individual tags, dates and optional separately authorized cost, then creates its lot/units and balanced acquisition journal atomically. Posted acquisition identity/cost basis remains immutable; support changes create history. Procurement receiving remains its own planned workflow.

Private file staging -> typed linked -> removed; unused staging expires after 24 hours. Linking checks current object/file/financial authority. Removal keeps link/audit history and schedules cleanup. Staging creates a durable cleanup intent before provider I/O and commits metadata only after successful upload. File classification must identify financial content; invoice/quotation/contract categories force protected classification. [B07 evidence](CATALOG-INVENTORY-VERIFICATION.md) covers metadata/access and explicitly unconfigured-provider failure, not live storage delivery/cleanup.
