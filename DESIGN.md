# Design specification: AssetOS

See [UX-FLOWS.md](UX-FLOWS.md) for the first-release navigation, 10 user journeys, 32 screen groups, key layouts and interaction states. It is a design draft based on the accepted PRD; the visual tokens below describe the existing app.

## Existing visual foundation

Use the implemented tokens in [client/src/index.css](client/src/index.css), with screen-specific styling in [client/src/App.css](client/src/App.css) and existing components. This document guides consistency; the stylesheet contains the exact values.

- Typeface: Inter; body 14px with 1.5 line height; secondary/help text 12px.
- Primary navy: #172554; light-theme accent: #0f766e.
- Light canvas: #f8fafc; panels: #ffffff; main text: #0f172a.
- Dark canvas: #0f172a; panels: #1e293b; main text: #f1f5f9; accent: #5eead4.
- Controls commonly use 48px minimum height and 8px radius; panels use 12px radius and subtle borders.
- Reuse CSS variables and existing spacing patterns rather than introducing competing palettes.

## Layout and components

Keep the current dashboard shell, organization selector, desktop navigation and responsive mobile navigation. Reuse AssetForm, form controls, modal, table/cards, pagination, QR and icon components. Authentication uses a welcome panel plus form layout; smaller screens must retain the usable form. The register uses a desktop table and responsive asset presentation; preserve access to actions and long asset names.

## Interaction requirements

- Reflect effective grants in navigation and actions. Server authorization remains mandatory.
- Provide clear organization context. The target onboarding flow allows a verified user to create a workspace or accept an invitation; membership in other companies remains restricted. The existing no-access screen must evolve to support these paths.
- Show loading during navigation/submission; prevent accidental duplicate submissions.
- Provide a useful empty state, distinguish errors from empty results, and retain recoverable form input.
- Confirm destructive asset actions with the asset identity and explain the consequence.
- Make success/failure feedback visible; do not convey status only with color.

## Accessibility and review

Use semantic labels, visible keyboard focus, keyboard-operable controls and understandable validation. Review modal focus/return behavior, small-screen overflow, long names, missing images, denied access, loading, empty results and light/dark themes. Respect reduced-motion preferences when adding animation. These are acceptance requirements, not a completed accessibility audit.

## Agreed first-release screens to design

[PRD.md](PRD.md) defines accepted product scope; the visual foundation above describes existing implementation. Design workspace creation/invitations, location/category setup, the three inventory modes, employee requests, direct issues, receipt confirmation/disputes, returns/inspection, purchasing/approvals/receiving, maintenance/support, notifications, reports and stock checks. Support QR scanning on phones and responsive workflows throughout.

Make quantities and states understandable: approved, handed over, confirmed and returned are distinct events; received, accepted and rejected purchase quantities are also distinct. Show cost information only to permitted users. Define task flows and error/empty/loading states before implementing screens.

## First visual pass: inventory and receiving

The conversation preview covers S05 Inventory, S06 Item detail, S08 Existing-stock entry, S18 Purchase order and S19 Delivery inspection. It is a sample-data design proposal; it does not modify the application or establish backend behavior. The preview shows only Inventory and Purchasing navigation so these connected flows can be reviewed; the full navigation remains in UX-FLOWS.md.

- Inventory uses a searchable list with tracking mode, category and availability. Pooled and individually tracked items share the entry point but retain different identities and quantity rules.
- Detail separates availability, employee custody and total recorded quantity, then overview, purchase/support and activity.
- Existing-stock entry shows item, quantity, location, acquisition information and source/reason, with a before/after quantity summary. It directs ordered deliveries to purchasing.
- Purchase orders separate approval, accepted stock, undelivered quantities, rejected/unresolved items and payment status.
- Receiving calculates rejected quantity from delivered minus accepted and previews the availability change. Invalid acceptance quantities are blocked.
- Preserve the existing navy/teal visual foundation. On narrow screens the navigation becomes a compact row and forms/record details stack.

Browser checks covered desktop inventory and receiving, a 390-pixel layout for inventory and stock entry, existing-stock quantity changes, purchase acceptance and invalid acceptance quantities. This initial pass is superseded by the complete screen preview described below.

## Complete visual pass: all 32 screen groups

The complete conversation preview now covers S01-S32 from UX-FLOWS.md, including authentication/verification, workspace creation/invitations, employee tasks, the three inventory modes, custody/disputes/returns, full purchasing, maintenance, administration, reports, scanning and audit history. Item details additionally contain retirement, disposal and loss controls under Lifecycle.

An Explore screen selector makes every screen directly reviewable. Preview as demonstrates owner, manager, employee and finance views. Screen state shows Normal, Empty, No access, Loading and Connection error examples. These controls belong to the design review, not the proposed application navigation.

Keep the navy/teal foundation and use a shared workspace header, capability-based sidebar, action labels and record layouts. On phones, Menu expands/collapses navigation, the company name stays visible and forms/panels stack. The full application navigation replaces the two-section navigation used in the first visual pass.

All 32 screen groups were opened in a browser at desktop, 390-pixel and 320-pixel widths. Connected prototype actions were checked for onboarding, custody, purchasing, maintenance, roles, stock checks and reports. See [mockup coverage and verification](docs/MOCKUP-VERIFICATION.md) for the detailed evidence and boundaries. Mockup completion is separate from implementing or validating the production application.
