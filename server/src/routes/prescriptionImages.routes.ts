import { Router } from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { memoryUpload, enforceUploadRequestLimit, saveBufferSafely } from '../lib/fileUpload.js';
import { assertCanOpenChart, assertCanAccessPatientFiles, assertCanWriteRecord, assertActiveExamination, getActiveExamination, ActiveExaminationRequiredError, ChartAccessError, RecordOwnershipError } from '../lib/authz.js';

export const prescriptionImagesRouter = Router();
prescriptionImagesRouter.use(requireAuth);

const imagesDir = path.resolve(process.cwd(), 'uploads', 'prescriptions');

function mapImage(row: any) {
  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    url: `/api/prescription-images/file/${row.id}`,
    medicationsUrl: `/api/prescription-images/file/${row.id}`,
    instructionsUrl: row.instructions_image_path ? `/api/prescription-images/file/${row.id}/instructions` : null,
    investigationsUrl: row.investigations_image_path ? `/api/prescription-images/file/${row.id}/investigations` : null,
    shareUrl: row.share_token ? `/api/prescription-images/public/${row.share_token}` : null,
    createdAt: row.created_at,
  };
}

/** كل الروشتات المرسومة لمريض معيّن — محمي بصلاحية الوصول للملفات */
prescriptionImagesRouter.get('/patient/:patientId', async (req, res) => {
  try {
    await assertCanAccessPatientFiles(req.user!, req.params.patientId);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    throw err;
  }
  const result = await pool.query(
    `SELECT pi.*, u.full_name AS doctor_name FROM prescription_images pi
     JOIN users u ON u.id = pi.doctor_id
     WHERE pi.patient_id = $1 ORDER BY pi.created_at DESC`,
    [req.params.patientId],
  );
  res.json(result.rows.map(mapImage));
});

/**
 * حفظ روشتة مرسومة (Canvas) — للدكاترة فقط، يجب أن يكون الطبيب مُعيّن للمريض ولديه فحص نشط.
 */
prescriptionImagesRouter.post(
  '/patient/:patientId',
  requireRole('doctor'),
  enforceUploadRequestLimit,
  memoryUpload.fields([
    { name: 'medications', maxCount: 1 },
    { name: 'instructions', maxCount: 1 },
    { name: 'investigations', maxCount: 1 },
    // Maintains compatibility with existing callers while Version 2 moves to sections.
    { name: 'file', maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const medicationsFile = files?.medications?.[0] || files?.file?.[0];
    if (!medicationsFile) return res.status(400).json({ error: 'لم يتم إرسال قسم الأدوية' });

    try {
      await assertCanOpenChart(req.user!, req.params.patientId, true);
      await assertActiveExamination(req.user!.id, req.params.patientId);
    } catch (err) {
      if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
      if (err instanceof ActiveExaminationRequiredError) return res.status(403).json({ error: err.message });
      throw err;
    }

    const examination = await getActiveExamination(req.user!.id, req.params.patientId);
    if (!examination) return res.status(403).json({ error: 'لا يمكن كتابة روشتة إلا أثناء جاري الكشف' });

    const { filePath: medicationsPath } = saveBufferSafely(imagesDir, medicationsFile.buffer, '.png');
    const instructionsPath = files?.instructions?.[0]
      ? saveBufferSafely(imagesDir, files.instructions[0].buffer, '.png').filePath : null;
    const investigationsPath = files?.investigations?.[0]
      ? saveBufferSafely(imagesDir, files.investigations[0].buffer, '.png').filePath : null;

    const result = await pool.query(
      `INSERT INTO prescription_images (patient_id, doctor_id, image_path, instructions_image_path, investigations_image_path, queue_entry_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.patientId, req.user!.id, medicationsPath, instructionsPath, investigationsPath, examination.id],
    );
    const full = await pool.query(
      `SELECT pi.*, u.full_name AS doctor_name FROM prescription_images pi
       JOIN users u ON u.id = pi.doctor_id WHERE pi.id = $1`,
      [result.rows[0].id],
    );
    res.status(201).json(mapImage(full.rows[0]));
  },
);

/** تحميل صورة الروشتة — محمي بصلاحية الوصول للملفات */
prescriptionImagesRouter.get('/file/:id', async (req, res) => {
  const result = await pool.query(`SELECT * FROM prescription_images WHERE id = $1`, [req.params.id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'الروشتة غير موجودة' });

  try {
    await assertCanAccessPatientFiles(req.user!, row.patient_id);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'الروشتة غير موجودة' });
    throw err;
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(row.image_path);
});

/** أقسام الروشتة المكتوبة يدويًا (تعليمات أو فحوصات) تُقرأ بنفس حماية ملف المريض. */
prescriptionImagesRouter.get('/file/:id/:section', async (req, res) => {
  const column = req.params.section === 'instructions' ? 'instructions_image_path'
    : req.params.section === 'investigations' ? 'investigations_image_path' : null;
  if (!column) return res.status(404).json({ error: 'قسم الروشتة غير موجود' });
  const result = await pool.query(`SELECT patient_id, ${column} AS file_path FROM prescription_images WHERE id = $1`, [req.params.id]);
  const row = result.rows[0];
  if (!row?.file_path) return res.status(404).json({ error: 'قسم الروشتة غير موجود' });
  try { await assertCanAccessPatientFiles(req.user!, row.patient_id); }
  catch (err) { if (err instanceof ChartAccessError) return res.status(404).json({ error: 'قسم الروشتة غير موجود' }); throw err; }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(row.file_path);
});

/**
 * توليد رابط مشاركة — للطبيب صاحب الروشتة فقط.
 */
prescriptionImagesRouter.post('/:id/share', requireRole('doctor'), async (req, res) => {
  const existing = await pool.query(`SELECT * FROM prescription_images WHERE id = $1`, [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'الروشتة غير موجودة' });
  const img = existing.rows[0];

  try {
    await assertCanWriteRecord(req.user!, { doctor_id: img.doctor_id, patient_id: img.patient_id });
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'الروشتة غير موجودة' });
    if (err instanceof RecordOwnershipError) return res.status(403).json({ error: err.message });
    throw err;
  }

  const token = img.share_token || randomUUID();
  if (!img.share_token) {
    await pool.query(`UPDATE prescription_images SET share_token = $1 WHERE id = $2`, [token, req.params.id]);
  }
  res.json({ shareUrl: `/api/prescription-images/public/${token}` });
});

/** عرض الروشتة بدون تسجيل دخول — للمريض اللي هيستقبل رابط واتساب (عام بالتوكن) */
prescriptionImagesRouter.get('/public/:token', async (req, res) => {
  const result = await pool.query(`SELECT * FROM prescription_images WHERE share_token = $1`, [req.params.token]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'الرابط غير صحيح أو منتهي' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(row.image_path);
});
