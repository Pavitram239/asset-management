# Inventory ledger foundation verification (B06)

Local internal posting foundation verified on 20 October 2026. No generic public journal-writing route was added. Catalog/opening-stock UI and public workflow endpoints remain B07; custody/purchasing/maintenance and stock-check approval remain their planned slices.

## Delivered foundation

Migration 009_inventory_ledger.sql SHA-256: `5ff6916cd2298cd7136d9d79bf88eb34e9c2d5e5fea99ec8eafba4584fb4b1d8`. Applied/checksummed migrations 001–008 were preserved. Only isolated schemas in the dedicated test database were migrated.

- Minimal catalog/category-revision/unit/department ownership, acquisition lot and individual-product linkage, typed opening/adjustment source persistence. No legacy backfill, implicit catalog grouping or changed product UUID occurs here. An adjustment source table does not constitute the B19 review workflow.
- Reusable internal ledgerAccount/postJournal helpers run inside their caller's authorized transaction. Shared organizationCommand now passes its current durable command row as an optional fifth argument; existing handlers remain compatible.
- Balanced journals/entries by item, original lot and individual identity; immutable journal/source/account/entry records; exact quantities and unit precision; locked nonnegative physical balance projections. Whole individual positions are zero/one and a unique positive-position index prevents duplicate placement. Posted item mode/base unit and acquisition identity/cost basis are immutable.
- Durable commands identify one posting, with a separate canonical ledger-intent hash and immutable result pointer. Source transitions, entries/balances, audit and inventory_journal_events commit together. The event table is a domain outbox of tenant/journal pointers only. Recipient selection, preferences and encrypted business-mail fan-out are B18; these events do not pretend to be delivered mail.
- Deferred database checks independently enforce journal balance, source agreement, unit precision and projection reconciliation; an insert guard prevents appending to an already committed journal. New workflow modules must add their same-company typed source/account dimensions with their implementing migrations. No untyped source UUID escape hatch is exposed.

## Actual validation

Full dedicated PostgreSQL integration command after B06 and final B05 scope additions: **72 passed, zero failed/skipped**, including existing real HTTP suites and eight ledger checks (suite plus seven scenarios). Ledger scenarios exercise the actual shared organizationCommand boundary with internal synthetic requests, not a newly exposed HTTP route.

- Opening stock, one journal/source/event/audit, duplicate-key replay, changed-key intent denial and durable result recovery after response-cache removal.
- Concurrent last-individual-unit movements: exactly one success/one conflict, one positive physical position; duplicate placement rejected by the database and rolled back.
- Exact fractional allocations, over-precision/insufficient-stock/foreign-account denial, and unchanged acquisition metadata.
- Injected domain-outbox failure rolls back every journal/entry/balance/audit/command/source transition; valid retry succeeds.
- Direct database rewriting/late append/forged projection/no-source and unbalanced-entry attempts fail. The unbalanced test writes matching balance projections and an event before commit, proving the independent deferred journal check.
- Current authority is resolved after the company lock; a competing revocation prevents posting.

No additional frontend change belongs to this internal slice; the B05 frontend build/browser evidence is recorded separately in [configuration verification](INVENTORY-CONFIGURATION-VERIFICATION.md). No OpenAPI operation was promoted for a nonexistent generic posting endpoint. No application database, deployment or live storage/mail provider was changed.

## Remaining work

B07 must enforce its catalog/opening permissions, field/cost redaction, private attachments, source input validation and browser journeys before its public operations are marked implemented. B08 must reconcile legacy assets/custody and gate incompatible legacy physical edits. Other source/account kinds, recipient notifications, reversal workflows, load measurements, restricted runtime-role grants and operational restore remain their owning slices. No first-release business module is deferred by this foundation report.
