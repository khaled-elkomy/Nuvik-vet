-- Unified invoices, payment allocation, and cashier shift schema. No returns, refunds, expenses, or seed rows.

CREATE TABLE cashier_shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    cashier_id uuid NOT NULL REFERENCES users(id),
    currency varchar(3) NOT NULL,
    status text NOT NULL DEFAULT 'open',
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    opening_cash numeric(14,2) NOT NULL DEFAULT 0,
    expected_cash numeric(14,2),
    counted_cash numeric(14,2),
    variance numeric(14,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cashier_shifts_status_allowed CHECK (status IN ('open', 'closed')),
    CONSTRAINT cashier_shifts_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT cashier_shifts_opening_cash_nonnegative CHECK (opening_cash >= 0),
    CONSTRAINT cashier_shifts_expected_cash_nonnegative CHECK (expected_cash IS NULL OR expected_cash >= 0),
    CONSTRAINT cashier_shifts_counted_cash_nonnegative CHECK (counted_cash IS NULL OR counted_cash >= 0),
    CONSTRAINT cashier_shifts_lifecycle CHECK (
        (status = 'open' AND closed_at IS NULL AND expected_cash IS NULL AND counted_cash IS NULL AND variance IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL AND closed_at >= opened_at
            AND expected_cash IS NOT NULL AND counted_cash IS NOT NULL AND variance IS NOT NULL)
    )
);
CREATE UNIQUE INDEX cashier_shifts_one_open_per_cashier_uq
    ON cashier_shifts (clinic_id, branch_id, cashier_id) WHERE status = 'open';
CREATE INDEX cashier_shifts_cashier_status_idx ON cashier_shifts (clinic_id, branch_id, cashier_id, status, opened_at DESC);

CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    customer_id uuid REFERENCES customers(id),
    invoice_number text,
    status text NOT NULL DEFAULT 'draft',
    currency varchar(3) NOT NULL,
    subtotal numeric(14,2) NOT NULL DEFAULT 0,
    discount_total numeric(14,2) NOT NULL DEFAULT 0,
    tax_total numeric(14,2) NOT NULL DEFAULT 0,
    total numeric(14,2) NOT NULL DEFAULT 0,
    idempotency_key text,
    request_hash text,
    created_by uuid NOT NULL REFERENCES users(id),
    finalized_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoices_number_nonempty CHECK (invoice_number IS NULL OR btrim(invoice_number) <> ''),
    CONSTRAINT invoices_status_allowed CHECK (status IN ('draft', 'open', 'paid', 'void')),
    CONSTRAINT invoices_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT invoices_amounts_nonnegative CHECK (subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND total >= 0),
    CONSTRAINT invoices_discount_not_above_subtotal CHECK (discount_total <= subtotal),
    CONSTRAINT invoices_finalization_state CHECK (
        (status = 'draft' AND invoice_number IS NULL AND finalized_at IS NULL)
        OR (status IN ('open', 'paid', 'void') AND invoice_number IS NOT NULL AND finalized_at IS NOT NULL)
    ),
    CONSTRAINT invoices_open_requires_customer CHECK (status <> 'open' OR customer_id IS NOT NULL),
    CONSTRAINT invoices_idempotency_nonempty CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> '')
);
CREATE UNIQUE INDEX invoices_clinic_number_uq ON invoices (clinic_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE UNIQUE INDEX invoices_clinic_idempotency_uq ON invoices (clinic_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX invoices_customer_date_idx ON invoices (clinic_id, customer_id, created_at DESC);
CREATE INDEX invoices_branch_status_date_idx ON invoices (clinic_id, branch_id, status, created_at DESC);

CREATE TABLE invoice_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    invoice_id uuid NOT NULL REFERENCES invoices(id),
    source_type text,
    source_id uuid,
    source_line_id uuid,
    variant_id uuid REFERENCES product_variants(id),
    service_product_id uuid REFERENCES products(id),
    location_id uuid REFERENCES inventory_locations(id),
    lot_id uuid REFERENCES inventory_lots(id),
    description text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    discount_amount numeric(14,2) NOT NULL DEFAULT 0,
    tax_amount numeric(14,2) NOT NULL DEFAULT 0,
    line_total numeric(14,2) NOT NULL,
    currency varchar(3) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoice_lines_source_complete CHECK (
        (source_type IS NULL AND source_id IS NULL AND source_line_id IS NULL)
        OR (source_type IS NOT NULL AND btrim(source_type) <> '' AND source_id IS NOT NULL AND source_line_id IS NOT NULL)
    ),
    CONSTRAINT invoice_lines_one_product_kind CHECK (num_nonnulls(variant_id, service_product_id) <= 1),
    CONSTRAINT invoice_lines_description_nonempty CHECK (btrim(description) <> ''),
    CONSTRAINT invoice_lines_quantity_positive CHECK (quantity > 0),
    CONSTRAINT invoice_lines_amounts_nonnegative CHECK (unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND line_total >= 0),
    CONSTRAINT invoice_lines_discount_within_gross CHECK (discount_amount <= round(quantity * unit_price, 2)),
    CONSTRAINT invoice_lines_arithmetic CHECK (line_total = round(quantity * unit_price, 2) - discount_amount + tax_amount),
    CONSTRAINT invoice_lines_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT invoice_lines_lot_requires_variant CHECK (lot_id IS NULL OR variant_id IS NOT NULL),
    CONSTRAINT invoice_lines_stock_requires_location CHECK (variant_id IS NULL OR location_id IS NOT NULL),
    CONSTRAINT invoice_lines_no_location_for_service CHECK (service_product_id IS NULL OR (location_id IS NULL AND lot_id IS NULL))
);
CREATE UNIQUE INDEX invoice_lines_source_identity_uq
    ON invoice_lines (clinic_id, source_type, source_id, source_line_id)
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_line_id IS NOT NULL;
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (clinic_id, invoice_id);
CREATE INDEX invoice_lines_variant_idx ON invoice_lines (clinic_id, variant_id) WHERE variant_id IS NOT NULL;

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    customer_id uuid REFERENCES customers(id),
    cashier_shift_id uuid REFERENCES cashier_shifts(id),
    received_by uuid NOT NULL REFERENCES users(id),
    amount numeric(14,2) NOT NULL,
    currency varchar(3) NOT NULL,
    method text NOT NULL,
    status text NOT NULL DEFAULT 'captured',
    reference text,
    idempotency_key text,
    request_hash text,
    captured_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payments_amount_positive CHECK (amount > 0),
    CONSTRAINT payments_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT payments_method_allowed CHECK (method IN ('cash', 'card', 'wallet', 'other')),
    CONSTRAINT payments_status_allowed CHECK (status IN ('captured', 'void')),
    CONSTRAINT payments_idempotency_nonempty CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> '')
);
CREATE UNIQUE INDEX payments_clinic_idempotency_uq ON payments (clinic_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX payments_customer_time_idx ON payments (clinic_id, customer_id, captured_at DESC);
CREATE INDEX payments_shift_time_idx ON payments (clinic_id, cashier_shift_id, captured_at DESC) WHERE cashier_shift_id IS NOT NULL;

CREATE TABLE payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    payment_id uuid NOT NULL REFERENCES payments(id),
    invoice_id uuid NOT NULL REFERENCES invoices(id),
    amount numeric(14,2) NOT NULL,
    currency varchar(3) NOT NULL,
    allocated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payment_allocations_payment_invoice_unique UNIQUE (payment_id, invoice_id),
    CONSTRAINT payment_allocations_amount_positive CHECK (amount > 0),
    CONSTRAINT payment_allocations_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX payment_allocations_invoice_idx ON payment_allocations (clinic_id, invoice_id);
CREATE INDEX payment_allocations_payment_idx ON payment_allocations (clinic_id, payment_id);

CREATE FUNCTION guard_invoice_finalization() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.finalized_at IS NOT NULL THEN
            RAISE EXCEPTION 'finalized invoices are immutable';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' OR NEW.finalized_at IS NOT NULL OR NEW.invoice_number IS NOT NULL THEN
            RAISE EXCEPTION 'invoices must be created as drafts without an invoice number';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.finalized_at IS NOT NULL THEN
        -- Finalized invoices are immutable. The only allowed status transitions are open->paid,
        -- open->void, and paid->void; no other column may change in those updates.
        IF ((OLD.status = 'open' AND NEW.status IN ('paid', 'void'))
            OR (OLD.status = 'paid' AND NEW.status = 'void'))
           AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'finalized invoices are immutable except open->paid, open->void, or paid->void status transitions';
    END IF;

    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'only draft invoices can be edited before finalization';
    END IF;
    IF NEW.status = 'draft' AND NEW.finalized_at IS NULL AND NEW.invoice_number IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.status IN ('open', 'paid') AND NEW.finalized_at IS NOT NULL AND NEW.invoice_number IS NOT NULL THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'draft invoices may only be finalized as open or paid with a number and finalization time';
END;
$$;
CREATE TRIGGER invoices_finalize_guard
BEFORE INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION guard_invoice_finalization();

CREATE FUNCTION guard_invoice_line_editability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    parent_invoice_id uuid;
    parent_status text;
    parent_finalized_at timestamptz;
    variant_tracks_lots boolean;
    variant_is_service boolean;
    service_is_service boolean;
    lot_variant_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.invoice_id <> OLD.invoice_id OR NEW.clinic_id <> OLD.clinic_id) THEN
        RAISE EXCEPTION 'invoice lines cannot be moved between invoices or clinics';
    END IF;
    parent_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
    SELECT status, finalized_at INTO parent_status, parent_finalized_at
      FROM invoices WHERE id = parent_invoice_id FOR UPDATE;
    IF NOT FOUND OR parent_status <> 'draft' OR parent_finalized_at IS NOT NULL THEN
        RAISE EXCEPTION 'invoice lines can only be inserted, edited, or deleted on draft invoices';
    END IF;
    IF TG_OP <> 'DELETE' THEN
        IF NEW.currency <> (SELECT currency FROM invoices WHERE id = NEW.invoice_id) THEN
            RAISE EXCEPTION 'invoice line currency must match its invoice';
        END IF;
        IF NEW.variant_id IS NOT NULL THEN
            SELECT p.track_lots, p.is_service INTO variant_tracks_lots, variant_is_service
              FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = NEW.variant_id;
            IF variant_is_service THEN RAISE EXCEPTION 'service products cannot be stocked invoice lines'; END IF;
            IF variant_tracks_lots AND NEW.lot_id IS NULL THEN RAISE EXCEPTION 'lot-tracked invoice lines require a selected lot'; END IF;
            IF NOT variant_tracks_lots AND NEW.lot_id IS NOT NULL THEN RAISE EXCEPTION 'non-lot-tracked invoice lines cannot select a lot'; END IF;
            IF NEW.lot_id IS NOT NULL THEN
                SELECT variant_id INTO lot_variant_id FROM inventory_lots WHERE id = NEW.lot_id;
                IF lot_variant_id IS DISTINCT FROM NEW.variant_id THEN RAISE EXCEPTION 'invoice lot does not match its product variant'; END IF;
            END IF;
        ELSIF NEW.service_product_id IS NOT NULL THEN
            SELECT is_service INTO service_is_service FROM products WHERE id = NEW.service_product_id;
            IF NOT service_is_service THEN RAISE EXCEPTION 'invoice service product must be marked as a service'; END IF;
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_lines_draft_only
BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
FOR EACH ROW EXECUTE FUNCTION guard_invoice_line_editability();

