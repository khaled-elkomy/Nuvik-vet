# Database migrations

Nuvik Vet schema changes are managed by Flyway SQL migrations in `migrations/`. PostgreSQL initialization must not run migrations automatically. Run Flyway as a deliberate deployment step after reviewing the target database and backup state.

## Foundation migration

`V001__foundation.sql` creates the clinic, branch, user, role, permission, role-permission, user-role, and append-only audit foundation. It creates the required `btree_gist` extension but inserts no clinic, branch, user, role, permission, or demo rows. PostgreSQL 16 provides `gen_random_uuid()` without installing `pgcrypto`.

Flyway creates and maintains its own `flyway_schema_history` table. No application-owned `schema_migrations` table is created. Flyway's versioned SQL checksum validation detects edits to already-applied migrations; add a new versioned migration for later changes. Flyway serializes concurrent migration attempts with database locking. A failed PostgreSQL migration is expected to roll back transactionally where supported; inspect `flyway info` and the database before retrying any failure.

The database operator must have permission to install `btree_gist` if it is not already installed. The migration does not create database login roles or credentials. Permission codes are installation-wide reference rows when later seeded; roles, grants, users, and operational records are clinic scoped. This foundation uses UUID foreign keys but does not yet enforce clinic/branch consistency through composite foreign keys; that is explicitly outside the current MVP database design.

## Controlled use

Use a Flyway CLI version compatible with the repository's PostgreSQL driver and supply the URL, username, and password through a private local config or runtime environment. `flyway.conf.example` contains placeholders only. Keep real credentials outside version control, do not put them in migration files, and do not enable automatic migration during PostgreSQL/container initialization.

Typical controlled commands are `flyway info`, `flyway validate`, and, only after approval of the target and backup plan, `flyway migrate`. Review migration output and `flyway info` after each run. Do not edit an applied versioned migration; create the next version instead.

## Database roles and privileges

Use a dedicated migration-owner role for the Nuvik Vet schema. That role owns the schema, runs Flyway, and must have the authority needed to create `btree_gist` when it is not already installed. Use a separate least-privilege runtime application role. Grant it only the `SELECT`, `INSERT`, and `UPDATE` privileges required by operational tables; grant `DELETE` only on tables and workflows where deletion is truly needed. On `audit_events`, grant **only `SELECT` and `INSERT`**: never grant `UPDATE`, `DELETE`, or `TRUNCATE`. Do not grant the runtime role access to `flyway_schema_history` or any DDL privileges. The operator creates these database roles and their passwords outside migrations; migrations contain no role or password creation.

## First run / bootstrap

V001 creates no clinic, branch, administrator, or application roles. A separate, reviewed bootstrap step (a future task) must create the initial clinic, branch, administrator, and required role/permission rows. Do not treat a successful schema migration as a ready-to-use application database.

## Before migrating

Take a backup of the target database and verify that the backup can be read/restored before applying migrations. Confirm the target database identity, then run `flyway info` and `flyway validate` before `flyway migrate`.

## Extension note

`btree_gist` installation privileges must be verified with a **non-superuser database owner** on a fresh empty database. This was verified successfully on disposable PostgreSQL 16.15: a `NOSUPERUSER` database owner applied V001, including `CREATE EXTENSION btree_gist`. Other PostgreSQL installations and extension packaging remain unverified and must be checked in their target environment; do not infer the result from a superuser test.

