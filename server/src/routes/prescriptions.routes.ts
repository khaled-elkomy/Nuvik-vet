import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCanOpenChart, assertCanWriteRecord, assertActiveExamination, getActiveExamination, ActiveExaminationRequiredError, ChartAccessError, RecordOwnershipError } from '../lib/authz.js';

export const prescriptionsRouter = Router();
prescriptionsRouter.use(requireAuth);

function mapRx(row: any) {
  return {
    id: row.id,
    patientId: row.patient_id,
    visitId: row.visit_id,
    date: row.prescription_date,
    diagnosis: row.diagnosis,
    medications: row.medications,
    instructions: row.instructions,
    queueEntryId: row.queue_entry_id,
  };
}

prescriptionsRouter.get('/patient/:patientId', async (req, res) => {
  try {
    await assertCanOpenChart(req.user!, req.params.patientId, true);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    throw err;
  }
  const result = await pool.query(
    `SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY prescription_date DESC`,
    [req.params.patientId],
  );
  res.json(result.rows.map(mapRx));
});

/** كتابة روشتة — للدكاترة فقط، يجب أن يكون الطبيب مُعيّن للمريض ولديه فحص نشط */
prescriptionsRouter.post('/', requireRole('doctor'), async (req, res) => {
  const b = req.body;
  if (!b.patientId || !b.diagnosis || !Array.isArray(b.medications)) {
    return res.status(400).json({ error: 'بيانات الروشتة غير مكتملة' });
  }
  try {
    await assertCanOpenChart(req.user!, b.patientId, true);
    await assertActiveExamination(req.user!.id, b.patientId);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    if (err instanceof ActiveExaminationRequiredError) return res.status(403).json({ error: err.message });
    throw err;
  }
  const examination = await getActiveExamination(req.user!.id, b.patientId);
  if (!examination) return res.status(403).json({ error: 'لا يمكن كتابة روشتة إلا أثناء جاري الكشف' });
  const result = await pool.query(
    `INSERT INTO prescriptions (patient_id, visit_id, doctor_id, prescription_date, diagnosis, medications, instructions, queue_entry_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.patientId, b.visitId ?? null, req.user!.id, b.date ?? new Date().toISOString().slice(0, 10), b.diagnosis, JSON.stringify(b.medications), b.instructions?.trim() || null, examination.id],
  );
  res.status(201).json(mapRx(result.rows[0]));
});

/** تعديل روشتة — صاحب الروشتة فقط */
prescriptionsRouter.patch('/:id', requireRole('doctor'), async (req, res) => {
  const existing = await pool.query(`SELECT * FROM prescriptions WHERE id = $1`, [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الروشتة غير موجودة' });
  const rx = existing.rows[0];

  try {
    await assertCanWriteRecord(req.user!, { doctor_id: rx.doctor_id, patient_id: rx.patient_id });
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    if (err instanceof RecordOwnershipError) return res.status(403).json({ error: err.message });
    throw err;
  }

  const b = req.body;
  const result = await pool.query(
    `UPDATE prescriptions SET
      diagnosis = COALESCE($1, diagnosis),
      medications = COALESCE($2, medications),
      instructions = COALESCE($3, instructions)
     WHERE id = $4 RETURNING *`,
    [b.diagnosis, b.medications ? JSON.stringify(b.medications) : null, b.instructions, req.params.id],
  );
  res.json(mapRx(result.rows[0]));
});

/** حذف روشتة — صاحب الروشتة فقط */
prescriptionsRouter.delete('/:id', requireRole('doctor'), async (req, res) => {
  const existing = await pool.query(`SELECT * FROM prescriptions WHERE id = $1`, [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الروشتة غير موجودة' });
  const rx = existing.rows[0];

  try {
    await assertCanWriteRecord(req.user!, { doctor_id: rx.doctor_id, patient_id: rx.patient_id });
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    if (err instanceof RecordOwnershipError) return res.status(403).json({ error: err.message });
    throw err;
  }

  await pool.query(`DELETE FROM prescriptions WHERE id = $1`, [req.params.id]);
  res.status(204).send();
});
