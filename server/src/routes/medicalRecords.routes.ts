import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertActiveExamination, assertCanOpenChart, assertCanWriteRecord, getActiveExamination, ActiveExaminationRequiredError, ChartAccessError, RecordOwnershipError } from '../lib/authz.js';

export const medicalRecordsRouter = Router();
medicalRecordsRouter.use(requireAuth);

async function assertClinicalRead(req: any, patientId: string, res: any) {
  try {
    await assertCanOpenChart(req.user, patientId, true);
    return true;
  } catch (err) {
    if (err instanceof ChartAccessError) res.status(404).json({ error: 'المريض غير موجود' });
    else throw err;
    return false;
  }
}

/** التاريخ المرضي والعمليات تُحرر فقط أثناء كشف الطبيب النشط. */
async function assertActiveClinicalWrite(req: any, patientId: string, res: any) {
  try {
    await assertActiveExamination(req.user.id, patientId);
    return true;
  } catch (err) {
    if (err instanceof ActiveExaminationRequiredError) res.status(403).json({ error: err.message });
    else throw err;
    return false;
  }
}

async function assertOwned(req: any, res: any, table: 'patient_medical_history' | 'patient_operations' | 'patient_investigations') {
  const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
  if (!result.rows[0]) { res.status(404).json({ error: 'السجل غير موجود' }); return null; }
  const record = result.rows[0];
  try {
    await assertCanWriteRecord(req.user, { doctor_id: record.doctor_id, patient_id: record.patient_id });
    return record;
  } catch (err) {
    if (err instanceof ChartAccessError) res.status(404).json({ error: 'المريض غير موجود' });
    else if (err instanceof RecordOwnershipError) res.status(403).json({ error: err.message });
    else throw err;
    return null;
  }
}

medicalRecordsRouter.get('/history/patient/:patientId', async (req, res) => {
  if (!await assertClinicalRead(req, req.params.patientId, res)) return;
  const result = await pool.query(
    `SELECT h.*, u.full_name AS doctor_name FROM patient_medical_history h JOIN users u ON u.id = h.doctor_id
     WHERE h.patient_id = $1 ORDER BY h.known_date DESC NULLS LAST, h.created_at DESC`, [req.params.patientId]);
  res.json(result.rows);
});

medicalRecordsRouter.post('/history', requireRole('doctor'), async (req, res) => {
  const { patientId, title, description, knownDate } = req.body;
  if (!patientId || !title?.trim() || !description?.trim()) return res.status(400).json({ error: 'عنوان ووصف التاريخ المرضي مطلوبان' });
  if (!await assertClinicalRead(req, patientId, res)) return;
  if (!await assertActiveClinicalWrite(req, patientId, res)) return;
  const result = await pool.query(
    `INSERT INTO patient_medical_history (patient_id, doctor_id, title, description, known_date, updated_by)
     VALUES ($1,$2,$3,$4,$5,$2) RETURNING *`, [patientId, req.user!.id, title.trim(), description.trim(), knownDate || null]);
  res.status(201).json(result.rows[0]);
});

medicalRecordsRouter.patch('/history/:id', requireRole('doctor'), async (req, res) => {
  const record = await assertOwned(req, res, 'patient_medical_history'); if (!record) return;
  if (!await assertActiveClinicalWrite(req, record.patient_id, res)) return;
  const b = req.body;
  const result = await pool.query(
    `UPDATE patient_medical_history SET title = COALESCE($1,title), description = COALESCE($2,description),
       known_date = COALESCE($3,known_date), updated_by = $4, updated_at = now() WHERE id = $5 RETURNING *`,
    [b.title?.trim(), b.description?.trim(), b.knownDate, req.user!.id, record.id]);
  res.json(result.rows[0]);
});

medicalRecordsRouter.delete('/history/:id', requireRole('doctor'), async (req, res) => {
  const record = await assertOwned(req, res, 'patient_medical_history'); if (!record) return;
  if (!await assertActiveClinicalWrite(req, record.patient_id, res)) return;
  await pool.query('DELETE FROM patient_medical_history WHERE id = $1', [record.id]); res.status(204).send();
});

medicalRecordsRouter.get('/operations/patient/:patientId', async (req, res) => {
  if (!await assertClinicalRead(req, req.params.patientId, res)) return;
  const result = await pool.query(
    `SELECT o.*, u.full_name AS doctor_name FROM patient_operations o JOIN users u ON u.id = o.doctor_id
     WHERE o.patient_id = $1 ORDER BY o.operation_date DESC NULLS LAST, o.created_at DESC`, [req.params.patientId]);
  res.json(result.rows);
});

