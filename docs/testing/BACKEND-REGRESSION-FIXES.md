# Backend regression repairs — 28 October 2026

Scope: the two causes behind the previous three failing integration records. The failure in configuration was counted once for the child and once for its parent; the populated migration workflow was the third record.

Outcome: **BUG-002 and BUG-003 fixed and locally retested. Full dedicated integration suite: 87 passed, 0 failed, 0 skipped.**

## Causes and focused fixes

**BUG-002: populated legacy migration fails on ambiguous company.** Migration 012 declares a company variable while products also has a company column. PostgreSQL rejects its import queries when legacy rows actually exercise that block. Empty-schema tests had not exposed the ambiguity.

The shared migration executor now adds an explicit PL/pgSQL variable-precedence directive only to 012's import block at execution time. The migration file and its checksum remain unchanged, preserving databases that already recorded it. Both normal upgrades and manually constructed fresh-schema test fixtures use the executor. No session-wide database setting is changed. Original SHA-256 and the previously recorded dedicated-schema checksum both remain `f0921e851bbe066a9f5061cdb2e41576822a973ecd7be0bb84c2063dbc062dbf`.

**BUG-003: the cutover guard rejects current unlinked product workflows.** Migration 012's blanket guard prevents creating products without catalog/lot links. The existing current API and configuration fixtures still use explicitly unlinked legacy products; the full B08 adapter remains unfinished. This was a runtime compatibility regression, not a reason to remove scope or authorization assertions from tests.

New numbered migration **013_legacy_product_compatibility.sql** restores writes for products that remain completely unlinked. Existing API authorization, tenant references, assignment validation, transactional history/audit and soft deletion still apply. Catalog-linked products retain immutable identity, cannot be unlinked or deleted directly, and require an inventory posting for physical projection changes. An unlinked unit cannot be arbitrarily relinked through an update. No applied migration file was edited and no test skips/assertions were added to hide either failure.

This repairs current compatibility; it does not deliver the remaining custody/cutover UI, reconciliation or lifecycle workflows in B08 or complete the PRD. API paths, response shapes, UUIDs, assignment IDs and OpenAPI 2.6.0 are unchanged.

## Validation

- Targeted original failing suites: 22 passing test records, 0 failed/skipped before adding the new populated-import regression case. Raw local output: `.tmp/e2e/backend-fixes-targeted.txt`.
- Added a populated-import regression verifying preserved manufacturer, product/recipient identifiers, legacy_imported custody (no invented confirmation), unknown receipt/cost, balanced journal entries, unchanged original migration checksum and rejected direct unlink/assignment/deletion of a linked unit.
- `npm test`: 15 passed, 0 failed; 9 database suites skipped without TEST_DATABASE_URL. Raw output: `.tmp/e2e/backend-fixes-unit.txt`. This is not integration evidence.
- First full integration attempt: the original failures were gone, but one suite could not start because concurrent migrations exhausted PostgreSQL shared memory (86 passing records, 1 failure, no skipped records). Raw output: `.tmp/e2e/backend-fixes-integration.txt`.
- The standard integration script now uses `--test-concurrency=1`, serializing isolated database suites instead of changing database resources or weakening production controls. `npm run test:integration` with explicit dedicated TEST_DATABASE_URL completed successfully: **87 passed, 0 failed, 0 skipped**, about 136.7 seconds, exit code 0. Node totals include parent and child records. Raw output: [sequential integration results](../../.tmp/e2e/backend-fixes-integration-serial.txt).

All database execution uses the dedicated assetos_e2e_test database and generated schemas, never the application database. A source-only corrective migration was added; it was not applied to the existing long-lived browser fixture schema or an application database. No external service, storage object, deployment or browser UI changed. Live storage/mail and operational cutover remain unverified. No frontend rebuild/browser review was needed for these backend-only changes.

## Delivery boundary

Keep original migrations immutable and use the updated runner for a future reviewed deployment. Migration 013 is required to preserve the current unlinked legacy contract after 012. Do not run only raw 012 SQL manually for a populated installation; use the checked migration runner. No deployment or application-data migration is authorized by this test report.
