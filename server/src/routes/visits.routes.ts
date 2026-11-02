import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCanOpenChart, assertCanWriteRecord, ChartAccessError, RecordOwnershipError } from '../lib/authz.js';

export const visitsRouter = Router();
visitsRouter.use(requireAuth);

function mapVisit(row: any) {
  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    date: row.visit_date,
    type: row.visit_type,
    chiefComplaint: row.chief_complaint,
    symptoms: row.symptoms,
    diagnosis: row.diagnosis,
    notes: row.notes,
    vitals: {
      bloodPressure: row.blood_pressure,
      heartRate: row.heart_rate,
      temperature: row.temperature,
      weight: row.weight,
      height: row.height,
    },
    medications: row.medications,
    followUpDate: row.follow_up_date,
  };
}

/** كل زيارات مريض معيّن — محمي بصلاحية فتح ملف المريض */
visitsRouter.get('/patient/:patientId', async (req, res) => {
  try {
    await assertCanOpenChart(req.user!, req.params.patientId, true);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    throw err;
  }
  const result = await pool.query(
    `SELECT v.*, u.full_name AS doctor_name FROM visits v
     LEFT JOIN users u ON u.id = v.doctor_id
     WHERE v.patient_id = $1 ORDER BY v.visit_date DESC`,
    [req.params.patientId],
  );
  res.json(result.rows.map((r) => ({ ...mapVisit(r), doctor: r.doctor_name })));
});

/**
 * تسجيل زيارة جديدة — مقصورة على الدكاترة فقط.
 * يجب أن يكون الطبيب مُعيّن للمريض.
 */
visitsRouter.post('/', requireRole('doctor'), async (req, res) => {
  const b = req.body;
  if (!b.patientId || !b.date || !b.diagnosis) {
    return res.status(400).json({ error: 'رقم المريض والتاريخ والتشخيص مطلوبون' });
  }
  try {
    await assertCanOpenChart(req.user!, b.patientId, true);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    throw err;
  }
  const result = await pool.query(
    `INSERT INTO visits
      (patient_id, doctor_id, visit_date, visit_type, chief_complaint, symptoms, diagnosis,
       notes, blood_pressure, heart_rate, temperature, weight, height, medications, follow_up_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      b.patientId, req.user!.id, b.date, b.type ?? 'متابعة', b.chiefComplaint ?? null, b.symptoms ?? null,
      b.diagnosis, b.notes ?? null, b.vitals?.bloodPressure ?? null, b.vitals?.heartRate ?? null,
      b.vitals?.temperature ?? null, b.vitals?.weight ?? null, b.vitals?.height ?? null,
      b.medications ?? null, b.followUpDate ?? null,
    ],
  );
  await pool.query(`UPDATE patients SET last_visit = $1 WHERE id = $2`, [b.date, b.patientId]);
  res.status(201).json(mapVisit(result.rows[0]));
});

/** تعديل زيارة — صاحب الزيارة فقط */
visitsRouter.patch('/:id', requireRole('doctor'), async (req, res) => {
  const existing = await pool.query(`SELECT * FROM visits WHERE id = $1`, [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الزيارة غير موجودة' });
  const visit = existing.rows[0];

  try {
    await assertCanWriteRecord(req.user!, { doctor_id: visit.doctor_id, patient_id: visit.patient_id });
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    if (err instanceof RecordOwnershipError) return res.status(403).json({ error: err.message });
    throw err;
  }

  const b = req.body;
  const result = await pool.query(
    `UPDATE visits SET
      visit_date = COALESCE($1, visit_date),
      visit_type = COALESCE($2, visit_type),
      chief_complaint = COALESCE($3, chief_complaint),
      symptoms = COALESCE($4, symptoms),
      diagnosis = COALESCE($5, diagnosis),
      notes = COALESCE($6, notes),
      blood_pressure = COALESCE($7, blood_pressure),
      heart_rate = COALESCE($8, heart_rate),
      temperature = COALESCE($9, temperature),
      weight = COALESCE($10, weight),
      height = COALESCE($11, height),
      medications = COALESCE($12, medications),
      follow_up_date = COALESCE($13, follow_up_date)
     WHERE id = $14 RETURNING *`,
    [
      b.date, b.type, b.chiefComplaint, b.symptoms, b.diagnosis, b.notes,
      b.vitals?.bloodPressure, b.vitals?.heartRate, b.vitals?.temperature,
      b.vitals?.weight, b.vitals?.height, b.medications, b.followUpDate, req.params.id,
    ],
  );
  res.json(mapVisit(result.rows[0]));
});

/** حذف زيارة — صاحب الزيارة فقط */
visitsRouter.delete('/:id', requireRole('doctor'), async (req, res) => {
  const existing = await pool.query(`SELECT * FROM visits WHERE id = $1`, [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الزيارة غير موجودة' });
  const visit = existing.rows[0];

  try {
    await assertCanWriteRecord(req.user!, { doctor_id: visit.doctor_id, patient_id: visit.patient_id });
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    if (err instanceof RecordOwnershipError) return res.status(403).json({ error: err.message });
    throw err;
  }

  await pool.query(`DELETE FROM visits WHERE id = $1`, [req.params.id]);
  res.status(204).send();
});
