import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getIO, roomForDoctor, RECEPTION_ROOM } from '../socket.js';
import { assertDoctorAvailableToday, DoctorUnavailableError } from '../lib/doctorAvailability.js';
import { createConfirmedServiceInvoice } from '../lib/billing.js';

export const queueRouter = Router();
queueRouter.use(requireAuth);
/**
 * قائمة الانتظار — قلب الربط اللحظي بين الريسبشن وكل دكتور على حدة:
 *
 * 1) الريسبشن بتختار الدكتور المستهدف صراحة وتضيف المريض (check-in) → POST /
 * 2) السيرفر بيبعت الحدث لغرفة الدكتور ده بس (Socket.io room) + غرفة الريسبشن،
 *    مش لكل المتصلين — عزل حقيقي، مش بس فلترة في الواجهة
 * 3) GET / نفسها بترجع نتائج مختلفة حسب الدور: دكتور يشوف مرضاه بس، ريسبشن تشوف الكل
 */

function mapQueueEntry(row: any) {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    fileNumber: row.file_number,
    patientPhone: row.phone,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    status: row.status,
    note: row.note,
    checkedInAt: row.checked_in_at,
  };
}

const SELECT_QUEUE = `
  SELECT q.*, p.full_name AS patient_name, p.file_number, p.phone, u.full_name AS doctor_name
  FROM queue_entries q
  JOIN patients p ON p.id = q.patient_id
  LEFT JOIN users u ON u.id = q.doctor_id
`;

/**
 * قائمة الانتظار — **معزولة حسب الدور على مستوى السيرفر نفسه**:
 * الدكتور بيشوف مرضاه بس (doctor_id = هويته من التوكن)، والريسبشن بتشوف الكل.
 * العزل ده مش فلترة في الواجهة — حتى لو دكتور نادى الـ API مباشرة، مش هيشوف غير مرضاه.
 */
queueRouter.get('/', async (req, res) => {
  const isDoctor = req.user!.role === 'doctor';
  const result = await pool.query(
    `${SELECT_QUEUE}
     WHERE q.status IN ('waiting', 'in_progress')
     ${isDoctor ? 'AND q.doctor_id = $1' : ''}
     ORDER BY q.checked_in_at ASC`,
    isDoctor ? [req.user!.id] : [],
  );
  res.json(result.rows.map(mapQueueEntry));
});

/**
 * تسجيل حضور مريض وتوجيهه لدكتور محدد — الريسبشن فقط.
 * doctorId بقى إلزامي: كل مريض لازم يتوجّه لدكتور بعينه وقت الاستقبال.
 * يتم إنشاء/تحديث علاقة patient_doctors لضمان الوصول الدائم لملف المريض.
 */
