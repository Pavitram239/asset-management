# Screen Inventory & Implementation Status Matrix

**Product Name:** AssetOS / Asset Management System  
**Evaluation Role:** Senior UI/UX QA Engineer & Accessibility Specialist  
**Audit Date:** November 2026  
**Audited Target:** Web Application (React 18, Vite, Express, PostgreSQL)  

---

## 1. Architectural & Navigational Overview

AssetOS is built as a single-page application (SPA) using React 18, React Router v7 (data routers with loaders/actions), and styled with CSS variables and custom components. The platform is designed around strict **multi-tenancy** and **Role-Based Access Control (RBAC)**.

### Application Shell Structure
* **Public / Authentication Shell (`HomeLayout`):** Centered card layout with responsive branding (`AuthLayout`, `Logo`), form controls (`FormRow`, `SubmitBtn`), and status alerts.
* **Workspace Dashboard Shell (`DashboardLayout`):**
  * **Top Workspace Header (`Navbar`):** Page title, mobile branding toggle, active company selector/badge, theme toggle (Light/Dark), and profile avatar/logout dropdown (`LogoutContainer`).
  * **Desktop Sidebar (`BigSidebar` / `NavLinks`):** Collapsible capability-based navigation organized into four logical sections: *Operations*, *Stock & Setup*, *Management*, and *Account*.
  * **Mobile Navigation (`SmallSidebar` / Bottom Navigation):** Off-canvas navigation drawer for small viewports with a 4-tab mobile bottom bar (`Inventory`, `Requisitions`, `Add Asset`, `Profile`).
  * **Main Content Stage (`workspace-main`):** Breadcrumb/title bar, active progress bar (`Updating workspace…`), email verification banners (`VerificationNotice`), and nested route outlets.

---

## 2. Complete Screen Inventory & Implementation Status

Below is the definitive inventory of every discoverable screen in the codebase, detailing its actual implementation state vs. design/mockup targets from `UX-FLOWS.md` and `PRD.md`.

