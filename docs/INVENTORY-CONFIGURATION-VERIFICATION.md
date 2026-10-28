# Inventory configuration verification (B05)

Local implementation verified on 20 October 2026. This is evidence for inventory configuration, not a claim that stock, custody, purchasing or the full first release is complete.

## Delivered behavior

- Flexible same-company location trees with database cycle guards and ancestry projection. Versioned rename/archive/reactivate; archived references and historical access remain, while new routing requires active ancestors.
- Location moves require a 15-minute actor-bound preview, current record version and explicit acknowledgement. Named scope gains/losses count role/direct/pending-invitation grants. Tree/grant/role-permission changes invalidate the fingerprint. Current inviter authority is checked again at acceptance after any move.
- Organization/department/location/self grants combine by union for legacy product SQL/object/file/overview access. Unknown legacy locations match no location-only grant. Location directory/statistics expose covered active assignees, not the full company directory.
- Category field definitions support text, number, boolean, date and choice; previous category/version definitions are immutable. Unit definitions and precision 0–6 cannot be edited. Exact quantity string parsing is ready for stock workflows; B05 itself posts no stock.
- Reviewed protected owners receive location.manage/category.manage/unit.manage; existing custom roles do not automatically gain new capabilities. New-workspace administrators include currently delivered permissions.
- Inventory setup is available in desktop and mobile menus, including accounts with only category/unit management permission.

## Persistence and interface

Migration 008_inventory_configuration.sql SHA-256: `7dca1deb16e41fd0fef18ece7d15cba3f6b1022885fde366b94da997c0a4360e`. Earlier applied migrations 001–007 are preserved. Only generated schemas in the dedicated local test database were migrated.

Contract 2.4.0 promotes 12 operations over seven paths: listLocations/createLocation/getLocation/updateLocation/previewLocationMove/moveLocation; listCategories/createCategory/getCategory/updateCategory; listUnitsOfMeasure/createUnitOfMeasure. Seven write operations support current-authority durable command lookup. Access/effective/invitation grant contracts now describe location scope. Planned catalog/inventory read permissions are not seeded early; current configuration reads require the matching manage capability.

## Actual checks

- Full dedicated PostgreSQL/HTTP integration run: **64 passed, zero failed/skipped**. Fresh/legacy migration, existing UUID/history and checksum checks remain covered.
- Focused configuration rerun after response-contract assertions and location directory/statistics cases: **7 passed, zero failed/skipped** (suite plus six business scenarios). Covered API/database cycles/foreign parents, active ancestors, replay/cache removal, stale versions, revoked authority, cursor context, union scopes, changed/expired previews, pending-invitation changes and lost delegation, category revision retention and unit immutability. Responses are checked against the promoted current OpenAPI schemas.
- npm test without TEST_DATABASE_URL: **13 passed, six database suites skipped**. Dedicated integration results above are separate. Exact-decimal tests cover 0.1+0.2, maximum precision, malformed/numeric/exponent values and whole-unit restrictions.
- npm run build: **passed**. Current and planned OpenAPI Swagger validation: **passed**.
- Browser review used only a temporary loopback server and synthetic company/accounts in its own test schema: nested Pantry creation, reviewed Kitchen move North -> South, category creation/choice -> text edit, whole/fractional unit creation, duplicate-code error and corrected retry. Desktop 1280, mobile 390 and 320; light/dark; observed no horizontal overflow. Keyboard progression from category name reaches its first field; mobile account menu exposes inventory setup.
- [Desktop evidence](screenshots/inventory-setup-desktop-light.png) and [mobile category evidence](screenshots/inventory-setup-mobile-light.png) were captured after actual writes.

## Remaining limits

No application database migration, deployment, external access change or live provider/storage check occurred. Stock ledger, catalog item attribute validation/compatibility warnings, acquisition lots and business workflows remain B06 onward. Category revisions here preserve definitions, not yet item value history. Closure rebuilds serialize on the company lock; no large-tree load claim is made. Expired previews have no retention-cleanup schedule. Full accessibility/device/release acceptance remains B22/B23 work.
