-- Nuvik Vet clinical records and prescription foundation. No seed rows are inserted.

-- Composite keys let later migrations enforce clinic/branch scope on related records.
CREATE UNIQUE INDEX animals_clinic_branch_id_v005_uq ON animals (clinic_id, branch_id, id);
CREATE UNIQUE INDEX users_clinic_branch_id_v005_uq ON users (clinic_id, branch_id, id);
CREATE UNIQUE INDEX product_variants_clinic_id_v005_uq ON product_variants (clinic_id, id);
CREATE UNIQUE INDEX product_variants_clinic_branch_id_v005_uq ON product_variants (clinic_id, branch_id, id);

CREATE TABLE medications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    name text NOT NULL,
    form text NOT NULL,
    strength text,
    default_unit text NOT NULL,
    product_variant_id uuid,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT medications_clinic_id_unique UNIQUE (clinic_id, id),
    CONSTRAINT medications_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT medications_form_nonempty CHECK (form IS NULL OR btrim(form) <> ''),
    CONSTRAINT medications_strength_nonempty CHECK (strength IS NULL OR btrim(strength) <> ''),
    CONSTRAINT medications_default_unit_nonempty CHECK (default_unit IS NULL OR btrim(default_unit) <> ''),
    CONSTRAINT medications_product_variant_fk FOREIGN KEY (clinic_id, product_variant_id)
        REFERENCES product_variants (clinic_id, id)
);
CREATE UNIQUE INDEX medications_clinic_normalized_name_strength_uq
    ON medications (clinic_id, lower(name), COALESCE(strength, ''));
CREATE INDEX medications_clinic_active_name_idx ON medications (clinic_id, active, lower(name));

CREATE TABLE consultations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL,
    animal_id uuid NOT NULL,
    vet_user_id uuid NOT NULL,
    consulted_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'draft',
    reason text,
    weight_kg numeric(6,2),
    temperature_c numeric(4,1),
    heart_rate int,
    respiratory_rate int,
    diagnosis text,
    notes text,
    follow_up_date date,
    completed_at timestamptz,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT consultations_clinic_branch_id_unique UNIQUE (clinic_id, branch_id, id),
    CONSTRAINT consultations_branch_fk FOREIGN KEY (clinic_id, branch_id)
        REFERENCES branches (clinic_id, id),
    CONSTRAINT consultations_animal_fk FOREIGN KEY (clinic_id, branch_id, animal_id)
        REFERENCES animals (clinic_id, branch_id, id),
    CONSTRAINT consultations_vet_fk FOREIGN KEY (clinic_id, branch_id, vet_user_id)
        REFERENCES users (clinic_id, branch_id, id),
    CONSTRAINT consultations_created_by_fk FOREIGN KEY (clinic_id, branch_id, created_by)
        REFERENCES users (clinic_id, branch_id, id),
    CONSTRAINT consultations_status_allowed CHECK (status IN ('draft', 'completed', 'cancelled')),
    CONSTRAINT consultations_weight_positive CHECK (weight_kg IS NULL OR weight_kg > 0),
    CONSTRAINT consultations_temperature_range CHECK (temperature_c IS NULL OR temperature_c BETWEEN 30 AND 45),
    CONSTRAINT consultations_heart_rate_positive CHECK (heart_rate IS NULL OR heart_rate > 0),
    CONSTRAINT consultations_respiratory_rate_positive CHECK (respiratory_rate IS NULL OR respiratory_rate > 0)
);
CREATE INDEX consultations_animal_time_idx ON consultations (clinic_id, branch_id, animal_id, consulted_at DESC);
CREATE INDEX consultations_vet_time_idx ON consultations (clinic_id, branch_id, vet_user_id, consulted_at DESC);
CREATE INDEX consultations_branch_status_time_idx ON consultations (clinic_id, branch_id, status, consulted_at DESC);

CREATE FUNCTION reject_consultation_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'consultations are clinical facts and cannot be deleted';
END;
$$;
CREATE TRIGGER consultations_no_delete
BEFORE DELETE ON consultations
FOR EACH ROW EXECUTE FUNCTION reject_consultation_delete();

