-- ========================================
-- ملف الطبيب: عنوان العيادة وشعارها (للهيدر في صفحة الروشتة)
-- ========================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_path TEXT;

-- ========================================
-- الروشتات المرسومة يدويًا (Canvas) — منفصلة عن جدول prescriptions
-- (اللي بيحتفظ بروشتات منظمة كأدوية/جرعات نصية)
-- ========================================
CREATE TABLE IF NOT EXISTS prescription_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES users(id),
  image_path TEXT NOT NULL,
  -- توكن مشاركة عشوائي (UUID) بيسمح بعرض الصورة من غير تسجيل دخول —
  -- بيتولّد وقت "إرسال واتساب"، وهو نفسه بيمثّل صلاحية الوصول (زي رابط مشاركة جوجل درايف)
  share_token UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescription_images_patient ON prescription_images(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_images_share_token ON prescription_images(share_token);
