import { Router } from 'express';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { memoryUpload, enforceUploadRequestLimit, detectSafeExtension, saveBufferSafely } from '../lib/fileUpload.js';
import { getDoctorWeeklySchedule, isDoctorAvailableOn, isDoctorAvailableToday, isValidTime } from '../lib/doctorAvailability.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const logosDir = path.resolve(process.cwd(), 'uploads', 'logos');

function mapUser(row: any) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    specialty: row.specialty,
    phone: row.phone,
    clinicAddress: row.clinic_address,
    logoUrl: row.logo_path ? `/uploads/logos/${path.basename(row.logo_path)}` : null,
    isActive: row.is_active,
  };
}

async function mapDoctorWithSchedule(row: any) {
  const weeklySchedule = await getDoctorWeeklySchedule(row.id);
  return { ...mapUser(row), weeklySchedule, isAvailableToday: await isDoctorAvailableToday(row.id) };
}

async function listDoctorsWithSchedules(activeOnly: boolean) {
  const result = await pool.query(
    `SELECT * FROM users WHERE role = 'doctor' ${activeOnly ? 'AND is_active = true' : ''} ORDER BY full_name ASC`,
  );
  return Promise.all(result.rows.map(mapDoctorWithSchedule));
}

async function getDoctorOr404(doctorId: string, res: any) {
  const result = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'doctor'`, [doctorId]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'الدكتور غير موجود' });
    return null;
  }
  return result.rows[0];
}

function parseScheduleInput(input: any) {
  const dayOfWeek = Number(input?.dayOfWeek);
  const startTime = String(input?.startTime ?? '');
  const endTime = String(input?.endTime ?? '');
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !isValidTime(startTime) || !isValidTime(endTime) || startTime >= endTime) {
    return null;
  }
  return { dayOfWeek, startTime, endTime };
}

/** ملف المستخدم الحالي بالتفصيل — بيانات العيادة اللي بتظهر في هيدر الروشتة */
usersRouter.get('/me', async (req, res) => {
  const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(mapUser(result.rows[0]));
});

/**
 * قائمة الدكاترة (بالصورة والتخصص) — متاحة للريسبشن والدكتور مع بعض،
 * الريسبشن محتاجاها لعرض شبكة الدكاترة وقت استقبال مريض جديد.
 */
usersRouter.get('/doctors', async (_req, res) => {
  res.json(await listDoctorsWithSchedules(true));
});

/** دليل الدكاترة المنظم حسب التخصص، مع الجدول وحالة التواجد اليوم. */
usersRouter.get('/doctors/grouped', async (_req, res) => {
  const doctors = await listDoctorsWithSchedules(true);
  const groups = new Map<string, any[]>();
  for (const doctor of doctors) {
    const specialty = doctor.specialty?.trim() || 'غير محدد التخصص';
    groups.set(specialty, [...(groups.get(specialty) ?? []), doctor]);
  }
  res.json(Array.from(groups, ([specialty, doctors]) => ({ specialty, doctors })));
});

/** تحديث بيانات الطبيب الشخصية (الاسم، التخصص، عنوان العيادة، الهاتف) */
usersRouter.patch('/me', async (req, res) => {
  const b = req.body;
  const result = await pool.query(
    `UPDATE users SET
      full_name = COALESCE($1, full_name),
      specialty = COALESCE($2, specialty),
      clinic_address = COALESCE($3, clinic_address),
      phone = COALESCE($4, phone)
     WHERE id = $5 RETURNING *`,
    [b.fullName, b.specialty, b.clinicAddress, b.phone, req.user!.id],
  );
  res.json(mapUser(result.rows[0]));
});

/** رفع شعار العيادة — يظهر في هيدر صفحة الروشتة */
usersRouter.post('/me/logo', enforceUploadRequestLimit, memoryUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم إرسال ملف' });
  const ext = await detectSafeExtension(req.file.buffer);
  if (!ext || ext === '.pdf') return res.status(400).json({ error: 'الشعار لازم يكون صورة (JPG, PNG, WEBP)' });

  const { filePath } = saveBufferSafely(logosDir, req.file.buffer, ext);
  const result = await pool.query(`UPDATE users SET logo_path = $1 WHERE id = $2 RETURNING *`, [filePath, req.user!.id]);
  res.json(mapUser(result.rows[0]));
});

/**
 * إنشاء حساب جديد (دكتور أو ريسبشن) — مقصور على الدكاترة فقط،
 * باعتبارهم أصحاب العيادة/الحساب الرئيسي في هذا الإصدار.
 */
usersRouter.post('/', requireRole('doctor'), async (req, res) => {
  const b = req.body;
  if (!b.fullName || !b.email || !b.password || !b.role) {
    return res.status(400).json({ error: 'الاسم والبريد الإلكتروني وكلمة المرور والدور مطلوبون' });
  }
  if (!['reception', 'doctor'].includes(b.role)) {
    return res.status(400).json({ error: 'الدور غير صحيح' });
  }
  if (String(b.password).length < 6) {
    return res.status(400).json({ error: 'كلمة المرور لازم تكون ٦ أحرف على الأقل' });
  }

  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [b.email.trim().toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
  }

  const passwordHash = await bcrypt.hash(b.password, 10);
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, specialty, phone)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.fullName, b.email.trim().toLowerCase(), passwordHash, b.role, b.specialty ?? null, b.phone ?? null],
  );
  res.status(201).json(mapUser(result.rows[0]));
});

/** قائمة كل الحسابات (لشاشة إدارة الحسابات) — للدكاترة فقط */
usersRouter.get('/', requireRole('doctor'), async (_req, res) => {
  const result = await pool.query(`SELECT * FROM users WHERE is_active = true ORDER BY created_at ASC`);
  res.json(result.rows.map(mapUser));
});

/**
 * إدارة الدكاترة للريسبشن:
 * - GET /doctors/manage: قائمة كل الدكاترة (نشطين وغير نشطين) للريسبشن
 * - POST /doctors/manage: إضافة دكتور جديد (للريسبشن فقط)
 * - PATCH /doctors/manage/:id: تعديل بيانات دكتور / تفعيل/إلغاء تفعيل (للريسبشن فقط)
 */
usersRouter.get('/doctors/manage', requireRole('reception'), async (_req, res) => {
  res.json(await listDoctorsWithSchedules(false));
});

usersRouter.get('/doctors/:doctorId/schedule', async (req, res) => {
  if (!await getDoctorOr404(req.params.doctorId, res)) return;
  res.json(await getDoctorWeeklySchedule(req.params.doctorId));
});

usersRouter.get('/doctors/:doctorId/availability', async (req, res) => {
  if (!await getDoctorOr404(req.params.doctorId, res)) return;
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  const time = typeof req.query.time === 'string' ? req.query.time : undefined;
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  try {
    res.json({ available: await isDoctorAvailableOn(req.params.doctorId, date, time), date, time: time ?? null });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** استبدال الجدول بالكامل من شاشة إدارة الطبيب. */
usersRouter.put('/doctors/:doctorId/schedule', requireRole('reception'), async (req, res) => {
  if (!await getDoctorOr404(req.params.doctorId, res)) return;
  if (!Array.isArray(req.body?.entries)) return res.status(400).json({ error: 'قائمة الجدول مطلوبة' });
  const entries = req.body.entries.map(parseScheduleInput);
  if (entries.some((entry: any) => !entry)) return res.status(400).json({ error: 'بيانات اليوم أو الوقت غير صحيحة' });
  const unique = new Set(entries.map((entry: any) => `${entry.dayOfWeek}-${entry.startTime}-${entry.endTime}`));
  if (unique.size !== entries.length) return res.status(409).json({ error: 'لا يمكن تكرار نفس الفترة في جدول الطبيب' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM doctor_weekly_schedules WHERE doctor_id = $1`, [req.params.doctorId]);
    for (const entry of entries) {
      await client.query(
        `INSERT INTO doctor_weekly_schedules (doctor_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [req.params.doctorId, entry.dayOfWeek, entry.startTime, entry.endTime],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await getDoctorWeeklySchedule(req.params.doctorId));
});

usersRouter.post('/doctors/:doctorId/schedule', requireRole('reception'), async (req, res) => {
  if (!await getDoctorOr404(req.params.doctorId, res)) return;
  const entry = parseScheduleInput(req.body);
  if (!entry) return res.status(400).json({ error: 'بيانات اليوم أو الوقت غير صحيحة' });
  try {
    const result = await pool.query(
      `INSERT INTO doctor_weekly_schedules (doctor_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4) RETURNING id, doctor_id, day_of_week, start_time, end_time`,
      [req.params.doctorId, entry.dayOfWeek, entry.startTime, entry.endTime],
    );
    res.status(201).json((await getDoctorWeeklySchedule(req.params.doctorId)).find((item) => item.id === result.rows[0].id));
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'هذه الفترة موجودة بالفعل في جدول الطبيب' });
    throw err;
  }
});

usersRouter.patch('/doctors/:doctorId/schedule/:scheduleId', requireRole('reception'), async (req, res) => {
  if (!await getDoctorOr404(req.params.doctorId, res)) return;
  const entry = parseScheduleInput(req.body);
  if (!entry) return res.status(400).json({ error: 'بيانات اليوم أو الوقت غير صحيحة' });
  try {
    const result = await pool.query(
      `UPDATE doctor_weekly_schedules SET day_of_week = $1, start_time = $2, end_time = $3, updated_at = now()
        WHERE id = $4 AND doctor_id = $5
        RETURNING id, doctor_id, day_of_week, start_time, end_time`,
      [entry.dayOfWeek, entry.startTime, entry.endTime, req.params.scheduleId, req.params.doctorId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'فترة الجدول غير موجودة' });
    res.json((await getDoctorWeeklySchedule(req.params.doctorId)).find((item) => item.id === req.params.scheduleId));
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'هذه الفترة موجودة بالفعل في جدول الطبيب' });
    throw err;
  }
});

usersRouter.delete('/doctors/:doctorId/schedule/:scheduleId', requireRole('reception'), async (req, res) => {
  if (!await getDoctorOr404(req.params.doctorId, res)) return;
  const result = await pool.query(
    `DELETE FROM doctor_weekly_schedules WHERE id = $1 AND doctor_id = $2 RETURNING id`,
    [req.params.scheduleId, req.params.doctorId],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'فترة الجدول غير موجودة' });
  res.status(204).end();
});

usersRouter.post('/doctors/manage', requireRole('reception'), async (req, res) => {
  const b = req.body;
  if (!b.fullName || !b.email || !b.password || !b.specialty) {
    return res.status(400).json({ error: 'الاسم والبريد الإلكتروني وكلمة المرور والتخصص مطلوبون' });
  }
  if (String(b.password).length < 6) {
    return res.status(400).json({ error: 'كلمة المرور لازم تكون ٦ أحرف على الأقل' });
  }

  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [b.email.trim().toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
  }

  const passwordHash = await bcrypt.hash(b.password, 10);
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, specialty, phone, clinic_address, is_active)
     VALUES ($1,$2,$3,'doctor',$4,$5,$6,true) RETURNING *`,
    [b.fullName, b.email.trim().toLowerCase(), passwordHash, b.specialty, b.phone ?? null, b.clinicAddress ?? null],
  );
  res.status(201).json(mapUser(result.rows[0]));
});

usersRouter.patch('/doctors/manage/:id', requireRole('reception'), async (req, res) => {
  const b = req.body;
  const doctorId = req.params.id;

  // التحقق من وجود الدكتور وأنه دكتور فعلاً
  const existing = await pool.query(`SELECT * FROM users WHERE id = $1 AND role = 'doctor'`, [doctorId]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'الدكتور غير موجود' });
  }

  const result = await pool.query(
    `UPDATE users SET
      full_name = COALESCE($1, full_name),
      specialty = COALESCE($2, specialty),
      phone = COALESCE($3, phone),
      clinic_address = COALESCE($4, clinic_address),
      is_active = COALESCE($5, is_active)
     WHERE id = $6 AND role = 'doctor'
     RETURNING *`,
    [b.fullName, b.specialty, b.phone, b.clinicAddress, b.isActive, doctorId],
  );
  res.json(mapUser(result.rows[0]));
});
