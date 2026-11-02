# Nuvik Vet — Database Decisions and Open Questions

This log records logical-design decisions for review before SQL implementation. It is not a migration specification or authorization to start services. The current target model is in `docs/DATABASE_DESIGN.md`; inherited Human Clinic SQL remains untouched and excluded.

## Decisions captured in the design

| Area | Current decision | Rationale / implementation consequence | Status |
|---|---|---|---|
| Animal ownership | `animal_owners` is the sole authority; no duplicate `animals.primary_owner_id`. Historical ownership uses effective intervals. Exactly one current primary owner is required per active animal. | Avoid conflicting sources of truth while supporting co-owners and transfer history. A unique partial index ensures at-most-one; existence must also be enforced transactionally/at DB boundary. | Proposed; confirm owner workflow |
| Ownership authority | Primary owner does not automatically imply billing or contact authority. These are explicit relationships/flags. | Legal owner, day-to-day contact, and payer may differ. | Open policy |
| Clinical observations | Store typed values with validated value type and explicit unit; retain observation concept, time, author, and provenance. | Prevent free-text vitals and ambiguous unit conversion. | Proposed |
| Prescriptions and dispensing | Normalize prescription items; distinguish medication concept from inventory product. Only a posted dispensation issues stock. | Clinical intent and actual supply have different lifecycles. | Proposed |
| Vaccination | Administration records reference animal, administered vaccine batch, dose/route, administrator, time, and captured next-due recommendation. Schedules/reminders do not prove administration. | Preserve clinical and lot traceability. | Proposed |
| Hospitalization | Model clinical admission and monitoring separately from commercial boarding. | Different responsibilities, statuses, and billing. Shared physical capacity still requires conflict-safe allocation. | Proposed |
| Boarding occupancy | Reservations allocate accommodation through explicit interval rows; exclusive allocations conflict by overlap, shared occupancy consumes capacity units. | One reservation table alone cannot safely represent shared capacity or prevent double-booking. | Open capacity rules |
| Boarding time | Use timezone-aware instants and half-open intervals; planned and actual stay times are distinct. | Allows exact checkout/check-in boundaries and auditable changes. | Proposed; confirm branch timezone policy |
| Boarding pricing | Effective-dated rates; confirmation snapshots rate/rule, currency, billable units, tax, and price. | Later rate edits must not rewrite a booked/posted charge. | Open rate and rounding policy |
| Inventory authority | Immutable `stock_movements` are the history/source; `stock_balances` is a locked, transactionally maintained projection reconciled from movements. Corrections append compensating movements. | Fast availability reads without losing traceability or hiding discrepancies. | Proposed |
| Duplicate postings | Enforce unique source/posting identity plus tenant-scoped idempotency keys and request hashes. Post source business event, movement, projection, and receivable atomically. | Retry safety and protection from duplicate stock/receivable effects. | Proposed |
| Sales and invoices | Sale is the POS business transaction; invoice is the receivable document. A source line may generate at most one receivable posting. Immediate settlement may be modeled without an open invoice, subject to accounting policy. | Prevent duplicate receivables while keeping sales and collection concepts distinct. | Open POS/accounting policy |
| Payments/refunds/returns | Payments are captured tender; allocations link payments to invoices; refunds reverse captures; returns reference original sale lines and have explicit restock disposition. Corrections are append-only reversal/credit/debit documents. | Preserve original financial and stock history. | Proposed; confirm processor/cash workflows |
| Tenant integrity | Every operational table carries tenant ID; branch ID is required where branch context exists. Composite tenant-aware FKs (or equivalent DB-enforced protections) prevent cross-clinic references. | UUID equality alone does not establish tenant ownership. | Proposed |
| Reference data | Separate immutable global vocabularies from tenant catalog/overrides; scope local labels, prices, roles, and configurations to tenant. | Permit shared standards without cross-tenant mutable state. | Open list of global vocabularies |
| First migration | Foundation only: tenant/branch, identities/membership/permissions, minimal audit foundation, and migration ledger. No domain tables or seed/demo data. | Creates tenant and migration safety before business records. Exact scope is in `DATABASE_DESIGN.md`. | Proposed |
| Migration execution | Separate Nuvik migration directory; checksummed immutable versions; database advisory lock; transactional migration where possible; halt and operator repair on failure. No PostgreSQL-init or normal API auto-migration. | Avoid partial initialization and unreviewed schema changes. | Tooling choice open |
| Credentials | Dedicated migration-owner and least-privilege runtime DB credentials. No universal demo password or secret in seed SQL. | Limit compromise impact and keep environment-specific credentials out of source. | Required before deployment |

