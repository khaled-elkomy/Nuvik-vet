import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getIO, RECEPTION_ROOM, roomForDoctor } from '../socket.js';
import { assertActiveExamination, assertCanOpenChart, ActiveExaminationRequiredError, ChartAccessError, getAssignedPatients } from '../lib/authz.js';
import { assertDoctorAvailableForAppointment, assertDoctorAvailableToday, cairoTodayIso, DoctorUnavailableError } from '../lib/doctorAvailability.js';
import { createConfirmedServiceInvoice } from '../lib/billing.js';

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

function mapAppointment(row: any) {
  // appointment_date is DATE type -> returned as Date object by pg, serialize to YYYY-MM-DD
  // appointment_time is TIME type -> returned as string 'HH:MM:SS' by pg, take first 5 chars
  const appointmentDate = row.appointment_date instanceof Date
    ? row.appointment_date.toISOString().split('T')[0]
    : String(row.appointment_date).split('T')[0];
  
  const appointmentTime = row.appointment_time
    ? String(row.appointment_time).slice(0, 5)
    : '';
  
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    date: appointmentDate,
    time: appointmentTime,
    type: row.appointment_type,
    status: row.status,
    notes: row.notes,
    isFollowUp: row.is_follow_up,
  };
}

/** يبقي رد تسجيل الحضور وحدث Socket متطابقين مع عقد GET /api/queue. */
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

appointmentsRouter.get('/', async (req, res) => {
  const date = req.query.date ? String(req.query.date) : null;
  const isDoctor = req.user!.role === 'doctor';
  const isReception = req.user!.role === 'reception';

  let query = `
    SELECT a.*, p.full_name AS patient_name, u.full_name AS doctor_name FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    LEFT JOIN users u ON u.id = a.doctor_id
  `;
  const params: any[] = [];

  if (isDoctor) {
    query += ` WHERE a.doctor_id = $1`;
    params.push(req.user!.id);
    if (date) {
      query += ` AND a.appointment_date = $2`;
      params.push(date);
    }
  } else if (isReception) {
    if (date) {
      query += ` WHERE a.appointment_date = $1`;
      params.push(date);
    }
  } else {
    query += ` WHERE false`;
  }

  query += ` ORDER BY a.appointment_date, a.appointment_time`;

  const result = await pool.query(query, params);
  res.json(result.rows.map(mapAppointment));
});

