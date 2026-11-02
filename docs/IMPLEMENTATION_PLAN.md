# Nuvik Vet — Implementation Plan

## Product vision and MVP boundary

The complete product vision includes multi-branch veterinary care, boarding and distinct medical hospitalization, inventory-integrated prescriptions/POS, purchasing, finance, audit, bilingual RTL UI, reports, notifications, and multi-tenant expansion. Do not deliver this as one release.

**Recommended first usable MVP:** one pilot clinic/branch in one confirmed country/currency; tenant-aware foundation; staff accounts and permissions; owner/customer and animal profiles; appointment/check-in; consultation with notes/diagnosis, basic prescriptions and vaccination records; basic boarding reservation/capacity/check-in/out and daily feeding/care notes; product catalog with optional barcode, opening stock and POS sale/return; unified invoice and cash/card/manual payment with partial payments; basic expense entry and daily revenue/stock reports; audit trail, backup/restore procedure, Arabic/English shell, and tested isolated deployment. Defer advanced hospitalization, multi-branch transfer, supplier automation, complex tax/accounting integration, online portals, offline POS, advanced notifications, and analytics until validated.

## Phase plan

| Phase | Scope and dependencies | Database / backend / frontend | Tests and acceptance criteria | Risks |
|---|---|---|---|---|
| 1. Foundation and database | Confirm product decisions, ports, tenancy/branch model, currencies/timezone and deployment target. | New isolated repo config, Compose project and secrets; migration runner; tenant/branch, user, audit foundations; API validation/error/logging conventions; app shell and locale tokens. | Migration from empty DB is repeatable; constraints/tenant boundary tests; startup and shutdown target only Nuvik; safe env check; health/readiness pass. | Unresolved business/legal rules; accidental resource collision; over-generalized tenancy. |
| 2. Authentication and authorization | Depends on Phase 1. | Memberships, roles/permissions, login, reset/invite, session/JWT issuer/audience, revocation/lockout; login/account/admin UI. | Auth unit/integration tests; permission matrix; cross-tenant/branch negative tests; no default secrets or demo creds in production. | Weak account recovery or privilege escalation. |
| 3. Customers, animals and appointments | Depends on identity. | Customer, animal/species/breed, owner relationships, identifiers, weights, appointments and schedules; search/profile/forms/calendar. | Duplicate suggestions, multiple animals/owners, appointment conflict and idempotent check-in tests; receptionist workflow accepted. | Duplicate data; species-specific data model drift. |
| 4. Medical records and prescriptions | Depends on animal/appointment. | Consultation, diagnoses, vitals, prescription items, vaccination administered/scheduled, attachments and amendments; clinical timeline/forms. | Clinical authorization, append/amend rules, upload validation/access, prescription does not move stock; vet workflow accepted. | Medical safety, privacy, retention, coding/template choices. |
| 5. Boarding and hospitalization | Boarding may begin after animal foundation; hospitalization requires clinical records. | Separate boarding reservations/accommodation/care records; separate clinical admission/observations; availability constraints and pricing; occupancy board, care task UI. | Concurrent booking conflict tests; task attribution/overdue, distinct status machines; check-in/out and billing source exactly once. | Capacity edge cases; medication/inventory boundary; emergency operations. |
| 6. Store, inventory and POS | Depends on catalog and finance rules; foundational MVP can use opening stock before purchasing. | Product/variants/categories/barcodes, location/lots, movements/balances, sale/lines, dispense integration; fast search/scanner/cart. | Concurrent stock issue, optional barcode, insufficient stock, prescription dispense, no duplicate deduction, retry/idempotency tests; accurate POS posting. | Stock ledger mismatch; returns and lot allocation complexity. |
| 7. Purchasing, suppliers and returns | Depends on stock model and POS. | Suppliers, POs, receipts, batches/expiry, purchase returns, customer return workflows; supplier/receiving/returns screens. | Partial receipt, duplicate receipt, over-return, resalable/damaged goods and expiry tests; movements reconcile to receipts/returns. | Costing method, supplier credit process, backward corrections. |
| 8. Invoices, payments and finance | Define tax, currency and source policy first. | Unified invoice/line, source links, payments/allocations/refunds, expenses, cashier close and audit; checkout/finance views. | Decimal/rounding, partial allocation, duplicate request, reversal, refund caps, source-to-invoice no-duplication tests; daily close reconciles. | Legal tax/invoice requirements; misreported cash vs revenue. |
| 9. Reports, dashboards and notifications | Depends on consistent event/ledger data. | Clinic/boarding/store dimensions, report queries, low stock/expiry/task alerts; dashboards/report filters. | Reconcile reports to source ledgers; role/tenant scope tests; timezone/date-boundary coverage. | Ambiguous metrics; expensive unindexed queries. |
| 10. Verification, deployment and operations | All release scope complete. | CI, dependency/security checks, proxy/TLS, structured monitoring, backup/restore, runbooks and rollout; polished responsive bilingual flows. | Automated unit/API/DB/e2e tests, isolation acceptance checks, restore drill, load/security review, user acceptance and release checklist. | Unverified recovery, secrets exposure, untested concurrency, production support gaps. |

## Testing strategy

Establish testing infrastructure as implementation begins (no tests were run or added during this analysis-only phase). Use unit tests for validation/pricing/permissions; PostgreSQL integration tests on isolated disposable Nuvik databases; API contract and authorization tests; concurrency tests for bookings, inventory and idempotency; end-to-end workflows for clinic, boarding, POS, payment/refund; UI accessibility and Arabic/English RTL checks; migration-from-empty and upgrade tests; restore drills and load/security checks before production. Tests must never target a developer's shared or unrelated database.

## Cross-phase acceptance criteria

- One owner can manage multiple animals; clinical history is animal-centered and access-controlled.
- Boarding and medical hospitalization are distinct models, navigation and status flows.
- A written prescription has no stock impact; posted dispense reduces stock exactly once.
- POS, clinic and boarding charges create traceable department-specific invoice lines once; payment retries cannot duplicate receipts.
- Returns/refunds create linked reversals and correct restock decisions; all movements and adjustments are attributable.
- Tenant/branch is checked server-side across data/API/realtime/file access; cross-tenant requests return no data.
- Database constraints and transactions protect integrity under concurrent users.
- Nuvik startup/shutdown/configuration cannot address another project's resources; ports are rechecked and documented.
- Backup restoration to an isolated environment is demonstrated before production approval.
