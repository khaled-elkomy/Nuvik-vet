-- Nuvik Vet foundation. Flyway owns migration history; this migration creates no seed rows.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE clinics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    default_currency varchar(3) NOT NULL DEFAULT 'EGP',
    settings jsonb NOT NULL DEFAULT '{"allow_negative_stock": true}'::jsonb,
    invoice_number_counter bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clinics_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT clinics_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT clinics_currency_format CHECK (default_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT clinics_invoice_counter_positive CHECK (invoice_number_counter > 0),
    CONSTRAINT clinics_settings_object CHECK (
        jsonb_typeof(settings) = 'object'
        AND (
            NOT (settings ? 'allow_negative_stock')
            OR jsonb_typeof(settings -> 'allow_negative_stock') = 'boolean'
        )
    )
);

CREATE TABLE branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    code text NOT NULL,
    name text NOT NULL,
    timezone text NOT NULL DEFAULT 'Africa/Cairo',
    address text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT branches_clinic_id_id_unique UNIQUE (clinic_id, id),
    CONSTRAINT branches_clinic_code_unique UNIQUE (clinic_id, code),
    CONSTRAINT branches_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT branches_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT branches_timezone_nonempty CHECK (btrim(timezone) <> '')
);
CREATE INDEX branches_clinic_active_idx ON branches (clinic_id, active);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    normalized_email text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    locked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_clinic_email_unique UNIQUE (clinic_id, normalized_email),
    CONSTRAINT users_normalized_email CHECK (normalized_email = lower(btrim(normalized_email))),
    CONSTRAINT users_email_nonempty CHECK (normalized_email <> ''),
    CONSTRAINT users_password_hash_nonempty CHECK (btrim(password_hash) <> ''),
    CONSTRAINT users_display_name_nonempty CHECK (btrim(display_name) <> '')
);
CREATE INDEX users_clinic_active_idx ON users (clinic_id, active);
CREATE INDEX users_branch_active_idx ON users (clinic_id, branch_id, active);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT roles_clinic_code_unique UNIQUE (clinic_id, code),
    CONSTRAINT roles_code_allowed CHECK (code IN ('admin', 'vet', 'reception_cashier', 'store_keeper')),
    CONSTRAINT roles_name_nonempty CHECK (btrim(name) <> '')
);

-- Permission codes are installation-wide reference data; grants are clinic scoped.
CREATE TABLE permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT permissions_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT permissions_description_nonempty CHECK (btrim(description) <> '')
);

CREATE TABLE role_permissions (
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    role_id uuid NOT NULL REFERENCES roles(id),
    permission_id uuid NOT NULL REFERENCES permissions(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_id);

CREATE TABLE user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    user_id uuid NOT NULL REFERENCES users(id),
    role_id uuid NOT NULL REFERENCES roles(id),
    assigned_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles (clinic_id, role_id);
CREATE INDEX user_roles_assigned_by_idx ON user_roles (assigned_by);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    actor_id uuid REFERENCES users(id),
    event_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    event_at timestamptz NOT NULL DEFAULT now(),
    request_id text,
    safe_summary text NOT NULL DEFAULT '',
    CONSTRAINT audit_events_type_nonempty CHECK (btrim(event_type) <> ''),
    CONSTRAINT audit_events_entity_type_nonempty CHECK (btrim(entity_type) <> '')
);
CREATE INDEX audit_events_clinic_branch_time_idx ON audit_events (clinic_id, branch_id, event_at);
CREATE INDEX audit_events_actor_time_idx ON audit_events (clinic_id, actor_id, event_at);
CREATE INDEX audit_events_entity_idx ON audit_events (clinic_id, entity_type, entity_id, event_at);

CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_events rows are append-only';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON audit_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_event_mutation();


