# Nuvik Vet — User Workflows

## Roles and access model

Use permissions rather than relying on a fixed role list. Initial role bundles may include tenant owner/admin, branch manager, veterinarian, veterinary assistant, receptionist, boarding attendant, inventory/purchasing clerk, cashier, and read-only auditor. A user can have more than one role at a clinic/branch. The API checks permission and tenant/branch scope for every action; the UI only reflects these decisions. Medical chart access should be narrower than customer contact access, and financial actions should be separated from catalog maintenance where practical.

## Clinic lifecycle

1. Reception searches customers by normalized phone/email/name and possible duplicate animals by name/species/owner/microchip. Existing customer can add another animal; a new owner and animal can be created together.
2. Staff records species, optional breed, estimated/known birth date, sex, identifiers, allergies, and owner instructions. Weight and other time-varying values are dated observations.
3. Appointment booking assigns branch, provider, animal, service/reason, time and status. Check-in creates a visit/consultation encounter once; retries use an idempotency key so a double click does not create duplicate visits.
4. Veterinarian records examination/vitals, assessment, diagnoses, plan, follow-up and clinical notes. Draft and signed/closed states are explicit; edits to signed notes use an amendment record with author/time/reason.
5. A prescription creates intended medication directions only. It does not alter inventory or create a payment by itself.
6. If medication is supplied, an authorized user records a dispense against prescription lines, product/lot/location and quantity. In one transaction, dispense record, inventory movement and (if sold) invoice/sale line are created. Prevent duplicate dispense via line quantities and idempotency.
7. Vaccination administration is recorded separately from a due schedule/reminder, including product/batch, date, administrator and next due date.
8. Consultation charges and dispensed items flow to one invoice according to the selected checkout policy. Payment can be partial or multiple; allocations reduce receivable. A retry cannot duplicate invoice lines or payments.

## Boarding (pet hotel)

1. Staff checks animal/owner, vaccination and behavioral requirements, emergency contact, dates/times, feeding and medication instructions, and accommodation needs.
2. Availability is checked and reserved transactionally for a date-time interval. Capacity and species/size compatibility rules are enforced server-side. Reservation is distinct from a medical admission.
3. Check-in captures condition, belongings, owner instructions, emergency consent and assigned accommodation. Status transitions are audited.
4. Daily care tasks are scheduled and completed by staff: feeding, exercise, cleaning, observation, medication administration, and incident report. Each record includes due/completed times and user; missed/overdue critical tasks surface clearly. Any medication supply/deduction follows explicit dispensing/stock policy.
5. Check-out reconciles care, incidents, add-on services and charges. Boarding charges map to the invoice once; payment and final receipt are linked to the reservation. Reservation closes; history remains retained.

## Medical hospitalization

Clinical hospitalization is a separate admission workflow created by a veterinarian: clinical reason, attending clinician, care plan, medication orders, observations, handover, discharge summary and clinical billing. It may use physical accommodations, but does not share boarding reservation status or boarding pricing. Conversion between boarding and hospital admission requires explicit close/open records and an audited handoff.

## Pet store, POS and inventory

1. Staff searches by barcode, SKU or name; barcode is optional. Scanner input behaves as keyboard input, and a fast keyboard/touch flow supports non-scannable goods.
2. POS identifies customer optionally/where required, adds variants and quantities, applies approved discounts, displays tax/total and payment options, and confirms sale. The server prices/validates the sale; clients do not calculate authoritative totals.
3. In one transaction, sale, lines, invoice/receivable decision, payment if captured, and stock movements are posted. Retries are idempotent. Concurrent sales lock lot/balance rows and follow a defined backorder/negative-stock policy.
4. Return references original sale lines and quantities, reason, condition and refund method. Refund and restock are separate decisions; accepted resalable goods create positive movement to the correct location/lot. Damaged/expired returns do not inflate sellable stock. Return cannot exceed sold net of earlier returns.
5. Purchasing creates PO, receives actual quantities, records supplier/lot/expiry and costs, and posts stock movements on receipt. Low-stock and expiry alerts are derived from configured thresholds and usable stock.

## Finance, audit and reports

Create receivables from clinic services, boarding fees, and retail sales with source references and a department dimension. One operational event must map to one invoice line/receivable. Payments can be split across invoices through allocations; balances are derived from posted debits/credits or maintained transactionally with reconciliation. Refunds reference original payments. Expenses require date, category, branch, amount, method and creator. Reports distinguish invoiced revenue, cash collected, refunds, expenses, and outstanding balances; retail/clinic/boarding views use the same underlying transactions and no duplicate shadow totals.

Audit events are written in the same transaction as sensitive state changes where feasible. Record who/when/which tenant and branch/which entity/action/reason/request id. Do not log passwords, tokens, full payment credentials or unnecessary clinical content. Corrections are explicit reversals/amendments, not silent deletion.

## Error and exception paths

- Duplicate customer/animal: show candidates and require deliberate merge/link decision; never auto-merge records.
- Appointment or accommodation conflict: server returns conflict; refresh availability and require user choice.
- Insufficient/expired stock: stop checkout/dispense or follow an explicitly approved backorder/override permission. Never silently reduce below zero.
- Payment provider/network retry: use idempotency key and reconcile provider reference before retrying a capture.
- Offline/disconnected POS: MVP should clearly block posting unless a separately designed offline ledger and synchronization strategy is approved.
- Cancellation: preserve posted history; reverse invoice/payment/stock effects with linked compensating records.
