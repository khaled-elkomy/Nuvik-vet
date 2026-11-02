CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    name text NOT NULL,
    phone text,
    email text,
    address text,
    notes text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customers_name_nonempty CHECK (btrim(name) <> '')
);
CREATE INDEX customers_clinic_name_idx ON customers (clinic_id, name);
CREATE INDEX customers_clinic_phone_idx ON customers (clinic_id, phone) WHERE phone IS NOT NULL;

CREATE TABLE species (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    code text NOT NULL,
    label text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT species_clinic_code_unique UNIQUE (clinic_id, code),
    CONSTRAINT species_clinic_id_unique UNIQUE (clinic_id, id),
    CONSTRAINT species_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT species_label_nonempty CHECK (btrim(label) <> '')
);

CREATE TABLE breeds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    species_id uuid NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT breeds_clinic_species_code_unique UNIQUE (clinic_id, species_id, code),
    CONSTRAINT breeds_clinic_id_species_unique UNIQUE (clinic_id, id, species_id),
    CONSTRAINT breeds_species_fk FOREIGN KEY (clinic_id, species_id)
        REFERENCES species (clinic_id, id),
    CONSTRAINT breeds_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT breeds_label_nonempty CHECK (btrim(label) <> '')
);
CREATE INDEX breeds_clinic_species_active_idx ON breeds (clinic_id, species_id, active);

CREATE TABLE animals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    name text NOT NULL,
    species_id uuid NOT NULL,
    breed_id uuid,
    date_of_birth date,
    birth_date_estimated boolean NOT NULL DEFAULT false,
    sex text,
    microchip text,
    identifier text,
    status text NOT NULL DEFAULT 'active',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT animals_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT animals_species_fk FOREIGN KEY (clinic_id, species_id)
        REFERENCES species (clinic_id, id),
    CONSTRAINT animals_breed_species_fk FOREIGN KEY (clinic_id, breed_id, species_id)
        REFERENCES breeds (clinic_id, id, species_id),
    CONSTRAINT animals_status_allowed CHECK (status IN ('active', 'inactive', 'deceased')),
    CONSTRAINT animals_microchip_nonempty CHECK (microchip IS NULL OR btrim(microchip) <> ''),
    CONSTRAINT animals_identifier_nonempty CHECK (identifier IS NULL OR btrim(identifier) <> '')
);
CREATE INDEX animals_clinic_name_idx ON animals (clinic_id, name);
CREATE UNIQUE INDEX animals_clinic_microchip_unique_idx ON animals (clinic_id, microchip) WHERE microchip IS NOT NULL;
CREATE UNIQUE INDEX animals_clinic_identifier_unique_idx ON animals (clinic_id, identifier) WHERE identifier IS NOT NULL;

CREATE TABLE animal_owners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id uuid NOT NULL REFERENCES clinics(id),
    branch_id uuid NOT NULL REFERENCES branches(id),
    animal_id uuid NOT NULL REFERENCES animals(id),
    customer_id uuid NOT NULL REFERENCES customers(id),
    is_primary boolean NOT NULL DEFAULT false,
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_to timestamptz,
    secondary_contact_customer_id uuid REFERENCES customers(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT animal_owners_valid_range CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX animal_owners_one_current_primary_uq
    ON animal_owners (clinic_id, animal_id)
    WHERE is_primary AND valid_to IS NULL;
CREATE INDEX animal_owners_animal_current_idx
    ON animal_owners (clinic_id, animal_id, valid_to)
    WHERE valid_to IS NULL;
CREATE INDEX animal_owners_customer_history_idx
    ON animal_owners (clinic_id, customer_id, valid_from DESC);
