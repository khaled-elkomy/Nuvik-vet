-- Version 2: patient-level medical history, operations, and investigations.
-- These records are separate from visits and retain their medical authorship.

CREATE TABLE IF NOT EXISTS patient_medical_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  known_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS patient_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES users(id),
  operation_name TEXT NOT NULL,
  description TEXT,
  surgeon_name TEXT,
  operation_date DATE,
  facility TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS investigation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('laboratory', 'radiology')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, category)
);

CREATE TABLE IF NOT EXISTS patient_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  investigation_type_id UUID NOT NULL REFERENCES investigation_types(id),
  doctor_id UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'completed', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id)
);

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_follow_up BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_patient_medical_history_patient ON patient_medical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_operations_patient ON patient_operations(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_investigations_patient ON patient_investigations(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_follow_up_patient ON appointments(patient_id) WHERE is_follow_up = true;

-- Starter master data lives in the database, so the UI does not hard-code test names.
INSERT INTO investigation_types (name, category) VALUES
  ('CBC', 'laboratory'),
  ('Blood glucose', 'laboratory'),
  ('Liver function tests', 'laboratory'),
  ('Kidney function tests', 'laboratory'),
  ('Urinalysis', 'laboratory'),
  ('Lipid profile', 'laboratory'),
  ('X-Ray', 'radiology'),
  ('Ultrasound', 'radiology'),
  ('CT', 'radiology'),
  ('MRI', 'radiology'),
  ('Echo', 'radiology')
ON CONFLICT (name, category) DO NOTHING;