queueRouter.post('/', requireRole('reception'), async (req, res) => {
  const { patientId, doctorId, note, serviceId, paymentAmount, paymentMethod, paymentReferenceNumber } = req.body;
  if (!patientId) return res.status(400).json({ error: 'رقم المريض مطلوب' });
  if (!doctorId) return res.status(400).json({ error: 'اختيار الدكتور مطلوب' });

  const doctorCheck = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'doctor' AND is_active = true`, [doctorId]);
  if (doctorCheck.rows.length === 0) return res.status(400).json({ error: 'الدكتور المحدد غير موجود أو غير نشط' });

  try {
    await assertDoctorAvailableToday(doctorId);
  } catch (err) {
    if (err instanceof DoctorUnavailableError) return res.status(400).json({ error: err.message });
    throw err;
  }

  const patientCheck = await pool.query(`SELECT id FROM patients WHERE id = $1`, [patientId]);
  if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'المريض غير موجود' });

  const existingQueue = await pool.query(
    `SELECT id FROM queue_entries
      WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('waiting', 'in_progress')`,
    [patientId, doctorId],
  );
  if (existingQueue.rows.length > 0) return res.status(409).json({ error: 'المريض موجود بالفعل في قائمة انتظار هذا الطبيب' });

  // الحضور والخدمة المؤكدة يكتبان في معاملة واحدة. عند إعادة المحاولة لا يبقى
  // حضور بلا فاتورة أو فاتورة مكررة لنفس حدث الحضور.
  const client = await pool.connect();
  let result: any;
  let invoice: any = null;
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
       VALUES ($1, $2, $3, now(), true)
       ON CONFLICT (patient_id, doctor_id) DO UPDATE SET is_active = true, assigned_by = $3, assigned_at = now()`,
      [patientId, doctorId, req.user!.id],
    );
    result = await client.query(
      `INSERT INTO queue_entries (patient_id, doctor_id, note, checked_in_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [patientId, doctorId, note ?? null, req.user!.id],
    );
    if (serviceId) {
      const created = await createConfirmedServiceInvoice(client, {
        patientId,
        doctorId,
        serviceId,
        createdBy: req.user!.id,
        sourceKey: `queue-checkin:${result.rows[0].id}`,
        payment: paymentAmount === undefined || paymentAmount === ''
          ? undefined
          : { amount: paymentAmount, method: paymentMethod || '', referenceNumber: paymentReferenceNumber },
      });
      invoice = created.invoice;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const full = await pool.query(`${SELECT_QUEUE} WHERE q.id = $1`, [result.rows[0].id]);
  const entry = mapQueueEntry(full.rows[0]);

  // 🔴 يوصل لغرفة الدكتور ده بس + الريسبشن — مش لكل الدكاترة التانيين
  getIO().to(roomForDoctor(doctorId)).to(RECEPTION_ROOM).emit('queue:new', entry);

  res.status(201).json({ ...entry, invoice });
});

/** تحديث حالة الانتظار (الدكتور بدأ الكشف / خلّص) — الحالات الطبية مقصورة على صاحب الحالة نفسه */
queueRouter.patch('/:id', async (req, res) => {
  const { status } = req.body as { status: 'waiting' | 'in_progress' | 'done' | 'cancelled' };

  const existing = await pool.query(`SELECT * FROM queue_entries WHERE id = $1`, [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'العنصر غير موجود' });

  const clinicalStatuses = ['in_progress', 'done'];
  if (clinicalStatuses.includes(status)) {
    if (req.user!.role !== 'doctor') {
      return res.status(403).json({ error: 'هذا الإجراء مخصص للدكاترة فقط' });
    }
    // عزل إضافي: دكتور مينفعش يحدّث حالة مريض مش عنده أصلًا
    if (existing.rows[0].doctor_id !== req.user!.id) {
      return res.status(403).json({ error: 'هذا المريض غير مخصص لك' });
    }
  }

  const extraTimestamp =
    status === 'in_progress' ? ', started_at = now()' : status === 'done' ? ', finished_at = now()' : '';

  // Start a transaction to ensure visit creation is atomic with status update
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update queue entry status
    await client.query(`UPDATE queue_entries SET status = $1 ${status === 'done' ? ', finished_at = now()' : status === 'in_progress' ? ', started_at = now()' : ''} WHERE id = $2`, [status, req.params.id]);

    // If status is 'done', create a visit record
    if (status === 'done') {
      const queueEntry = existing.rows[0];
      
      // Get appointment info if available to get visit type
      let visitType = 'متابعة';
      const apptRes = await client.query(
        `SELECT appointment_type FROM appointments 
         WHERE patient_id = $1 AND doctor_id = $2 
         AND appointment_date = CURRENT_DATE 
         AND status IN ('مؤكد', 'حضر', 'جاري الكشف')
         ORDER BY appointment_date DESC, appointment_time DESC 
         LIMIT 1`,
        [existing.rows[0].patient_id, existing.rows[0].doctor_id]
      );
      if (apptRes.rows.length > 0) {
        visitType = apptRes.rows[0].appointment_type;
      }

      // Create visit record
      await client.query(
        `INSERT INTO visits 
         (patient_id, doctor_id, visit_date, visit_type, diagnosis, notes, created_at)
         VALUES ($1, $2, CURRENT_DATE, $3, 'كشف', 'تم الكشف بواسطة الطبيب', now())
         RETURNING *`,
        [existing.rows[0].patient_id, existing.rows[0].doctor_id, visitType]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const full = await pool.query(`${SELECT_QUEUE} WHERE q.id = $1`, [req.params.id]);
  const entry = mapQueueEntry(full.rows[0]);
  if (entry.doctorId) getIO().to(roomForDoctor(entry.doctorId)).to(RECEPTION_ROOM).emit('queue:update', entry);
  res.json(entry);
});

/** التحقق من وجود فحص نشط (in_progress) للمريض مع الدكتور الحالي */
queueRouter.get('/check-active/:patientId', async (req, res) => {
  const isDoctor = req.user!.role === 'doctor';
  if (!isDoctor) {
    return res.status(403).json({ error: 'هذا الإجراء مخصص للدكاترة فقط' });
  }
  const result = await pool.query(
    `SELECT 1 FROM queue_entries 
     WHERE doctor_id = $1 AND patient_id = $2 
     AND status = 'in_progress'`,
    [req.user!.id, req.params.patientId]
  );
  res.json({ hasActive: result.rows.length > 0 });
});
