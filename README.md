# PGDesk — Paying Guest & Co-Living Management SaaS

Production-grade multi-tenant SaaS for Indian PG and Co-living operators, built with React, TypeScript, Tailwind CSS, Express, Drizzle ORM, Cloud SQL (PostgreSQL), and Firebase Authentication.

## Demo Accounts (Pre-seeded)

| Role | Name | Email | Mobile | Password |
| :--- | :--- | :--- | :--- | :--- |
| **Owner** | Rajesh Sharma | `owner@pgdesk.in` | `9845011223` | `demo1234` |
| **Manager** | Vikram Nair | `manager@pgdesk.in` | `9845044556` | `demo1234` |
| **Tenant** | Aarav Kulkarni | `aarav.k@pgdesk.in` | `9900123456` | `demo1234` |

Or click **Try Demo** on the landing page (`/`) or **One-Click Demo Workspaces** on `/login`.

## Key Features
- **Public Marketing & PG Listings (`/`, `/pg/:slug`)**: SEO metadata, `LodgingBusiness` JSON-LD, `/sitemap.xml`, live vacant bed count, tariff breakdown, and honeypot + rate-limited enquiry form.
- **Owner & Manager Dashboard (`/dashboard`)**: Occupancy KPIs, 6-month revenue vs. expenses chart (Recharts), overdue dues with one-click `wa.me` WhatsApp payment reminders, and upcoming move-out notices.
- **Visual Bed-Map (`/dashboard/properties`)**: Property -> Floor -> Room -> Bed grid color- and text-coded (`VACANT`, `OCCUPIED`, `RESERVED`, `MAINTENANCE`) with one-click tenant assignment.
- **Tenant Lifecycle (`/dashboard/tenants`, `/dashboard/tenants/:id`)**: Searchable/sortable TanStack Table, 4-step onboarding wizard with private KYC upload, and move-out deposit settlement calculator.
- **Rent & Billing (`/dashboard/billing`)**: Monthly & pro-rata invoice generation (`FIXED_1ST` or `JOIN_DATE` per property), late fee computation, cash/UPI/bank payment recording, tenant UPI UTR approval queue, and downloadable `pdf-lib` PDF receipts.
- **Complaints, Notices, Leads, Expenses & P&L CSV**: Full operational suite + Owner settings & Audit Logs.
- **Tenant Portal (`/tenant`)**: Room & bed card, invoices & PDF receipts, UPI payment instructions + UTR submission, complaints thread, notices, and move-out notice request.

## Local Development & Verification

```bash
npm install
npm run test     # Runs billing pro-rata, late fee, and settlement unit tests
npm run lint     # TypeScript typecheck
npm run build    # Production frontend bundle
npm run dev      # Starts Express + Vite on http://localhost:3000
```

## Environment Variables
See `.env.example` for Cloud SQL (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`), `SESSION_SECRET`, `APP_URL`, and `STORAGE_DRIVER`.

For local demo logins, copy `.env.example` to `.env` and set `ENABLE_DEMO_MODE="true"`.
This enables the seeded accounts listed above; keep it disabled in production.
