# Nuvik Vet — System Architecture

## Purpose and evidence boundary

This is an analysis and target architecture for the copied `clinic-prototype` repository. Product features and a veterinary schema have not been implemented. A later isolation/configuration pass added dedicated Nuvik ports, Docker resources, JWT issuer/audience, optional HTTPS, and upload limits. The inherited migration chain was audited separately in [MIGRATION_AUDIT.md](MIGRATION_AUDIT.md); none of those SQL files were executed or changed. Port availability remains a point-in-time check, not a reservation.

## Current architecture

The codebase is a small full-stack modular application, not yet a deployable multi-tenant product:

- **Web:** React 18 + TypeScript + Vite, React Router, Tailwind CSS, Lucide icons, `AppContext`, page components, and API/socket clients under `src/`.
- **API:** Node 20 / TypeScript / Express 4 under `server/src`, with route modules for auth, users, patients, visits, prescriptions, attachments, appointments, queue, medical records, and finance. Socket.IO broadcasts queue events to role/doctor rooms.
- **Data:** PostgreSQL accessed with `pg` and parameterized SQL. The eleven SQL migrations are inherited Human Clinic schema, not a Nuvik schema. There is no general migration runner; the old one-off `apply-migration.cjs` handles only migration 010. The Compose init-directory mount and copying of inherited migrations into the API image were removed; PostgreSQL will start schema-empty until a reviewed Nuvik migration plan exists.
- **Runtime:** Docker Compose defines isolated PostgreSQL, API, Vite web, and Nginx services. Nginx HTTP is independent of HTTPS certificates; HTTPS is loaded only when local cert/key files exist. API health orchestration, backup scripts, and formal CI were not found. Backend tests remain ad hoc scripts, not an automatically discovered suite; their API targets have been redirected to Nuvik's loopback port but their human-clinic fixtures still need replacement.
- **Storage:** Multer memory upload with a 50 MB per-file cap, a 50 MiB request cap, and `file-type` content sniffing, then local UUID-named files in `server/uploads`; sensitive patient files use protected endpoints. Clinic logo is public. Compose persists uploads in a unique named volume. Express JSON remains capped at 2 MB because JSON parsing is separate from multipart upload.
- **Identity:** email/password login, bcryptjs password hashes, bearer JWT, role middleware (`reception`, `doctor`), and doctor-to-patient assignment checks. The token uses issuer `nuvik-vet`, audience `nuvik-vet-api`, and a Nuvik-specific browser storage key. No authentication cookie, refresh/revocation flow, or rate limiting is implemented. Socket.IO clients identify with the bearer token and server verifies issuer/audience.
- **Errors/logging:** centralized Express JSON error handler and console logging. There is no structured logger, request correlation, or demonstrated centralized monitoring.

### Component communication

Browser React pages call `src/lib/api.ts` over HTTP to the Express `/api/*` routes. Express middleware verifies the JWT, performs role and record-scope checks, then issues parameterized SQL through a shared `pg.Pool` to PostgreSQL. Upload handlers write files on the API host/container. Queue mutations emit Socket.IO messages to a reception room and a doctor-specific room. There is no message broker or separate service boundary.

### Current schema/domain scope

Human-clinic entities include users, patients (human demographic/medical fields), visits, prescriptions (JSONB medication list), prescription images, attachments, appointments, doctor assignments, queue entries, doctor schedules, investigations/history/operations, services, invoices/items, payments, refunds, expenses, commissions, cashier closings, and financial audit logs. There are no animal owners/pets, species/breeds, boarding/hospitalization, products, stock ledger, purchase orders, or supplier entities.

### Current material findings and gaps

- The copied baseline Compose file had generic resource names, PostgreSQL published on `5432`, API published on `4001`, sample credentials, and a placeholder JWT secret. It has since been replaced with a Nuvik-only Compose project, private PostgreSQL, generated local credentials, named resources, and API port `4108`.
- Vite and the API now use Nuvik-specific port `5178` and an explicit CORS allowlist for the direct development and local proxy origins. Vite proxy routes `/api`, `/socket.io`, and `/uploads` to the isolated API.
- Root and server local `.env` files now contain Nuvik-specific values, and `.env.nuvik` supplies Compose secrets. Docker build contexts exclude these files and local TLS key/certificate files.
- JWTs now carry and validate issuer `nuvik-vet` and audience `nuvik-vet-api` for HTTP and Socket.IO. Authentication remains bearer-token based with a Nuvik-specific browser storage key; no auth cookie is currently issued. There is no refresh/revocation flow or demonstrated rate limiting. Backend route authorization is mixed: some modules apply `requireAuth` router-wide, while route-level enforcement varies. Audit authorization and privacy need a route-by-route review.
- Finance migration is useful as a business reference but its patient/visit/doctor ownership and service-line model is clinic-specific. `invoice.paid_amount` and `remaining_amount` duplicate data derivable from payments; keep only if transactionally reconciled or replace with derived balances. Financial records need immutable correction/refund semantics.
- Medical records use cascading deletes from patient to clinical records. Commercial records should generally be archived/retained with audited privacy workflows rather than silently cascaded away.
- Existing README includes demo credentials and warns it is not production-ready. It must not be reused as Nuvik setup guidance.

## Target architecture recommendation