/** حجز موعد — الريسبشن والدكتور. الريسبشن تختار الدكتور، الدكتور يحجز لنفسه */
appointmentsRouter.post('/', async (req, res) => {
  const b = req.body;
  const prepayment = b.prepayment as { serviceId?: string; paymentAmount?: string | number; paymentMethod?: string; paymentReferenceNumber?: string } | undefined;
  if (!b.patientId || !b.date || !b.time) {
    return res.status(400).json({ error: 'المريض والتاريخ والوقت مطلوبون' });
  }

  let doctorId = b.doctorId;
  if (req.user!.role === 'doctor') {
    doctorId = req.user!.id;
    // للطبيب: السماح بإنشاء الموعد حتى لو لم يكن معيّناً للمريض بعد
    // لأن إنشاء الموعد سيقوم بإنشاء العلاقة في patient_doctors
    if (b.isFollowUp === true) {
      try {
        await assertCanOpenChart(req.user!, b.patientId, true);
        await assertActiveExamination(req.user!.id, b.patientId);
      } catch (err) {
        if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
        if (err instanceof ActiveExaminationRequiredError) return res.status(403).json({ error: err.message });
        throw err;
      }
    }
  } else if (req.user!.role === 'reception') {
    if (!doctorId) return res.status(400).json({ error: 'اختيار الدكتور مطلوب' });
    const doctorCheck = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'doctor' AND is_active = true`, [doctorId]);
    if (doctorCheck.rows.length === 0) return res.status(400).json({ error: 'الدكتور المحدد غير موجود' });
  }

  try {
    await assertDoctorAvailableForAppointment(doctorId, b.date, b.time);
  } catch (err) {
    if (err instanceof DoctorUnavailableError) return res.status(400).json({ error: err.message });
    throw err;
  }

  if (prepayment && (!prepayment.serviceId || prepayment.paymentAmount === undefined || prepayment.paymentAmount === '')) {
    return res.status(400).json({ error: 'اختيار الخدمة وقيمة المقدم مطلوبان عند تحصيل مقدم' });
  }

  // لا تنشئ الحجوزات العادية فاتورة. حالة تحصيل المقدم اختيارية وصريحة، وتكتب
  // مع الحجز في معاملة واحدة حتى لا ينجح أحدهما دون الآخر.
  const client = await pool.connect();
  let result: any;
  let prepaymentInvoice: any = null;
  try {
    await client.query('BEGIN');
    result = await client.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, appointment_type, notes, created_by, is_follow_up)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.patientId, doctorId, b.date, b.time, b.type ?? 'كشف', b.notes ?? null, req.user!.id, req.user!.role === 'doctor' && b.isFollowUp === true],
    );
    await client.query(
      `INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
       VALUES ($1, $2, $3, now(), true)
       ON CONFLICT (patient_id, doctor_id) DO UPDATE SET is_active = true, assigned_by = $3, assigned_at = now()`,
      [b.patientId, doctorId, req.user!.id],
    );
    if (prepayment?.serviceId) {
      const created = await createConfirmedServiceInvoice(client, {
        patientId: b.patientId,
        doctorId,
        serviceId: prepayment.serviceId,
        createdBy: req.user!.id,
        sourceKey: `appointment-prepayment:${result.rows[0].id}`,
        eventLabel: 'فاتورة مقدم حجز',
        payment: prepayment.paymentAmount === undefined || prepayment.paymentAmount === ''
          ? undefined
          : { amount: prepayment.paymentAmount, method: prepayment.paymentMethod || '', referenceNumber: prepayment.paymentReferenceNumber },
      });
      prepaymentInvoice = created.invoice;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const patient = await pool.query(`SELECT full_name FROM patients WHERE id = $1`, [b.patientId]);
  const appointment = mapAppointment({ ...result.rows[0], patient_name: patient.rows[0]?.full_name });
  getIO().emit('appointment:created', appointment);
  res.status(201).json({ ...appointment, prepaymentInvoice });
});

/** تسجيل حضور للموعد — الريسبشن فقط
 *  يحوّل حالة الموعد إلى 'حضر' وينشئ دخول في قائمة الانتظار
 *  يستخدم doctor_id من الموعد نفسه، لا يطلبه من الريسبشن */
appointmentsRouter.post('/:id/checkin', requireRole('reception'), async (req, res) => {
  const billing = req.body as { serviceId?: string; paymentAmount?: string | number; paymentMethod?: string; paymentReferenceNumber?: string };
  const existing = await pool.query(
    `SELECT a.*, u.full_name AS doctor_name FROM appointments a
     LEFT JOIN users u ON u.id = a.doctor_id
     WHERE a.id = $1`, 
    [req.params.id]
  );
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الموعد غير موجود' });
  const appointment = existing.rows[0];

  // التحقق من أن الحالة قابلة للتسجيل (مؤكد فقط)
  if (appointment.status !== 'مؤكد') {
    return res.status(400).json({ error: 'لا يمكن تسجيل الحضور لهذا الموعد إلا إذا كانت حالته مؤكد' });
  }

  const appointmentDate = appointment.appointment_date instanceof Date
    ? appointment.appointment_date.toISOString().slice(0, 10)
    : String(appointment.appointment_date).slice(0, 10);
  if (appointmentDate !== cairoTodayIso()) {
    return res.status(400).json({ error: 'يمكن تسجيل الحضور لموعد اليوم فقط' });
  }

  // استخدام doctor_id من الموعد نفسه
  const doctorId = appointment.doctor_id;
  if (!doctorId) {
    return res.status(400).json({ error: 'هذا الموعد لا يحتوي على طبيب محدد' });
  }

  // التحقق من وجود الدكتور
  const doctorCheck = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'doctor' AND is_active = true`, [doctorId]);
  if (doctorCheck.rows.length === 0) return res.status(400).json({ error: 'الدكتور المحدد غير موجود أو غير نشط' });

  try {
    await assertDoctorAvailableToday(doctorId);
  } catch (err) {
    if (err instanceof DoctorUnavailableError) return res.status(400).json({ error: err.message });
    throw err;
  }

  const existingQueue = await pool.query(
    `SELECT id FROM queue_entries
      WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('waiting', 'in_progress')`,
    [appointment.patient_id, doctorId],
  );
  if (existingQueue.rows.length > 0) return res.status(409).json({ error: 'المريض موجود بالفعل في قائمة انتظار هذا الطبيب' });

  // حالة الموعد، قائمة الانتظار، والفاتورة المؤكدة تُكتب في معاملة واحدة.
  // لذلك لا يمكن لإعادة المحاولة أن تنتج فاتورة ثانية أو حضوراً بلا فاتورة.
  const client = await pool.connect();
  let result: any;
  let queueResult: any;
  let invoice: any = null;
  try {
    await client.query('BEGIN');
    result = await client.query(`UPDATE appointments SET status='حضر' WHERE id=$1 AND status='مؤكد' RETURNING *`, [req.params.id]);
    if (!result.rows[0]) throw Object.assign(new Error('تمت معالجة هذا الموعد بالفعل'), { status: 409 });
    await client.query(
      `INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
       VALUES ($1,$2,$3,now(),true)
       ON CONFLICT (patient_id, doctor_id) DO UPDATE SET is_active=true, assigned_by=$3, assigned_at=now()`,
      [appointment.patient_id, doctorId, req.user!.id],
    );
    queueResult = await client.query(`INSERT INTO queue_entries (patient_id,doctor_id,note,checked_in_by) VALUES ($1,$2,$3,$4) RETURNING id`, [appointment.patient_id, doctorId, 'حضور للموعد: ' + appointment.appointment_type, req.user!.id]);
    if (billing.serviceId) {
      const created = await createConfirmedServiceInvoice(client, {
        patientId: appointment.patient_id, doctorId, serviceId: billing.serviceId, createdBy: req.user!.id,
        sourceKey: `appointment-checkin:${req.params.id}`,
        payment: billing.paymentAmount === undefined || billing.paymentAmount === '' ? undefined : { amount: billing.paymentAmount, method: billing.paymentMethod || '', referenceNumber: billing.paymentReferenceNumber },
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

  // جلب بيانات كاملة للإرجاع
  const patient = await pool.query(`SELECT full_name FROM patients WHERE id = $1`, [appointment.patient_id]);
  const updatedAppointment = mapAppointment({ ...result.rows[0], patient_name: patient.rows[0]?.full_name });
  const queueFull = await pool.query(
    `SELECT q.*, p.full_name AS patient_name, p.file_number, p.phone, u.full_name AS doctor_name
     FROM queue_entries q
     JOIN patients p ON p.id = q.patient_id
     LEFT JOIN users u ON u.id = q.doctor_id
     WHERE q.id = $1`,
    [queueResult.rows[0].id],
  );

  const queueEntry = mapQueueEntry(queueFull.rows[0]);
  getIO().emit('appointment:updated', updatedAppointment);
  getIO().to(roomForDoctor(doctorId)).to(RECEPTION_ROOM).emit('queue:new', queueEntry);

  res.json({ appointment: updatedAppointment, queueEntry, invoice });
});

/** إلغاء الموعد — الريسبشن فقط
 *  يحوّل حالة الموعد إلى 'ملغي' */
appointmentsRouter.patch('/:id/cancel', requireRole('reception'), async (req, res) => {
  const existing = await pool.query(
    `SELECT a.*, u.full_name AS doctor_name FROM appointments a
     LEFT JOIN users u ON u.id = a.doctor_id
     WHERE a.id = $1`, 
    [req.params.id]
  );
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الموعد غير موجود' });
  const appointment = existing.rows[0];

  // التحقق من أن الحالة قابلة للإلغاء (مؤكد فقط)
  if (appointment.status !== 'مؤكد') {
    return res.status(400).json({ error: 'لا يمكن إلغاء هذا الموعد إلا إذا كانت حالته مؤكد' });
  }

  // تحديث حالة الموعد إلى 'ملغي'
  const result = await pool.query(
    `UPDATE appointments SET status = 'ملغي' WHERE id = $1 RETURNING *`,
    [req.params.id],
  );

  const patient = await pool.query(`SELECT full_name FROM patients WHERE id = $1`, [appointment.patient_id]);
  const updatedAppointment = mapAppointment({ ...result.rows[0], patient_name: patient.rows[0]?.full_name });
  getIO().emit('appointment:updated', updatedAppointment);

  res.json(updatedAppointment);
});

/** تأجيل الموعد — الريسبشن فقط
 *  يلغي الموعد الحالي وينشئ موعداً جديداً بنفس البيانات لكن بتاريخ/وقت جديدين */
appointmentsRouter.post('/:id/reschedule', requireRole('reception'), async (req, res) => {
  const { newDate, newTime } = req.body;
  if (!newDate || !newTime) return res.status(400).json({ error: 'التاريخ والوقت الجديدان مطلوبان' });

  const existing = await pool.query(
    `SELECT a.*, u.full_name AS doctor_name FROM appointments a
     LEFT JOIN users u ON u.id = a.doctor_id
     WHERE a.id = $1`, 
    [req.params.id]
  );
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الموعد غير موجود' });
  const appointment = existing.rows[0];

  // التحقق من أن الحالة قابلة للتأجيل (مؤكد فقط)
  if (appointment.status !== 'مؤكد') {
    return res.status(400).json({ error: 'لا يمكن تأجيل هذا الموعد إلا إذا كانت حالته مؤكد' });
  }

  try {
    await assertDoctorAvailableForAppointment(appointment.doctor_id, newDate, newTime);
  } catch (err) {
    if (err instanceof DoctorUnavailableError) return res.status(400).json({ error: err.message });
    throw err;
  }

  // إلغاء الموعد الحالي
  await pool.query(
    `UPDATE appointments SET status = 'ملغي' WHERE id = $1`,
    [req.params.id],
  );

  // إنشاء موعد جديد بنفس البيانات لكن بتواريخ جديدة
  const result = await pool.query(
    `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, appointment_type, notes, created_by, is_follow_up)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [appointment.patient_id, appointment.doctor_id, newDate, newTime, appointment.appointment_type, appointment.notes ?? null, req.user!.id, appointment.is_follow_up],
  );

  // إنشاء/تحديث علاقة المريض بالدكتور للموعد الجديد
  await pool.query(
    `INSERT INTO patient_doctors (patient_id, doctor_id, assigned_by, assigned_at, is_active)
     VALUES ($1, $2, $3, now(), true)
     ON CONFLICT (patient_id, doctor_id) DO UPDATE SET is_active = true, assigned_by = $3, assigned_at = now()`,
    [appointment.patient_id, appointment.doctor_id, req.user!.id],
  );

  const patient = await pool.query(`SELECT full_name FROM patients WHERE id = $1`, [appointment.patient_id]);
  const newAppointment = mapAppointment({ ...result.rows[0], patient_name: patient.rows[0]?.full_name });
  getIO().emit('appointment:created', newAppointment);
  // Also emit updated for the cancelled appointment
  const cancelledAppointment = mapAppointment({ ...appointment, status: 'ملغي' });
  getIO().emit('appointment:updated', cancelledAppointment);

  res.status(201).json(newAppointment);
});

/** تحديث حالة الموعد (للدكتور لتحديث إلى 'جاري الكشف' أو 'مكتمل'، وللريسبشن لـ 'ملغي' أو 'لم يحضر') */
appointmentsRouter.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const existing = await pool.query(
    `SELECT a.*, u.full_name AS doctor_name FROM appointments a
     LEFT JOIN users u ON u.id = a.doctor_id
     WHERE a.id = $1`, 
    [req.params.id]
  );
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الموعد غير موجود' });
  const appointment = existing.rows[0];

  // دكتور يحدّث مواعيده فقط، ريسبشن تحدّث الكل
  if (req.user!.role === 'doctor' && appointment.doctor_id !== req.user!.id) {
    return res.status(403).json({ error: 'هذا الموعد ليس لك' });
  }

  const result = await pool.query(
    `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *`,
    [status, req.params.id],
  );
  const patient = await pool.query(`SELECT full_name FROM patients WHERE id = $1`, [result.rows[0].patient_id]);
  const updated = mapAppointment({ ...result.rows[0], patient_name: patient.rows[0]?.full_name });
  getIO().emit('appointment:updated', updated);
  res.json(updated);
});

export default appointmentsRouter;
