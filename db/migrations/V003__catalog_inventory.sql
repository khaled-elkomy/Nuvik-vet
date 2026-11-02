-- Nuvik Vet catalog and inventory foundation. No reference or seed rows are inserted.

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    code text NOT NULL,
    name text NOT NULL,
    category text,
    description text,
    active boolean NOT NULL DEFAULT true,
    is_service boolean NOT NULL DEFAULT false,
    track_lots boolean NOT NULL DEFAULT false,
    default_unit_price numeric(14,2),
    currency varchar(3) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_clinic_code_unique UNIQUE (clinic_id, code),
    CONSTRAINT products_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT products_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT products_service_lot_incompatible CHECK (NOT (is_service AND track_lots)),
    CONSTRAINT products_default_price_nonnegative CHECK (default_unit_price IS NULL OR default_unit_price >= 0),
    CONSTRAINT products_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX products_clinic_active_name_idx ON products (clinic_id, active, name);
CREATE INDEX products_clinic_code_idx ON products (clinic_id, code);

CREATE TABLE product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    product_id uuid NOT NULL REFERENCES products(id),
    sku text NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    price numeric(14,2) NOT NULL,
    cost numeric(14,2) NOT NULL DEFAULT 0,
    currency varchar(3) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_variants_clinic_sku_unique UNIQUE (clinic_id, sku),
    CONSTRAINT product_variants_sku_nonempty CHECK (btrim(sku) <> ''),
    CONSTRAINT product_variants_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT product_variants_unit_nonempty CHECK (btrim(unit) <> ''),
    CONSTRAINT product_variants_price_nonnegative CHECK (price >= 0),
    CONSTRAINT product_variants_cost_nonnegative CHECK (cost >= 0),
    CONSTRAINT product_variants_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX product_variants_product_idx ON product_variants (clinic_id, product_id, active);
CREATE INDEX product_variants_branch_idx ON product_variants (clinic_id, branch_id, active);

CREATE TABLE product_barcodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    barcode text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_barcodes_clinic_barcode_unique UNIQUE (clinic_id, barcode),
    CONSTRAINT product_barcodes_barcode_nonempty CHECK (btrim(barcode) <> '')
);
CREATE INDEX product_barcodes_variant_idx ON product_barcodes (clinic_id, variant_id);

CREATE TABLE inventory_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    code text NOT NULL,
    name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_locations_clinic_branch_code_unique UNIQUE (clinic_id, branch_id, code),
    CONSTRAINT inventory_locations_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT inventory_locations_name_nonempty CHECK (btrim(name) <> '')
);
CREATE INDEX inventory_locations_branch_active_idx ON inventory_locations (clinic_id, branch_id, active);

CREATE TABLE inventory_lots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    location_id uuid NOT NULL REFERENCES inventory_locations(id),
    lot_number text NOT NULL,
    expiry_date date,
    received_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_lots_identity_unique UNIQUE (clinic_id, variant_id, location_id, lot_number),
    CONSTRAINT inventory_lots_number_nonempty CHECK (btrim(lot_number) <> ''),
    CONSTRAINT inventory_lots_expiry_valid CHECK (expiry_date IS NULL OR expiry_date >= received_at::date)
);
CREATE INDEX inventory_lots_expiry_idx ON inventory_lots (clinic_id, branch_id, expiry_date);
CREATE INDEX inventory_lots_variant_location_idx ON inventory_lots (clinic_id, variant_id, location_id);

