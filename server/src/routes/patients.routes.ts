import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCanOpenChart, getAssignedPatients, ChartAccessError } from '../lib/authz.js';

export const patientsRouter = Router();
patientsRouter.use(requireAuth);

function mapPatient(row: any) {
  // DATE types returned as Date objects by pg, serialize to YYYY-MM-DD
  // TIMESTAMPTZ types returned as Date objects, serialize to YYYY-MM-DD
  const formatDate = (val: any) => {
    if (!val) return val;
    if (val instanceof Date) return val.toISOString().split('T')[0];
    return String(val).split('T')[0];
  };

  return {
    id: row.id,
    fileNumber: row.file_number,
    fullName: row.full_name,
    birthDate: formatDate(row.birth_date),
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
    bloodType: row.blood_type,
    allergies: row.allergies ?? [],
    chronicDiseases: row.chronic_diseases ?? [],
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    notes: row.notes,
    lastVisit: formatDate(row.last_visit),
    createdAt: formatDate(row.created_at),
  };
}

/** قائمة المرضى — الريسبشن يشوف الكل، والدكتور يشوف مرضاه المعينين فقط */
patientsRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const isReception = req.user!.role === 'reception';
  const isDoctor = req.user!.role === 'doctor';

  let result;
  if (isReception) {
    if (q) {
      result = await pool.query(
        `SELECT * FROM patients
         WHERE full_name ILIKE $1 OR file_number ILIKE $1 OR phone ILIKE $1
         ORDER BY created_at DESC LIMIT 100`,
        [`%${q}%`],
      );
    } else {
      result = await pool.query(`SELECT * FROM patients ORDER BY created_at DESC LIMIT 200`);
    }
  } else if (isDoctor) {
    const rows = await getAssignedPatients(req.user!.id, q || undefined);
    result = { rows };
  } else {
    result = { rows: [] };
  }
  res.json(result.rows.map(mapPatient));
});

/** ملف مريض واحد بالتفصيل — محمي بصلاحية فتح الملف */
patientsRouter.get('/:id', async (req, res) => {
  try {
    await assertCanOpenChart(req.user!, req.params.id, false);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    throw err;
  }
  const result = await pool.query(`SELECT * FROM patients WHERE id = $1`, [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'المريض غير موجود' });
  res.json(mapPatient(result.rows[0]));
});

/**
 * البحث عن مرضى محتملين مكررين — للريسبشن فقط
 * يستخدم قبل إنشاء مريض جديد للكشف عن التكرارات المحتملة
 */
patientsRouter.post('/check-duplicate', requireRole('reception'), async (req, res) => {
  const { fullName, birthDate, phone, email } = req.body;
  
  if (!fullName || !phone || !birthDate) {
    return res.status(400).json({ error: 'الاسم، رقم الهاتف، وتاريخ الميلاد مطلوبون للبحث عن التكرارات' });
  }

  // بناء استعلام البحث عن التكرارات المحتملة
  // نبحث عن تطابق في: الاسم + تاريخ الميلاد + الهاتف/الإيميل
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // تطابق الاسم (تقريبي - يحتوي على الاسم)
  conditions.push(`full_name ILIKE $${paramIndex}`);
  params.push(`%${fullName}%`);
  paramIndex++;

  // تطابق تاريخ الميلاد
  conditions.push(`birth_date = $${paramIndex}`);
  params.push(birthDate);
  paramIndex++;

  // تطابق رقم الهاتف
  conditions.push(`phone = $${paramIndex}`);
  params.push(phone);
  paramIndex++;

  // تطابق الإيميل إن وجد
  if (email) {
    conditions.push(`email = $${paramIndex}`);
    params.push(email);
    paramIndex++;
  }

  const query = `
    SELECT id, file_number, full_name, birth_date, gender, phone, email
    FROM patients
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const result = await pool.query(query, params);
  
  // تحديد قوة التطابق
  const matches = result.rows.map(patient => {
    let score = 0;
    const reasons: string[] = [];

    // تطابق الاسم الكامل
    if (patient.full_name.toLowerCase() === fullName.toLowerCase()) {
      score += 50;
      reasons.push('اسم متطابق بالكامل');
    } else if (patient.full_name.toLowerCase().includes(fullName.toLowerCase()) || fullName.toLowerCase().includes(patient.full_name.toLowerCase())) {
      score += 30;
      reasons.push('اسم متشابه');
    }

    // تطابق تاريخ الميلاد
    if (patient.birth_date === birthDate) {
      score += 30;
      reasons.push('تاريخ ميلاد متطابق');
    }

    // تطابق رقم الهاتف
    if (patient.phone === phone) {
      score += 15;
      reasons.push('رقم هاتف متطابق');
    }

    // تطابق الإيميل
    if (email && patient.email === email) {
      score += 15;
      reasons.push('إيميل متطابق');
    }

    return {
      ...patient,
      matchScore: score,
      matchReasons: reasons,
    };
  });

  // تصفية النتائج التي لديها تطابق قوي (score >= 50)
  const strongMatches = matches.filter(m => m.matchScore >= 50);

  res.json({
    matches: strongMatches,
    allPotentialMatches: matches,
    hasStrongMatch: strongMatches.length > 0,
  });
});

/**
 * إضافة مريض جديد — الريسبشن فقط (الدكتور معندهوش صلاحية إضافة مريض في هذا الإصدار،
 * كل مريض لازم يدخل النظام عن طريق الاستقبال).
 *
 * بيقبل إما تاريخ ميلاد دقيق (birthDate) أو سن تقريبية (age) من نموذج الاستقبال السريع —
 * في حالة الـ age بس، بنحسب تاريخ ميلاد تقريبي (أول يناير من سنة الميلاد التقريبية)
 * عشان باقي النظام (حساب السن، التقارير) يفضل شغال عادي، وتقدر تعدّله لاحقًا من ملف المريض.
 */
patientsRouter.post('/', requireRole('reception'), async (req, res) => {
  const b = req.body;
  if (!b.fullName || !b.phone || (!b.birthDate && b.age === undefined)) {
    return res.status(400).json({ error: 'الاسم ورقم الهاتف وتاريخ الميلاد أو السن مطلوبون' });
  }

  const birthDate = b.birthDate || `${new Date().getFullYear() - Number(b.age)}-01-01`;

  const countResult = await pool.query(`SELECT COUNT(*) FROM patients`);
  const nextNumber = 1284 + Number(countResult.rows[0].count) + 1;
  const fileNumber = `PT-${String(nextNumber).padStart(6, '0')}`;

  const result = await pool.query(
    `INSERT INTO patients
      (file_number, full_name, birth_date, gender, phone, email, address, blood_type,
       allergies, chronic_diseases, emergency_contact_name, emergency_contact_phone, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      fileNumber, b.fullName, birthDate, b.gender ?? null, b.phone, b.email ?? null, b.address ?? null,
      b.bloodType ?? null, b.allergies ?? [], b.chronicDiseases ?? [],
      b.emergencyContactName ?? null, b.emergencyContactPhone ?? null, b.notes ?? null,
      req.user!.id,
    ],
  );
  res.status(201).json(mapPatient(result.rows[0]));
});

