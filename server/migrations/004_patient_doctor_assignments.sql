-- ========================================
-- علاقة المريض بالدكتور (تعيين دائم للرعاية الطبية)
-- ========================================
CREATE TABLE IF NOT EXISTS patient_doctors (
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (patient_id, doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_doctors_doctor ON patient_doctors(doctor_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_patient_doctors_patient ON patient_doctors(patient_id) WHERE is_active = true;

-- ========================================
-- تعبئة البيانات من السجلات الموجودة
-- ========================================

-- من قائمة الانتظار (queue_entries) - علاقات حديثة وصحيحة
INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
SELECT DISTINCT qe.patient_id, qe.doctor_id, qe.checked_in_by, qe.checked_in_at, true
FROM queue_entries qe
WHERE qe.doctor_id IS NOT NULL
  AND qe.status IN ('waiting', 'in_progress', 'done')
ON CONFLICT (patient_id, doctor_id) DO NOTHING;

-- من الزيارات (visits) - الطبيب صاحب الزيارة
INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
SELECT DISTINCT v.patient_id, v.doctor_id, v.doctor_id, v.created_at, true
FROM visits v
WHERE v.doctor_id IS NOT NULL
ON CONFLICT (patient_id, doctor_id) DO NOTHING;

-- من الروشتات (prescriptions) - الطبيب صاحب الروشتة
INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
SELECT DISTINCT p.patient_id, p.doctor_id, p.doctor_id, p.created_at, true
FROM prescriptions p
WHERE p.doctor_id IS NOT NULL
ON CONFLICT (patient_id, doctor_id) DO NOTHING;

-- من الروشتات المرسومة (prescription_images) - الطبيب صاحب الروشتة
INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
SELECT DISTINCT pi.patient_id, pi.doctor_id, pi.doctor_id, pi.created_at, true
FROM prescription_images pi
WHERE pi.doctor_id IS NOT NULL
ON CONFLICT (patient_id, doctor_id) DO NOTHING;

-- من المواعيد (appointments) - الطبيب المحدد في الموعد
INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
SELECT DISTINCT a.patient_id, a.doctor_id, a.created_by, a.created_at, true
FROM appointments a
WHERE a.doctor_id IS NOT NULL
ON CONFLICT (patient_id, doctor_id) DO NOTHING;