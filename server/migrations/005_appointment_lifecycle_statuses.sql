-- ========================================
-- إضافة حالات دورة حياة الموعد
-- ========================================

-- تعديل constraint الحالة لإضافة الحالات الجديدة
ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;

ALTER TABLE appointments ADD CONSTRAINT appointments_status_check 
CHECK (status = ANY (ARRAY[
  'مؤكد'::text,      -- مجدول/مؤكد (الافتراضي)
  'حضر',             -- وصل العيادة، تم تسجيل الحضور
  'جاري الكشف',      -- الطبيب بدأ الكشف
  'مكتمل',           -- انتهى الكشف/الزيارة
  'ملغي',            -- ملغي من قبل الاستقبال/المريض
  'لم يحضر'          -- لم يحضر في الموعد
]));

-- إضافة indexes للحالات الجديدة
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);