/**
 * تعديل بيانات مريض.
 * الريسبشن: بيانات الهوية والاتصال فقط.
 * الدكتور: بيانات الهوية + الحقول الطبية (allergies, chronicDiseases, notes).
 */
patientsRouter.patch('/:id', async (req, res) => {
  const b = req.body;
  const isReception = req.user!.role === 'reception';

  // بناء الاستعلام ديناميكياً حسب الدور
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const addField = (fieldName: string, dbColumn: string, value: any) => {
    if (value !== undefined) {
      fields.push(`${dbColumn} = COALESCE($${paramIndex}, ${dbColumn})`);
      values.push(value);
      paramIndex++;
    }
  };

  // حقول متاحة للجميع
  addField('fullName', 'full_name', b.fullName);
  addField('phone', 'phone', b.phone);
  addField('email', 'email', b.email);
  addField('address', 'address', b.address);
  addField('bloodType', 'blood_type', b.bloodType);

  // حقول طبية - للدكتور فقط
  if (!isReception) {
    addField('allergies', 'allergies', b.allergies);
    addField('chronicDiseases', 'chronic_diseases', b.chronicDiseases);
    addField('notes', 'notes', b.notes);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'لا توجد حقول للتعديل' });
  }

  values.push(req.params.id);
  const query = `UPDATE patients SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  const result = await pool.query(query, values);
  if (result.rows.length === 0) return res.status(404).json({ error: 'المريض غير موجود' });
  res.json(mapPatient(result.rows[0]));
});

/** تعيين دكتور لمريض (إنشاء علاقة patient_doctors) — الريسبشن فقط */
patientsRouter.post('/:id/doctors', requireRole('reception'), async (req, res) => {
  const { doctorId } = req.body;
  if (!doctorId) return res.status(400).json({ error: 'معرف الدكتور مطلوب' });

  const doctorCheck = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'doctor' AND is_active = true`, [doctorId]);
  if (doctorCheck.rows.length === 0) return res.status(400).json({ error: 'الدكتور المحدد غير موجود أو غير نشط' });

  const patientCheck = await pool.query(`SELECT id FROM patients WHERE id = $1`, [req.params.id]);
  if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'المريض غير موجود' });

  await pool.query(
    `INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
     VALUES ($1, $2, $3, now(), true)
     ON CONFLICT (patient_id, doctor_id) DO UPDATE SET is_active = true, assigned_by = $3, assigned_at = now()`,
    [req.params.id, doctorId, req.user!.id],
  );

  res.status(201).json({ success: true, message: 'تم تعيين الدكتور للمريض بنجاح' });
});

/** جلب الأطباء المعينين لمريض — للريسبشن والدكتور (عرض فقط) */
patientsRouter.get('/:id/doctors', async (req, res) => {
  try {
    await assertCanOpenChart(req.user!, req.params.id, false);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    throw err;
  }

  const result = await pool.query(
    `SELECT u.id, u.full_name, u.specialty, u.email, u.phone, u.clinic_address, u.logo_path,
            pd.assigned_at, pd.assigned_by
     FROM patient_doctors pd
     JOIN users u ON u.id = pd.doctor_id
     WHERE pd.patient_id = $1 AND pd.is_active = true
     ORDER BY pd.assigned_at DESC`,
    [req.params.id],
  );
  res.json(result.rows);
});
