import { Router } from 'express';
import path from 'node:path';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { memoryUpload, enforceUploadRequestLimit, detectSafeExtension, saveBufferSafely } from '../lib/fileUpload.js';
import { assertCanOpenChart, assertCanAccessPatientFiles, ChartAccessError } from '../lib/authz.js';

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

const uploadsDir = path.resolve(process.cwd(), 'uploads', 'attachments');

function mapAttachment(row: any) {
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.name,
    type: row.type,
    url: `/api/attachments/file/${row.id}`,
    mimeType: row.mime_type,
    investigationId: row.investigation_id,
    investigationName: row.investigation_name ?? null,
    createdAt: row.created_at,
  };
}

/** كل مرفقات مريض معيّن — محمي بصلاحية الوصول للملفات */
attachmentsRouter.get('/patient/:patientId', async (req, res) => {
  try {
    await assertCanAccessPatientFiles(req.user!, req.params.patientId);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
    throw err;
  }
  const result = await pool.query(
    `SELECT a.*, pi.investigation_type_id, it.name AS investigation_name
     FROM attachments a
     LEFT JOIN patient_investigations pi ON pi.id = a.investigation_id
     LEFT JOIN investigation_types it ON it.id = pi.investigation_type_id
     WHERE a.patient_id = $1 ORDER BY a.created_at DESC`,
    [req.params.patientId],
  );
  res.json(result.rows.map(mapAttachment));
});

/**
 * تحميل ملف مرفق واحد — محمي بصلاحية الوصول للملفات.
 */
attachmentsRouter.get('/file/:attachmentId', async (req, res) => {
  const result = await pool.query(`SELECT * FROM attachments WHERE id = $1`, [req.params.attachmentId]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'الملف غير موجود' });

  try {
    await assertCanAccessPatientFiles(req.user!, row.patient_id);
  } catch (err) {
    if (err instanceof ChartAccessError) return res.status(404).json({ error: 'الملف غير موجود' });
    throw err;
  }

  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.name)}"`);
  res.sendFile(row.file_path);
});

/**
 * رفع مرفق جديد (تحليل / أشعة / تقرير) — الريسبشن والدكتور.
 * الريسبشن: ترفع ملفات تشغيلية (تتطلب وجود المريض فقط).
 * الدكتور: يرفع ملفات سريرية (يتطلب تعيين للمريض).
 */
attachmentsRouter.post('/patient/:patientId', enforceUploadRequestLimit, memoryUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم إرسال ملف' });
  const type = req.body.type;
  if (!['تحليل دم', 'أشعة', 'تقرير طبي'].includes(type)) {
    return res.status(400).json({ error: 'نوع المرفق غير صحيح' });
  }

  // التحقق من الصلاحيات حسب الدور
  if (req.user!.role === 'reception') {
    // الريسبشن: التحقق من وجود المريض فقط
    const patientCheck = await pool.query(`SELECT id FROM patients WHERE id = $1`, [req.params.patientId]);
    if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'المريض غير موجود' });
  } else if (req.user!.role === 'doctor') {
    // الدكتور: يجب أن يكون مُعيّن للمريض
    try {
      await assertCanOpenChart(req.user!, req.params.patientId, true);
    } catch (err) {
      if (err instanceof ChartAccessError) return res.status(404).json({ error: 'المريض غير موجود' });
      throw err;
    }
  }

  const investigationId = req.body.investigationId || null;
  if (investigationId) {
    // A result can only be attached to an investigation belonging to this patient.
    // Reception cannot use this clinical association endpoint.
    if (req.user!.role !== 'doctor') return res.status(403).json({ error: 'ربط النتيجة بالفحص مخصص للطبيب' });
    const investigation = await pool.query(
      `SELECT id FROM patient_investigations WHERE id = $1 AND patient_id = $2`, [investigationId, req.params.patientId]);
    if (!investigation.rows[0]) return res.status(400).json({ error: 'الفحص المحدد لا يخص هذا المريض' });
  }

  const ext = await detectSafeExtension(req.file.buffer);
  if (!ext) return res.status(400).json({ error: 'نوع الملف غير مسموح — الأنواع المقبولة: JPG, PNG, WEBP, PDF' });

  const { filePath } = saveBufferSafely(uploadsDir, req.file.buffer, ext);
  const mimeType = ext === '.pdf' ? 'application/pdf' : `image/${ext.replace('.', '').replace('jpg', 'jpeg')}`;

  const result = await pool.query(
    `INSERT INTO attachments (patient_id, uploaded_by, name, type, file_path, mime_type, size_bytes, investigation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      req.params.patientId, req.user!.id, req.body.name || req.file.originalname,
      type, filePath, mimeType, req.file.size, investigationId,
    ],
  );
  res.status(201).json(mapAttachment(result.rows[0]));
});