medicalRecordsRouter.post('/operations', requireRole('doctor'), async (req, res) => {
  const b = req.body;
  if (!b.patientId || !b.operationName?.trim()) return res.status(400).json({ error: 'اسم العملية مطلوب' });
  if (!await assertClinicalRead(req, b.patientId, res)) return;
  if (!await assertActiveClinicalWrite(req, b.patientId, res)) return;
  const result = await pool.query(
    `INSERT INTO patient_operations (patient_id, doctor_id, operation_name, description, surgeon_name, operation_date, facility, notes, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$2) RETURNING *`,
    [b.patientId, req.user!.id, b.operationName.trim(), b.description || null, b.surgeonName || null, b.operationDate || null, b.facility || null, b.notes || null]);
  res.status(201).json(result.rows[0]);
});

medicalRecordsRouter.patch('/operations/:id', requireRole('doctor'), async (req, res) => {
  const record = await assertOwned(req, res, 'patient_operations'); if (!record) return;
  if (!await assertActiveClinicalWrite(req, record.patient_id, res)) return;
  const b = req.body;
  const result = await pool.query(
    `UPDATE patient_operations SET operation_name = COALESCE($1,operation_name), description = COALESCE($2,description), surgeon_name = COALESCE($3,surgeon_name),
     operation_date = COALESCE($4,operation_date), facility = COALESCE($5,facility), notes = COALESCE($6,notes), updated_by = $7, updated_at = now() WHERE id = $8 RETURNING *`,
    [b.operationName?.trim(), b.description, b.surgeonName, b.operationDate, b.facility, b.notes, req.user!.id, record.id]);
  res.json(result.rows[0]);
});

medicalRecordsRouter.delete('/operations/:id', requireRole('doctor'), async (req, res) => {
  const record = await assertOwned(req, res, 'patient_operations'); if (!record) return;
  if (!await assertActiveClinicalWrite(req, record.patient_id, res)) return;
  await pool.query('DELETE FROM patient_operations WHERE id = $1', [record.id]); res.status(204).send();
});

medicalRecordsRouter.get('/investigation-types', requireRole('doctor'), async (_req, res) => {
  const result = await pool.query(`SELECT * FROM investigation_types WHERE is_active = true ORDER BY category, name`);
  res.json(result.rows);
});

medicalRecordsRouter.get('/investigations/patient/:patientId', async (req, res) => {
  if (!await assertClinicalRead(req, req.params.patientId, res)) return;
  const result = await pool.query(
    `SELECT pi.*, it.name AS investigation_name, it.category, u.full_name AS doctor_name,
            qe.started_at AS examination_started_at
     FROM patient_investigations pi JOIN investigation_types it ON it.id = pi.investigation_type_id JOIN users u ON u.id = pi.doctor_id
     LEFT JOIN queue_entries qe ON qe.id = pi.queue_entry_id
     WHERE pi.patient_id = $1 ORDER BY pi.requested_at DESC`, [req.params.patientId]);
  res.json(result.rows);
});

medicalRecordsRouter.post('/investigations', requireRole('doctor'), async (req, res) => {
  const { patientId, investigationTypeId, notes } = req.body;
  if (!patientId || !investigationTypeId) return res.status(400).json({ error: 'نوع الفحص مطلوب' });
  if (!await assertClinicalRead(req, patientId, res)) return;
  try { await assertActiveExamination(req.user!.id, patientId); }
  catch (err) { if (err instanceof ActiveExaminationRequiredError) return res.status(403).json({ error: err.message }); throw err; }
  const type = await pool.query('SELECT id FROM investigation_types WHERE id = $1 AND is_active = true', [investigationTypeId]);
  if (!type.rows[0]) return res.status(400).json({ error: 'نوع الفحص غير متاح' });
  const examination = await getActiveExamination(req.user!.id, patientId);
  if (!examination) return res.status(403).json({ error: 'لا يمكن طلب فحص إلا أثناء جاري الكشف' });
  const result = await pool.query(
    `INSERT INTO patient_investigations (patient_id, investigation_type_id, doctor_id, notes, updated_by, queue_entry_id) VALUES ($1,$2,$3,$4,$3,$5) RETURNING *`,
    [patientId, investigationTypeId, req.user!.id, notes || null, examination.id]);
  res.status(201).json(result.rows[0]);
});

medicalRecordsRouter.patch('/investigations/:id', requireRole('doctor'), async (req, res) => {
  const record = await assertOwned(req, res, 'patient_investigations'); if (!record) return;
  const b = req.body;
  const result = await pool.query(`UPDATE patient_investigations SET notes = COALESCE($1,notes), status = COALESCE($2,status), updated_by = $3, updated_at = now() WHERE id = $4 RETURNING *`, [b.notes, b.status, req.user!.id, record.id]);
  res.json(result.rows[0]);
});