| Screen / Flow | Route Path | React Component | Implemented UI Elements & Controls | Implemented User Roles | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S01. Login** | `/` | `Login.jsx` | Email, password inputs, password recovery link, submit button, error alerts (`role="alert"`), instant redirect to `/dashboard`. | Public / Unauthenticated | **Implemented & Live** |
| **S02. Registration** | `/register` | `Register.jsx` | Name, work email, password, company name, location, instant provisioning launcher button. | Public / Unauthenticated | **Implemented & Live** |
| **S03. Forgot Password** | `/forgot-password` | `AccountRecovery.jsx` | Email recovery request form, back to login link, rate-limited submission feedback. | Public / Unauthenticated | **Implemented & Live** |
| **S04. Password Reset** | `/reset-password` | `AccountRecovery.jsx` | Tokenized reset password form, new password inputs, confirmation feedback. | Public (with token) | **Implemented & Live** |
| **S05. Email Verification** | `/verify-email` | `AccountRecovery.jsx` | Token-based single-use email verification handler, status alerts, dashboard handoff. | Public (with token) | **Implemented & Live** |
| **S06. Accept Invitation** | `/invite` | `AcceptInvitation.jsx` | Pending invitation resolver, password setup for new invitee, workspace join confirmation. | Invited User | **Implemented & Live** |
| **S07. Asset Register (Overview)** | `/dashboard` | `AllProducts.jsx` | Asset card grid / desktop table, keyword search, status dropdown filter, type filter, QR preview icon, edit/delete actions, pagination bar. | Owner, Admin, Asset Manager, Employee (self-scoped) | **Implemented & Live** |
| **S08. Add Asset** | `/dashboard/add-product` | `AddProduct.jsx` | Asset form grid: Name, company, department, status, location, purchase date, notes, custom specs attributes. | Owner, Admin, Asset Manager | **Implemented & Live** |
| **S09. Edit Asset & Custody** | `/dashboard/edit-product/:id` | `EditProduct.jsx` | Metadata update form, department/location reassignment, custody transfer history, private attachments viewer. | Owner, Admin, Asset Manager | **Implemented & Live** |
| **S10. Catalog & Opening Stock** | `/dashboard/catalog` | `CatalogInventory.jsx` | Mode 1 (Individual Reusable), Mode 2 (Reusable Stock), Mode 3 (Consumable), Opening stock ledger, lot & serial creation. | Owner, Admin, Asset Manager | **Implemented & Live** |
| **S11. Inventory Setup** | `/dashboard/inventory-setup` | `InventorySetup.jsx` | Interactive tree hierarchy for locations (Campus/Building/Room), custom categories with versioned JSON attributes, measurement units. | Owner, Admin | **Implemented & Live** |
| **S12. Asset Requisitions** | `/dashboard/requisitions` | `Requisitions.jsx` | Requisitions list, status badges (Pending, Approved, Fulfilled, Rejected), "New Requisition" modal dialog, approval action buttons. | All Roles (Employees create; Admins approve/fulfill) | **Implemented & Live** |
| **S13. Team Directory** | `/dashboard/users` | `Users.jsx` | Member card grid, search bar, department badges, role tags, avatar indicators. | Owner, Admin, Manager, Employee | **Implemented & Live** |
| **S14. Invitations** | `/dashboard/invitations` | `Invitations.jsx` | Table of pending/accepted/revoked invitations, "Send Invitation" modal with granular permission checkboxes and scope pickers. | Owner, Admin | **Implemented & Live** |
| **S15. Access Management (RBAC)** | `/dashboard/access` | `AccessManagement.jsx` | 5 Sub-tabs: Team Members, Departments, Roles & Permissions, Company & Ownership, Audit & Security trail. | Owner, Administrator | **Implemented & Live** |
| **S16. Workspaces Switcher** | `/dashboard/workspaces` | `Workspaces.jsx` | List of user's active organizations, new workspace creation form, schema creation feedback. | All Authenticated Users | **Implemented & Live** |
| **S17. User Profile** | `/dashboard/profile` | `Profile.jsx` | Personal info form (First/Last name, email, location), Cloudinary avatar upload preview, password change form. | All Authenticated Users | **Implemented & Live** |
| **S18. Admin Statistics** | `/dashboard/admin` | `Admin.jsx` | Metric counter cards (Total Assets, In-Use, In-Store, Retired), department breakdowns. | Owner, Administrator | **Implemented & Live** |
| **S19. Overview Charts** | `/dashboard/stats` | `Stats.jsx` | High-level overview statistics and distribution charts. | Owner, Administrator | **Implemented & Live** |
| **S20. 404 Not Found** | `*` | `Error.jsx` | Illustrated 404 page, friendly error message, return to home button. | All Visitors | **Implemented & Live** |

---

## 3. Differentiation: Implemented vs. Planned / Mockup-Only Features

As noted in `PRD.md` and `UX-FLOWS.md`, the platform specification defines 32 screen groups. The table below delineates what is **actually running in code** versus **future planned modules**:

| Feature / Screen Flow | Architecture Status | Evidence & Verification |
| :--- | :--- | :--- |
| **Multi-Tenant Schemas (`tenant_*`)** | **Implemented** | PostgreSQL migration 014 creates dedicated schema per organization; validated in tests and live DB. |
| **Asset Register & QR Codes** | **Implemented** | Full CRUD, base64 PNG QR download, department custody tracking. |
| **Inventory Setup (3-Tier Location Tree)** | **Implemented** | Campus $\to$ Building $\to$ Room tree with PostgreSQL closure table `location_ancestry`. |
| **3-Mode Catalog & Opening Stock** | **Implemented** | Mode 1 (Serialized Assets), Mode 2 (Bulk Reusable), Mode 3 (Consumables) with batch ledger. |
| **Asset Requisitions & Approvals** | **Implemented** | Migrations 015 & `Requisitions.jsx` full workflow. |
| **RBAC & Delegation Management** | **Implemented** | 4 Starter roles (`Owner`, `Admin`, `Asset Manager`, `Employee`) with custom scopes (`organization`, `department`, `location`, `self`). |
| **Private Attachments (Invoices / Proofs)** | **Implemented** | PostgreSQL metadata records linked to assets; file upload handling via Multer. |
| **Purchase Order Workflow (S18/S19)** | *Planned / Mockup Only* | Defined in `UX-FLOWS.md` and mockups; purchase requisition ledger exists, full vendor procurement is planned for Release 2. |
| **Maintenance & Service Tickets (S21/S22)** | *Planned / Mockup Only* | Status flag exists ("Under Repair"); scheduled maintenance ticketing is planned. |
| **Physical Stock Audit / Continuous Scan (S25)** | *Planned / Mockup Only* | Single asset QR scanning implemented in mobile; bulk stocktaking audit mode is planned. |
| **Live SMTP Email Provider** | *Planned / Local Adapter* | Encrypted outbox table `captured_mail` with local capture worker; live external SMTP/SES integration planned for production deployment. |

