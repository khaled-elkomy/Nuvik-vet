-- Nuvik Vet suppliers and goods receiving. Posting stock movements is an application transaction.

CREATE UNIQUE INDEX inventory_locations_clinic_branch_id_v007_uq
    ON inventory_locations (clinic_id, branch_id, id);

CREATE TABLE suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    name text NOT NULL,
    phone text,
    notes text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT suppliers_clinic_id_unique UNIQUE (clinic_id, id),
    CONSTRAINT suppliers_name_nonempty CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX suppliers_clinic_name_lower_uq ON suppliers (clinic_id, lower(name));
CREATE INDEX suppliers_clinic_active_name_idx ON suppliers (clinic_id, active, lower(name));

CREATE TABLE goods_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    location_id uuid NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    supplier_reference text,
    notes text,
    status text NOT NULL DEFAULT 'draft',
    idempotency_key text,
    created_by uuid NOT NULL,
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT goods_receipts_clinic_branch_id_unique UNIQUE (clinic_id, branch_id, id),
    CONSTRAINT goods_receipts_branch_fk FOREIGN KEY (clinic_id, branch_id)
        REFERENCES branches (clinic_id, id),
    CONSTRAINT goods_receipts_supplier_fk FOREIGN KEY (clinic_id, supplier_id)
        REFERENCES suppliers (clinic_id, id),
    CONSTRAINT goods_receipts_location_fk FOREIGN KEY (clinic_id, branch_id, location_id)
        REFERENCES inventory_locations (clinic_id, branch_id, id),
    CONSTRAINT goods_receipts_created_by_fk FOREIGN KEY (clinic_id, branch_id, created_by)
        REFERENCES users (clinic_id, branch_id, id),
    CONSTRAINT goods_receipts_status_allowed CHECK (status IN ('draft', 'posted')),
    CONSTRAINT goods_receipts_idempotency_nonempty CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> ''),
    CONSTRAINT goods_receipts_posted_state CHECK (
        (status = 'draft' AND posted_at IS NULL) OR (status = 'posted' AND posted_at IS NOT NULL)
    )
);
CREATE UNIQUE INDEX goods_receipts_clinic_idempotency_uq
    ON goods_receipts (clinic_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX goods_receipts_supplier_time_idx ON goods_receipts (clinic_id, supplier_id, received_at DESC);
CREATE INDEX goods_receipts_branch_status_time_idx ON goods_receipts (clinic_id, branch_id, status, received_at DESC);

-- A draft may be finalized exactly once by changing status to posted and setting posted_at.
-- No other header values may change in the same finalization update; all posted receipts are immutable.
CREATE FUNCTION guard_goods_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'posted' THEN RAISE EXCEPTION 'posted goods receipts are immutable'; END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' OR NEW.posted_at IS NOT NULL THEN
            RAISE EXCEPTION 'goods receipts must be created as drafts';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status = 'posted' THEN RAISE EXCEPTION 'posted goods receipts are immutable'; END IF;
    IF NEW.status = 'posted' AND NEW.posted_at IS NOT NULL
       AND (to_jsonb(NEW) - 'status' - 'posted_at' - 'updated_at') =
           (to_jsonb(OLD) - 'status' - 'posted_at' - 'updated_at') THEN
        RETURN NEW;
    END IF;
    IF NEW.status = 'draft' AND NEW.posted_at IS NULL THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'draft goods receipts may only be finalized as posted with a posting timestamp';
END;
$$;
CREATE TRIGGER goods_receipts_finalize_guard
BEFORE INSERT OR UPDATE OR DELETE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION guard_goods_receipt_mutation();

CREATE TABLE goods_receipt_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL,
    receipt_id uuid NOT NULL,
    line_no int NOT NULL,
    variant_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_cost numeric(12,4) NOT NULL,
    lot_number text,
    expiry_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT goods_receipt_lines_receipt_line_unique UNIQUE (receipt_id, line_no),
    CONSTRAINT goods_receipt_lines_receipt_fk FOREIGN KEY (clinic_id, branch_id, receipt_id)
        REFERENCES goods_receipts (clinic_id, branch_id, id),
    CONSTRAINT goods_receipt_lines_variant_fk FOREIGN KEY (clinic_id, branch_id, variant_id)
        REFERENCES product_variants (clinic_id, branch_id, id),
    CONSTRAINT goods_receipt_lines_line_no_positive CHECK (line_no > 0),
    CONSTRAINT goods_receipt_lines_quantity_positive CHECK (quantity > 0),
    CONSTRAINT goods_receipt_lines_unit_cost_nonnegative CHECK (unit_cost >= 0),
    CONSTRAINT goods_receipt_lines_lot_nonempty CHECK (lot_number IS NULL OR btrim(lot_number) <> '')
);
CREATE INDEX goods_receipt_lines_receipt_idx ON goods_receipt_lines (clinic_id, branch_id, receipt_id, line_no);
CREATE INDEX goods_receipt_lines_variant_idx ON goods_receipt_lines (clinic_id, branch_id, variant_id);

CREATE FUNCTION guard_goods_receipt_line_editability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_receipt_id uuid;
    target_clinic_id uuid;
    target_branch_id uuid;
    parent_status text;
BEGIN
    target_receipt_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.receipt_id ELSE NEW.receipt_id END;
    target_clinic_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.clinic_id ELSE NEW.clinic_id END;
    target_branch_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.branch_id ELSE NEW.branch_id END;
    SELECT status INTO parent_status FROM goods_receipts
     WHERE id = target_receipt_id AND clinic_id = target_clinic_id AND branch_id = target_branch_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'goods receipt line parent was not found in the same clinic and branch'; END IF;
    IF parent_status = 'posted' THEN RAISE EXCEPTION 'goods receipt lines cannot change after posting'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.clinic_id <> OLD.clinic_id OR NEW.branch_id <> OLD.branch_id OR NEW.receipt_id <> OLD.receipt_id) THEN
        RAISE EXCEPTION 'goods receipt lines cannot be moved between receipts, branches, or clinics';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER goods_receipt_lines_draft_only
BEFORE INSERT OR UPDATE OR DELETE ON goods_receipt_lines
FOR EACH ROW EXECUTE FUNCTION guard_goods_receipt_line_editability();