## Questions requiring product, clinical, or accounting answers

1. **Ownership and contacts:** Can there be multiple billing-responsible contacts? Can a non-owner authorize treatment? What evidence/consent and history must be retained on transfers or disputed ownership?
2. **Animal lifecycle:** Which states are needed (active, deceased, archived, transferred), who may change them, and what retention/legal rules apply?
3. **Clinical vocabulary:** Which diagnosis, observation, unit, medication, vaccine, and species vocabularies should be global, licensed, tenant-editable, or version-pinned? Are controlled substances in scope?
4. **Clinical corrections:** Which roles may amend a signed consultation, prescription, or vaccination record; should corrections require reason/approval and preserve a visible amendment chain?
5. **Hospitalization:** What monitoring frequencies, escalation rules, medication administration checks, and occupancy linkage are required? May a hospitalized animal occupy a boarding accommodation and how is capacity coordinated?
6. **Boarding capacity:** What defines capacity units (animal, size, kennel slot)? Which accommodations are exclusive/shared? Are incompatible animals blocked by species, size, temperament, or household? What cleaning/turnover buffer applies, and does cancellation/no-show release capacity immediately?
7. **Boarding pricing:** Is billing per calendar day, 24-hour interval, night, or another unit? Define grace periods, partial-day rounding, deposits, cancellation fees, seasonal rates, taxes, and currency rounding.
8. **Inventory policy:** Are negative stock/backorders ever permitted? Which products require lot/expiry/serial tracking? Is reservation/available stock persisted or calculated? Define FEFO rules, expiry quarantine, unit conversions, stock counts/approvals, and inter-branch transfer authorization.
9. **POS and receivables:** Does every sale require an invoice/tax receipt, including immediately paid sales? Can one sale split across invoices or customers? Can a customer hold unapplied credit? Define tax and revenue-recognition rules with the accountant.
10. **Payments and refunds:** Which tender types/processors are supported? Are partial refunds allowed? Which approver thresholds apply? How are failed, pending, chargeback, cash drawer, and processor idempotency states reconciled?
11. **Returns:** Which items are returnable, within what interval, and under what conditions can returned stock be restocked? What happens for lot-tracked, expired, damaged, or dispensed medication?
12. **Finance and audit:** Are commissions, cash sessions/closing, expenses, tax reports, and formal ledger postings in the first release? Define correction approval and audit retention/access obligations.
13. **Branch and identity scope:** Can one user operate across tenants, and how is tenant selection authenticated? Are catalog prices and stock branch-specific or clinic-wide? Is customer identity shared across branches within a clinic only?
14. **Data lifecycle/privacy:** Specify clinical, attachment, financial, and audit retention periods; legal holds; export/erasure rules; backup retention; and who can access sensitive records.
15. **Migration operations:** Select the migration runner and supported PostgreSQL versions, define advisory lock namespace, checksum algorithm/version encoding, deployment operator, backup gate, and recovery procedure for a non-transactional failure.

## Approval gate

Before implementation, product/clinical owners should resolve questions affecting core relationships and lifecycle; finance/accounting should resolve receivable, tax, refund, and correction rules; operations should resolve boarding and stock policies; security/privacy owners should resolve access and retention. The first migration must then be reviewed against the approved decisions. No SQL migrations are created by this document.