---

## 4. Test Coverage Matrix Across Roles & Breakpoints

| Viewport | Dimension | Category | Public / Auth | Owner / Admin | Employee / Staff |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **iPhone SE (1st gen)** | `320×568` | Mobile (Narrow) | Tested (Pass) | Tested (Overflow on Register/Add Form) | Tested (Boundary Verified) |
| **iPhone SE (2nd/3rd gen)** | `375×667` | Mobile (Compact) | Tested (Pass) | Tested (Overflow on Register/Add Form) | Tested (Boundary Verified) |
| **iPhone 12/13/14** | `390×844` | Mobile (Standard) | Tested (Pass) | Tested (Overflow on Register/Add Form) | Tested (Boundary Verified) |
| **iPhone 14/15 Pro Max** | `430×932` | Mobile (Large) | Tested (Pass) | Tested (Overflow on Register/Add Form) | Tested (Boundary Verified) |
| **iPad Mini / Portrait** | `768×1024` | Tablet (Portrait) | Tested (Pass) | Tested (Pass - Clean layout) | Tested (Boundary Verified) |
| **iPad Landscape** | `1024×768` | Tablet (Landscape) | Tested (Pass) | Tested (Pass - Clean layout) | Tested (Boundary Verified) |
| **MacBook Air / Laptop** | `1280×800` | Desktop (Small) | Tested (Pass) | Tested (Pass - Clean layout) | Tested (Boundary Verified) |
| **Standard HD Laptop** | `1366×768` | Desktop (HD) | Tested (Pass) | Tested (Pass - Clean layout) | Tested (Boundary Verified) |
| **Widescreen Laptop** | `1440×900` | Desktop (Wide) | Tested (Pass) | Tested (Pass - Full layout) | Tested (Boundary Verified) |
| **Full HD Desktop** | `1920×1080` | Desktop (1080p) | Tested (Pass) | Tested (Pass - Full layout) | Tested (Boundary Verified) |
| **Mobile Landscape** | `844×390` | Mobile Landscape | Tested (Pass) | Tested (Pass - Compact bar) | Tested (Boundary Verified) |
| **200% Browser Zoom** | `640×800 CSS` | Accessibility Reflow | Tested (Pass) | Tested (Pass - WCAG Reflow) | Tested (Boundary Verified) |
| **400% Browser Zoom** | `320×800 CSS` | Accessibility Reflow | Tested (Pass) | Tested (Fail - 2D Table Scroll) | Tested (Boundary Verified) |

---

## 5. Multi-Browser Test Matrix

| Browser Engine | Version Tested | Rendering Engine | Test Target URL | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Chromium** | 158.0.8127.18 | Blink / V8 | `http://localhost:5174` | **PASSED** | Core platform benchmark, axe-core audit target. |
| **Mozilla Firefox** | 159.0 | Gecko / SpiderMonkey | `http://localhost:5174` | **PASSED** | Flexbox, table borders, and CSS tokens render cleanly. |
| **WebKit (Safari)** | 27.2 (WebKit 2388) | WebKit / JavaScriptCore | `http://localhost:5174` | **PASSED** | Form inputs, dialogs, and SVG icons align with zero WebKit regressions. |

