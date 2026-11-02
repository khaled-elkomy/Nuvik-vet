# Nuvik Vet — Open Questions

Resolve these before committing to implementation details. Recommended defaults are suggestions, not assumed requirements.

## Product and launch scope

1. Which country/currency, tax rules, invoice/legal numbering requirements, languages and clinic timezone apply? These determine tax, rounding, document and reporting behavior.
2. Which clinic/branch is the first pilot, how many branches/users are expected in year one, and is this hosted SaaS or customer-managed installation? Recommendation: design tenant isolation now; initially deploy one tenant per environment only if that simplifies operations without blocking shared SaaS.
3. Which species are in MVP? Which fields/clinical templates are required for dogs/cats and other species?
4. What is the MVP launch target and which modules are essential on day one? Proposed MVP is in `IMPLEMENTATION_PLAN.md`.
5. Are customer portal, messaging/WhatsApp, online booking, payment gateway, accounting integrations, insurance, lab integrations, or e-commerce in scope?

## Clinic and medication policy

6. Which staff credentials and prescribing/signature requirements apply? Is an electronic signature required?
7. What clinical templates, diagnosis terminology, vaccination schedules and units should be supported?
8. Who may see/edit medical records, and should sensitive chart reads be audited? What are retention, correction and deletion policies?
9. Does the clinic sell/dispense medicines from store inventory? Define when products are invoiced, whether prescription is required, and how partial fills/substitutions work.
10. What distinguishes a boarding care medication administration from medication dispensed to the owner, and who owns/ supplies the medication? Define inventory effects.
11. Which hospitalization monitoring and treatment workflows are required in the first release, separate from boarding?

## Boarding and physical operations

12. Are accommodations individual kennels, shared capacity units, room types, cages, or mixed? Define compatibility, cleaning buffers, holds and overbooking policy.
13. What are check-in/out cutoffs, pricing units (night/day/hour), deposits, cancellation/no-show fees, peak rates, and add-on services?
14. Which care schedules, escalation alerts and incident reports are mandatory? How are owner instructions acknowledged?

## Store, finance and stock

15. Which barcode standards, SKU rules, units, variants, bundles, weighing goods, and label/receipt printers are needed? Barcode remains optional by design.
16. Is negative inventory prohibited? Define lot/expiry tracking by category, FEFO/FIFO policy, locations, transfers, counts, shrinkage and expired-goods disposal.
17. Are supplier POs and goods receiving in MVP? How are supplier credits, purchase returns and landed costs handled?
18. Can one invoice combine clinic, boarding and store charges? Is POS paid immediately or can it create customer balance? How are deposits/boarding advances allocated?
19. What payment methods and refunds are accepted? Does a payment gateway require asynchronous reconciliation? Is cashier shift opening/closing required?
20. Define revenue recognition/report definitions: invoice totals, collected cash, refunds, taxes, discounts, cost of goods and gross margin.

## Identity, deployment and operations

21. Should accounts be global across tenants or separately provisioned per clinic? Is MFA required? How are invitations, password reset, lockout and employee offboarding handled?
22. Do the Human Clinic and Graduation Project have other accessible repositories or Docker contexts not located in the inspected Desktop folders? Their port assignments could not be verified here; Docker was unavailable.
23. Confirm the provisional ports (web 5178, API 4108, PostgreSQL 5448, optional proxy 8088/8448) after Docker and repository checks.
24. What hosting provider, domain, TLS, email/SMS provider, file storage region and data residency constraints apply?
25. Set recovery point/time objectives (RPO/RTO), backup retention, encryption-key ownership, and responsibility for restore drills.
26. What expected concurrency, data volume, uptime/support hours and offline requirements apply? Offline POS requires a separate conflict-safe design.
27. What CI provider, deployment approval process, monitoring stack and vulnerability management policy are expected?

## Data migration and ownership

28. Is any human-clinic code, customer data, or history intended to migrate? Recommendation: no clinical data migration by default; if requested, plan a separate consented, mapped, tested migration with source/target isolation.
29. Who owns data export, account termination, tenant deletion, audit retention and customer support requests?
