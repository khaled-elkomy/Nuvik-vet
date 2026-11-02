CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================================
-- المستخدمون (ريسبشن / دكاترة)
-- ========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('reception', 'doctor')),
  specialty TEXT,           -- لو الدور دكتور
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- المرضى
-- ========================================
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('ذكر', 'أنثى')),
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  blood_type TEXT,
  allergies TEXT[] DEFAULT '{}',
  chronic_diseases TEXT[] DEFAULT '{}',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'نشط' CHECK (status IN ('نشط', 'غير نشط', 'متابعة')),
  last_visit DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- الزيارات
-- ========================================
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES users(id),
  visit_date DATE NOT NULL,
  visit_type TEXT NOT NULL,
  chief_complaint TEXT,
  symptoms TEXT,
  diagnosis TEXT NOT NULL,
  notes TEXT,
  blood_pressure TEXT,
  heart_rate TEXT,
  temperature TEXT,
  weight TEXT,
  height TEXT,
  medications TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- الروشتات
-- ========================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES users(id),
  prescription_date DATE NOT NULL,
  diagnosis TEXT NOT NULL,
  medications JSONB NOT NULL DEFAULT '[]', -- [{name, dosage, duration}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- المرفقات (تحاليل / أشعة / تقارير)
-- ========================================
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('تحليل دم', 'أشعة', 'تقرير طبي')),
  file_path TEXT NOT NULL,     -- المسار محليًا الآن (أو مفتاح Object Storage لاحقًا)
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- المواعيد
-- ========================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES users(id),
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  appointment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'مؤكد' CHECK (status IN ('مؤكد', 'في الانتظار', 'مكتمل', 'ملغي')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================================
-- قائمة الانتظار (Check-in) — جوهر الربط بين الريسبشن والدكتور لحظيًا
-- ========================================
CREATE TABLE IF NOT EXISTS queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES users(id),           -- الدكتور المخصص (اختياري)
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'done', 'cancelled')),
  note TEXT,
  checked_in_by UUID REFERENCES users(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_attachments_patient ON attachments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_entries(status);