CREATE TABLE stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    location_id uuid NOT NULL REFERENCES inventory_locations(id),
    lot_id uuid REFERENCES inventory_lots(id),
    movement_type text NOT NULL,
    quantity_delta numeric(14,3) NOT NULL,
    source_type text,
    source_id uuid,
    source_line_id uuid,
    actor_id uuid NOT NULL REFERENCES users(id),
    reversal_of uuid REFERENCES stock_movements(id),
    posted_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_quantity_nonzero CHECK (quantity_delta <> 0),
    CONSTRAINT stock_movements_type_allowed CHECK (movement_type IN ('goods_receipt', 'sale', 'return', 'adjustment', 'reversal')),
    CONSTRAINT stock_movements_direction_consistent CHECK (
        (movement_type IN ('goods_receipt', 'return') AND quantity_delta > 0)
        OR (movement_type = 'sale' AND quantity_delta < 0)
        OR movement_type IN ('adjustment', 'reversal')
    ),
    CONSTRAINT stock_movements_source_complete CHECK (
        (source_type IS NULL AND source_id IS NULL AND source_line_id IS NULL)
        OR (source_type IS NOT NULL AND btrim(source_type) <> '' AND source_id IS NOT NULL AND source_line_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX stock_movements_posting_identity_uq
    ON stock_movements (clinic_id, source_type, source_id, source_line_id, movement_type)
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_line_id IS NOT NULL;
CREATE INDEX stock_movements_variant_time_idx ON stock_movements (clinic_id, branch_id, variant_id, posted_at DESC);
CREATE INDEX stock_movements_location_time_idx ON stock_movements (clinic_id, branch_id, location_id, posted_at DESC);
CREATE INDEX stock_movements_lot_time_idx ON stock_movements (clinic_id, lot_id, posted_at DESC) WHERE lot_id IS NOT NULL;

CREATE TABLE stock_balances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    location_id uuid NOT NULL REFERENCES inventory_locations(id),
    variant_id uuid NOT NULL REFERENCES product_variants(id),
    lot_id uuid REFERENCES inventory_lots(id),
    on_hand numeric(14,3) NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- PostgreSQL treats NULLs as distinct in ordinary unique indexes; use separate null/non-null keys.
CREATE UNIQUE INDEX stock_balances_without_lot_uq
    ON stock_balances (clinic_id, branch_id, location_id, variant_id)
    WHERE lot_id IS NULL;
CREATE UNIQUE INDEX stock_balances_with_lot_uq
    ON stock_balances (clinic_id, branch_id, location_id, variant_id, lot_id)
    WHERE lot_id IS NOT NULL;
CREATE INDEX stock_balances_variant_idx ON stock_balances (clinic_id, branch_id, variant_id, location_id);

CREATE FUNCTION validate_product_variant_kind() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    product_is_service boolean;
BEGIN
    SELECT is_service INTO product_is_service FROM products WHERE id = NEW.product_id;
    IF product_is_service THEN
        RAISE EXCEPTION 'service products cannot have stock variants';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER product_variants_stock_product_only
BEFORE INSERT OR UPDATE OF product_id ON product_variants
FOR EACH ROW EXECUTE FUNCTION validate_product_variant_kind();

CREATE FUNCTION prevent_service_product_with_variants() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_service AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = NEW.id) THEN
        RAISE EXCEPTION 'a product with stock variants cannot become a service';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER products_service_no_variants
BEFORE UPDATE OF is_service ON products
FOR EACH ROW EXECUTE FUNCTION prevent_service_product_with_variants();

CREATE FUNCTION validate_inventory_lot() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    variant_product_id uuid;
    product_tracks_lots boolean;
BEGIN
    SELECT v.product_id, p.track_lots
      INTO variant_product_id, product_tracks_lots
      FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = NEW.variant_id;
    IF NOT FOUND OR NOT product_tracks_lots THEN
        RAISE EXCEPTION 'inventory lots require a lot-tracked product variant';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_lots_tracked_variant_only
BEFORE INSERT OR UPDATE OF variant_id ON inventory_lots
FOR EACH ROW EXECUTE FUNCTION validate_inventory_lot();

CREATE FUNCTION validate_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    product_is_service boolean;
    product_tracks_lots boolean;
    lot_variant uuid;
    lot_location uuid;
    lot_expiry date;
BEGIN
    SELECT p.is_service, p.track_lots
      INTO product_is_service, product_tracks_lots
      FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = NEW.variant_id;
    IF NOT FOUND OR product_is_service THEN
        RAISE EXCEPTION 'stock movements require a stocked product variant';
    END IF;
    IF product_tracks_lots AND NEW.lot_id IS NULL THEN
        RAISE EXCEPTION 'lot-tracked variants require an inventory lot';
    ELSIF NOT product_tracks_lots AND NEW.lot_id IS NOT NULL THEN
        RAISE EXCEPTION 'variants without lot tracking cannot use an inventory lot';
    END IF;
    IF NEW.lot_id IS NOT NULL THEN
        SELECT variant_id, location_id, expiry_date
          INTO lot_variant, lot_location, lot_expiry FROM inventory_lots WHERE id = NEW.lot_id;
        IF lot_variant IS DISTINCT FROM NEW.variant_id OR lot_location IS DISTINCT FROM NEW.location_id THEN
            RAISE EXCEPTION 'inventory lot must match movement variant and location';
        END IF;
        IF lot_expiry IS NOT NULL AND lot_expiry < CURRENT_DATE THEN
            RAISE EXCEPTION 'expired inventory lots cannot be posted';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movements_validate
BEFORE INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION validate_stock_movement();

CREATE FUNCTION reject_stock_movement_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements rows are append-only';
END;
$$;
CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_mutation();
CREATE TRIGGER stock_movements_no_truncate
BEFORE TRUNCATE ON stock_movements
FOR EACH STATEMENT EXECUTE FUNCTION reject_stock_movement_mutation();

-- stock_balances is a transactionally maintained projection; stock_movements is the immutable ledger.
CREATE FUNCTION apply_stock_movement_to_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.lot_id IS NULL THEN
        INSERT INTO stock_balances (clinic_id, branch_id, location_id, variant_id, lot_id, on_hand)
        VALUES (NEW.clinic_id, NEW.branch_id, NEW.location_id, NEW.variant_id, NULL, NEW.quantity_delta)
        ON CONFLICT (clinic_id, branch_id, location_id, variant_id) WHERE lot_id IS NULL
        DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = now();
    ELSE
        INSERT INTO stock_balances (clinic_id, branch_id, location_id, variant_id, lot_id, on_hand)
        VALUES (NEW.clinic_id, NEW.branch_id, NEW.location_id, NEW.variant_id, NEW.lot_id, NEW.quantity_delta)
        ON CONFLICT (clinic_id, branch_id, location_id, variant_id, lot_id) WHERE lot_id IS NOT NULL
        DO UPDATE SET on_hand = stock_balances.on_hand + EXCLUDED.on_hand, updated_at = now();
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movements_update_balance
AFTER INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION apply_stock_movement_to_balance();
