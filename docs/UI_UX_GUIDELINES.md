# Nuvik Vet — UI/UX Guidelines

This document defines a design direction; it does not redesign existing screens.

## Product structure

Use a persistent application shell with clinic/branch selector, global search, notifications, current user, language control, and clear role-aware navigation. Primary areas: Overview, Clinic, Boarding, Store/POS, Inventory & Purchasing, Finance, Reports, and Administration. Keep animal/customer identity visible in context, with clear breadcrumbs and prominent branch/date context. The dashboard should emphasize actionable queues (today's appointments, arrivals/departures, care tasks, low stock, overdue balances) rather than decorative metrics.

## Visual system

- Brand: **NUVIK VET**. Primary identity: deep forest green with white surfaces; use restrained green for primary actions and status, not as the only status cue.
- Define tokens for primary/darker green, neutral surfaces/text, borders, semantic success/warning/error/info, focus ring, spacing, radii, elevation and typography. Confirm final hex values and font licensing during visual design.
- Maintain strong contrast, visible focus, readable tables, clear empty/loading/error states, and consistent buttons, forms, dialogs, badges, cards and data grids.
- Use typography with Arabic glyph coverage and legibility. Pair a licensed Arabic/Latin family or compatible families and test mixed-direction names, numbers, currency and punctuation.

## Arabic RTL and English

Use a translation catalog and locale-aware formatting for all user-facing strings, dates, numbers and currency. Set document `lang` and `dir` from active locale; prefer CSS logical properties (`margin-inline-start`, `padding-inline`, `inset-inline`) over left/right. Mirror directional icons only when meaning is directional. Preserve barcode/SKU, phone, email and medical identifiers in left-to-right isolated spans. Never concatenate translated sentences from fragments. Test switching locale while preserving form data and navigation state.

## Responsive and task-oriented behavior

Support desktop workflows and tablet-first touch targets for reception, kennel and POS use. Tables should degrade to searchable cards or horizontally scroll with pinned key identity columns. Keep primary actions reachable, avoid hover-only actions, support keyboard navigation and scanner keyboard input, and provide confirmation for irreversible/financial actions. Reduce unnecessary modal nesting. Long forms should be sectioned and save drafts where clinical workflow allows.

### Key experience patterns

- **Animal profile:** owner/contact summary, species/breed and identity, alerts/allergies, dated weight/vital history, tabs for timeline, consultations, prescriptions, vaccinations, files and boarding history. Distinguish historical facts from current alerts.
- **Consultation:** compact animal context and allergy banner; structured examination and diagnoses with a free-text narrative; prescription and follow-up panels; save draft/sign controls with clear authorship and state.
- **Boarding board:** arrivals/departures, occupancy by accommodation, filters by branch/date/status, and visible care-task overdue indicators. Boarding and hospitalization must have visibly distinct labels and workflows.
- **Care tasks:** high-contrast due time, animal/accommodation, instruction, completion action, staff attribution, escalation/incident control. Avoid marking a medication task complete without recording administration details.
- **POS:** focus barcode/search on entry; cart, quantity, price/discount, tax and total remain visible; fast scanner/keyboard/touch operations; accessible stock and expiry notices; clear payment and receipt states. Prevent accidental duplicate submit while preserving safe retry behavior.
- **Reports:** date range, branch, department, currency and definition of metrics always visible; show invoiced vs collected vs outstanding distinctly.

## Accessibility and usability validation

Target WCAG 2.2 AA as a design goal. Use semantic labels, visible focus, contrast checks, keyboard operation, screen-reader announcements for async updates, reduced-motion support, and accessible validation summaries. Validate with representative reception, veterinarian, boarding and cashier tasks in Arabic and English on desktop/tablet before launch. This is guidance, not evidence of current compliance.