Use a **modular monolith**: one independently deployable API organized by business modules, one web app, and one PostgreSQL database. Begin with modules for tenancy/identity, customers/pets, clinic, boarding, catalog/inventory, sales/purchasing, finance, files, and audit. Each module owns its routes, validation, application services, persistence queries, and domain rules. Share database transactions and identity primitives; keep module boundaries explicit. Avoid microservices until measured scale or independent release needs justify them.

Target request path: browser → Nginx/reverse proxy (optional in local development) → web static assets and `/api`/Socket.IO proxy → Express modular API → PostgreSQL and private object/file storage. In production, expose HTTPS only at the proxy, do not publish PostgreSQL, and keep file storage behind authorization. A single PostgreSQL database may host multiple organizations, but every business row must be scoped to a `clinic_id`/tenant and normally a `branch_id`; derive scope from authenticated membership, never trust a client-supplied tenant ID.

### Reuse assessment

| Existing component | Classification | Reason / work before reuse |
|---|---|---|
| Express + TypeScript API structure, `pg`, parameterized-query style | Reuse with modifications | Preserve stack; add module boundaries, validation, transaction helpers, tenant/branch context and migration tooling. |
| JWT authentication, bcrypt, role middleware | Reuse with modifications | Keep password hashing approach; create new Nuvik secrets, issuer/audience, token policy, tenant membership and permission model; add brute-force protection/revocation strategy. |
| Doctor assignment and role-scoped queue patterns | Reuse with modifications | Useful authorization patterns; redefine roles/permissions for veterinarians, reception, boarding, inventory, cashier, manager, tenant admin. |
| React/Vite/TypeScript, router, API client, component primitives/layout | Reuse with modifications | Useful shell and interaction patterns; replace human-clinic labels/flows, add i18n/RTL and accessible pet/boarding/POS workflows. |
| Tailwind theme and existing dashboard cards/tables/modals/toasts | Reuse with modifications | Audit components and keyboard/touch support; establish Nuvik tokens and consistent design system. |
| Medical attachment upload validation and private file route pattern | Reuse with modifications | Add authorization scope, malware scanning/quarantine, storage abstraction, file size/type policy and retention. |
| Finance money parsing, transactions, idempotency/audit pattern | Reuse with modifications | Strong reference for POS/payment idempotency; redesign invoice source and audit, tenant/branch, store/boarding lines, refunds and inventory coupling. |
| Current patients/visits/prescriptions schema and migration history | Rebuild for vet domain | Human patients are not animals; preserve conceptual patterns only, not schema assumptions or existing data. |
| Current Compose file and env values | Rebuild isolated configuration | Current names/ports/default credentials collide; create explicit Nuvik project/network/volumes and safe `.env.example`. |
| Current clinical business workflows / specialty screens | Rebuild | Human clinic-specific concepts and language are not vet flows. |
| Socket.IO queue updates | Reuse with modifications | Apply tenant/branch scoped channel authorization and reconnect/event versioning. |
| Ad hoc test scripts | Reuse selectively | Convert useful scenarios into maintained unit/integration/e2e suites; no assumption that they form reliable CI coverage. |
| Nginx, backup/restore automation | Not present | Design and implement specifically for Nuvik in later implementation phase. |
| Human-clinic data/secrets/database | Not needed | Nuvik must remain a separate product and data boundary. |

## Persistence and integrity principles

PostgreSQL remains the system of record. Use migrations tracked in a schema-version table and run them as a controlled deployment step. Use UUID primary keys, `NOT NULL`, `CHECK`, unique constraints, foreign keys, and indexes that include tenant/branch scope. Prefer `RESTRICT` for clinical/financial history, explicit soft archival where appropriate, and immutable ledger rows for stock and money. Store currency as integer minor units or fixed-scale `NUMERIC`, never floating point. Store timestamps in UTC and render by configured clinic timezone.

For stock, lock affected inventory/batch rows and append a stock movement within the same database transaction as sale/dispense/return; prevent negative available stock according to a documented policy. Prescribing creates a clinical order only. A separate dispense action creates sale/dispense lines and the movement. A boarding medication administration record references administration, not an inventory deduction unless a documented dispensing workflow supplies it. For financial actions, create invoice/source records and payment/refund ledger entries atomically, use idempotency keys, and never edit posted transactions in place. Corrections are reversal entries.

## Security, availability, and operations

Require backend authorization on every API and WebSocket event. Use tenant membership and branch access from verified server-side identity context. Validate input at the boundary with schemas; parameterize all SQL; apply output shaping and safe errors. Add login throttling, password policy/reset flow, secure token storage/policy, audit events for sensitive reads and mutations as required, TLS, security headers, dependency updates, and secrets outside source control. Treat uploads as hostile: content sniff, size limits, random keys, malware scanning/quarantine, private storage, authorization at download, and retention rules.

Operational readiness requires structured redacted logs, health/readiness checks, metrics/alerts, database connection limits, graceful shutdown, migration rollback/forward policy, encrypted off-host backups, documented restore drills, and tested recovery objectives. Do not describe the current or proposed system as production-ready until these controls are implemented and verified.

## Proposed local port allocation

See [PROJECT_ISOLATION.md](PROJECT_ISOLATION.md). Applied ports: web `5178`, API `4108`, PostgreSQL internal-only `5432` (not published), Nginx HTTP `8090`, and HTTPS `8449`. Host port `8088` is reserved by the Graduation Project / HTI Learning Hub. The approved ports were rechecked before configuration changes, and Compose configuration validation passed without starting services.