CREATE FUNCTION validate_payment_allocation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    payment_row payments%ROWTYPE;
    invoice_row invoices%ROWTYPE;
    payment_allocated numeric(14,2);
    invoice_allocated numeric(14,2);
BEGIN
    SELECT * INTO payment_row FROM payments WHERE id = NEW.payment_id FOR UPDATE;
    SELECT * INTO invoice_row FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
    IF NOT FOUND OR payment_row.id IS NULL OR invoice_row.id IS NULL THEN
        RAISE EXCEPTION 'payment allocation references an unknown payment or invoice';
    END IF;
    IF payment_row.status <> 'captured' OR invoice_row.status NOT IN ('open', 'paid') OR invoice_row.finalized_at IS NULL THEN
        RAISE EXCEPTION 'allocations require a captured payment and a finalized, non-void invoice';
    END IF;
    IF payment_row.clinic_id <> NEW.clinic_id OR invoice_row.clinic_id <> NEW.clinic_id THEN
        RAISE EXCEPTION 'payment allocation cannot cross clinics';
    END IF;
    IF payment_row.currency <> invoice_row.currency OR NEW.currency <> payment_row.currency THEN
        RAISE EXCEPTION 'payment allocation currency must match payment and invoice';
    END IF;
    IF payment_row.customer_id IS DISTINCT FROM invoice_row.customer_id THEN
        RAISE EXCEPTION 'payment and invoice customers must match';
    END IF;

    SELECT COALESCE(sum(amount), 0) INTO payment_allocated FROM payment_allocations WHERE payment_id = NEW.payment_id;
    SELECT COALESCE(sum(amount), 0) INTO invoice_allocated FROM payment_allocations WHERE invoice_id = NEW.invoice_id;
    IF payment_allocated + NEW.amount > payment_row.amount THEN
        RAISE EXCEPTION 'payment allocations cannot exceed the captured payment';
    END IF;
    IF invoice_allocated + NEW.amount > invoice_row.total THEN
        RAISE EXCEPTION 'payment allocations cannot exceed invoice outstanding total';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER payment_allocations_validate
