-- Nuvik Vet exclusive-unit boarding reservations and append-only care notes.

CREATE UNIQUE INDEX customers_clinic_branch_id_v006_uq ON customers (clinic_id, branch_id, id);

CREATE TABLE boarding_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    size_class text,
    nightly_price numeric(12,2) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT boarding_units_clinic_branch_id_unique UNIQUE (clinic_id, branch_id, id),
    CONSTRAINT boarding_units_branch_fk FOREIGN KEY (clinic_id, branch_id)
        REFERENCES branches (clinic_id, id),
    CONSTRAINT boarding_units_branch_code_unique UNIQUE (clinic_id, branch_id, code),
    CONSTRAINT boarding_units_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT boarding_units_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT boarding_units_size_class_nonempty CHECK (size_class IS NULL OR btrim(size_class) <> ''),
    CONSTRAINT boarding_units_nightly_price_nonnegative CHECK (nightly_price >= 0)
);
CREATE INDEX boarding_units_branch_active_idx ON boarding_units (clinic_id, branch_id, active);
CREATE INDEX boarding_units_branch_size_class_idx ON boarding_units (clinic_id, branch_id, size_class) WHERE size_class IS NOT NULL;

CREATE TABLE boarding_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL,
    animal_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'reserved',
    planned_start timestamptz NOT NULL,
    planned_end timestamptz NOT NULL,
    actual_checkin_at timestamptz,
    actual_checkout_at timestamptz,
    nightly_price_snapshot numeric(12,2) NOT NULL,
    currency varchar(3) NOT NULL,
    billable_nights int,
    total_amount numeric(12,2),
    notes text,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT boarding_reservations_clinic_branch_id_unique UNIQUE (clinic_id, branch_id, id),
    CONSTRAINT boarding_reservations_branch_fk FOREIGN KEY (clinic_id, branch_id)
        REFERENCES branches (clinic_id, id),
    CONSTRAINT boarding_reservations_animal_fk FOREIGN KEY (clinic_id, branch_id, animal_id)
        REFERENCES animals (clinic_id, branch_id, id),
    CONSTRAINT boarding_reservations_customer_fk FOREIGN KEY (clinic_id, branch_id, customer_id)
        REFERENCES customers (clinic_id, branch_id, id),
    CONSTRAINT boarding_reservations_unit_fk FOREIGN KEY (clinic_id, branch_id, unit_id)
        REFERENCES boarding_units (clinic_id, branch_id, id),
    CONSTRAINT boarding_reservations_created_by_fk FOREIGN KEY (clinic_id, branch_id, created_by)
        REFERENCES users (clinic_id, branch_id, id),
    CONSTRAINT boarding_reservations_status_allowed CHECK (status IN ('reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
    CONSTRAINT boarding_reservations_planned_range CHECK (planned_end > planned_start),
    CONSTRAINT boarding_reservations_actual_range CHECK (
        actual_checkout_at IS NULL OR (actual_checkin_at IS NOT NULL AND actual_checkout_at > actual_checkin_at)
    ),
    CONSTRAINT boarding_reservations_nightly_price_nonnegative CHECK (nightly_price_snapshot >= 0),
    CONSTRAINT boarding_reservations_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT boarding_reservations_billable_nights_positive CHECK (billable_nights IS NULL OR billable_nights > 0),
    CONSTRAINT boarding_reservations_total_nonnegative CHECK (total_amount IS NULL OR total_amount >= 0)
);
ALTER TABLE boarding_reservations
    ADD CONSTRAINT boarding_reservations_unit_no_overlap
    EXCLUDE USING gist (
        clinic_id WITH =,
        branch_id WITH =,
        unit_id WITH =,
        tstzrange(planned_start, planned_end, '[)') WITH &&
    ) WHERE (status IN ('reserved', 'checked_in'));
ALTER TABLE boarding_reservations
    ADD CONSTRAINT boarding_reservations_animal_no_overlap
    EXCLUDE USING gist (
        clinic_id WITH =,
        branch_id WITH =,
        animal_id WITH =,
        tstzrange(planned_start, planned_end, '[)') WITH &&
    ) WHERE (status IN ('reserved', 'checked_in'));
CREATE INDEX boarding_reservations_animal_status_time_idx ON boarding_reservations (clinic_id, branch_id, animal_id, status, planned_start);
CREATE INDEX boarding_reservations_unit_status_time_idx ON boarding_reservations (clinic_id, branch_id, unit_id, status, planned_start);
CREATE INDEX boarding_reservations_customer_time_idx ON boarding_reservations (clinic_id, branch_id, customer_id, planned_start DESC);

CREATE TABLE boarding_care_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL,
    text text NOT NULL,
    recorded_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT boarding_care_notes_branch_fk FOREIGN KEY (clinic_id, branch_id)
        REFERENCES branches (clinic_id, id),
    CONSTRAINT boarding_care_notes_reservation_fk FOREIGN KEY (clinic_id, branch_id, reservation_id)
        REFERENCES boarding_reservations (clinic_id, branch_id, id),
    CONSTRAINT boarding_care_notes_recorded_by_fk FOREIGN KEY (clinic_id, branch_id, recorded_by)
        REFERENCES users (clinic_id, branch_id, id),
    CONSTRAINT boarding_care_notes_kind_allowed CHECK (kind IN ('food', 'medication', 'note', 'incident')),
    CONSTRAINT boarding_care_notes_text_nonempty CHECK (btrim(text) <> '')
);
CREATE INDEX boarding_care_notes_reservation_time_idx ON boarding_care_notes (clinic_id, branch_id, reservation_id, recorded_at DESC);
CREATE INDEX boarding_care_notes_author_time_idx ON boarding_care_notes (clinic_id, recorded_by, recorded_at DESC);

CREATE FUNCTION reject_boarding_care_note_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'boarding care notes are append-only';
END;
$$;
CREATE TRIGGER boarding_care_notes_append_only
BEFORE UPDATE OR DELETE ON boarding_care_notes
FOR EACH ROW EXECUTE FUNCTION reject_boarding_care_note_mutation();
CREATE TRIGGER boarding_care_notes_no_truncate
BEFORE TRUNCATE ON boarding_care_notes
FOR EACH STATEMENT EXECUTE FUNCTION reject_boarding_care_note_mutation();