CREATE TABLE prescriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL,
    consultation_id uuid NOT NULL,
    animal_id uuid NOT NULL,
    vet_user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    issued_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prescriptions_clinic_id_unique UNIQUE (clinic_id, id),
    CONSTRAINT prescriptions_clinic_branch_id_unique UNIQUE (clinic_id, branch_id, id),
    CONSTRAINT prescriptions_branch_fk FOREIGN KEY (clinic_id, branch_id)
        REFERENCES branches (clinic_id, id),
    CONSTRAINT prescriptions_consultation_fk FOREIGN KEY (clinic_id, branch_id, consultation_id)
        REFERENCES consultations (clinic_id, branch_id, id),
    CONSTRAINT prescriptions_animal_fk FOREIGN KEY (clinic_id, branch_id, animal_id)
        REFERENCES animals (clinic_id, branch_id, id),
    CONSTRAINT prescriptions_vet_fk FOREIGN KEY (clinic_id, branch_id, vet_user_id)
        REFERENCES users (clinic_id, branch_id, id),
    CONSTRAINT prescriptions_status_allowed CHECK (status IN ('draft', 'issued')),
    CONSTRAINT prescriptions_issued_at_state CHECK (
        (status = 'draft' AND issued_at IS NULL) OR (status = 'issued' AND issued_at IS NOT NULL)
    )
);
CREATE INDEX prescriptions_animal_time_idx ON prescriptions (clinic_id, branch_id, animal_id, created_at DESC);
CREATE INDEX prescriptions_consultation_idx ON prescriptions (clinic_id, branch_id, consultation_id);
CREATE INDEX prescriptions_vet_time_idx ON prescriptions (clinic_id, branch_id, vet_user_id, created_at DESC);

CREATE FUNCTION guard_prescription_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'prescriptions are clinical facts and cannot be deleted';
    END IF;
    IF OLD.status = 'issued' AND NEW.status = 'draft' THEN
        RAISE EXCEPTION 'an issued prescription cannot return to draft';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER prescriptions_no_delete_or_downgrade
BEFORE UPDATE OR DELETE ON prescriptions
FOR EACH ROW EXECUTE FUNCTION guard_prescription_mutation();

CREATE TABLE prescription_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    prescription_id uuid NOT NULL,
    medication_id uuid,
    medication_name text NOT NULL,
    dose text NOT NULL,
    route text NOT NULL,
    frequency text NOT NULL,
    duration_days int NOT NULL,
    instructions text NOT NULL,
    quantity numeric(14,3),
    sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prescription_items_prescription_fk FOREIGN KEY (clinic_id, prescription_id)
        REFERENCES prescriptions (clinic_id, id),
    CONSTRAINT prescription_items_medication_fk FOREIGN KEY (clinic_id, medication_id)
        REFERENCES medications (clinic_id, id),
    CONSTRAINT prescription_items_medication_name_nonempty CHECK (btrim(medication_name) <> ''),
    CONSTRAINT prescription_items_duration_positive CHECK (duration_days > 0),
    CONSTRAINT prescription_items_quantity_positive CHECK (quantity IS NULL OR quantity > 0),
    CONSTRAINT prescription_items_sort_order_nonnegative CHECK (sort_order >= 0)
);
CREATE INDEX prescription_items_parent_order_idx ON prescription_items (clinic_id, prescription_id, sort_order, id);
CREATE INDEX prescription_items_medication_idx ON prescription_items (clinic_id, medication_id) WHERE medication_id IS NOT NULL;

CREATE FUNCTION guard_prescription_item_editability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_prescription_id uuid;
    target_clinic_id uuid;
    parent_status text;
BEGIN
    target_prescription_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.prescription_id ELSE NEW.prescription_id END;
    target_clinic_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.clinic_id ELSE NEW.clinic_id END;
    SELECT status INTO parent_status
      FROM prescriptions
     WHERE id = target_prescription_id AND clinic_id = target_clinic_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'prescription item parent was not found in the same clinic'; END IF;
    IF parent_status = 'issued' THEN
        RAISE EXCEPTION 'prescription items cannot be changed after issue';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.clinic_id <> OLD.clinic_id OR NEW.prescription_id <> OLD.prescription_id) THEN
        RAISE EXCEPTION 'prescription items cannot be moved between prescriptions or clinics';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER prescription_items_draft_only
BEFORE INSERT OR UPDATE OR DELETE ON prescription_items
FOR EACH ROW EXECUTE FUNCTION guard_prescription_item_editability();