BEFORE INSERT ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION validate_payment_allocation();

CREATE FUNCTION update_invoice_paid_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    allocated numeric(14,2);
    invoice_total numeric(14,2);
BEGIN
    SELECT total INTO invoice_total FROM invoices WHERE id = NEW.invoice_id;
    SELECT COALESCE(sum(amount), 0) INTO allocated FROM payment_allocations WHERE invoice_id = NEW.invoice_id;
    IF allocated = invoice_total THEN
        UPDATE invoices SET status = 'paid' WHERE id = NEW.invoice_id AND status = 'open';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER payment_allocations_update_paid_status
AFTER INSERT ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION update_invoice_paid_status();

CREATE FUNCTION enforce_payment_fully_allocated() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_payment_id uuid;
    payment_row payments%ROWTYPE;
    allocated numeric(14,2);
BEGIN
    IF TG_TABLE_NAME = 'payments' THEN
        target_payment_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        target_payment_id := OLD.payment_id;
    ELSE
        target_payment_id := NEW.payment_id;
    END IF;
    SELECT * INTO payment_row FROM payments WHERE id = target_payment_id;
    IF NOT FOUND OR payment_row.status = 'void' THEN RETURN NULL; END IF;
    SELECT COALESCE(sum(amount), 0) INTO allocated FROM payment_allocations WHERE payment_id = target_payment_id;
    IF allocated <> payment_row.amount THEN
        RAISE EXCEPTION 'captured payments must be fully allocated; no unapplied balance is allowed';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER payments_fully_allocated_ck
AFTER INSERT OR UPDATE ON payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_payment_fully_allocated();
CREATE CONSTRAINT TRIGGER payment_allocations_fully_allocated_ck
AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_payment_fully_allocated();

CREATE FUNCTION enforce_invoice_allocation_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_invoice_id uuid;
    invoice_row invoices%ROWTYPE;
    allocated numeric(14,2);
BEGIN
    IF TG_TABLE_NAME = 'invoices' THEN
        target_invoice_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        target_invoice_id := OLD.invoice_id;
    ELSE
        target_invoice_id := NEW.invoice_id;
    END IF;
    SELECT * INTO invoice_row FROM invoices WHERE id = target_invoice_id;
    IF NOT FOUND OR invoice_row.status = 'void' OR invoice_row.status = 'draft' THEN RETURN NULL; END IF;
    SELECT COALESCE(sum(amount), 0) INTO allocated FROM payment_allocations WHERE invoice_id = target_invoice_id;
    IF invoice_row.status = 'paid' AND allocated <> invoice_row.total THEN
        RAISE EXCEPTION 'paid invoices must be fully allocated';
    END IF;
    IF invoice_row.status = 'open' AND allocated >= invoice_row.total THEN
        RAISE EXCEPTION 'open invoices must have an outstanding balance';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER invoices_allocation_status_ck
AFTER INSERT OR UPDATE ON invoices
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_invoice_allocation_status();
CREATE CONSTRAINT TRIGGER payment_allocations_invoice_status_ck
AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_invoice_allocation_status();
