import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db.js';
import type { AuthUser } from '../types.js';

export interface AuthorizedRequest extends Request {
  user: AuthUser;
}

/**
 * التحقق من أن الطبيب مُعيّن للمريض (يمكنه فتح ملف المريض)
 * للريسبشن: يُسمح بالوصول لهوية المريض فقط (ليس السجل الطبي)
 * للدكتور: يجب أن يكون هناك علاقة نشطة في patient_doctors
 */
export async function assertCanOpenChart(user: AuthUser, patientId: string, forClinicalAccess = false): Promise<void> {
  if (user.role === 'reception') {
    if (forClinicalAccess) {
      throw new ChartAccessError('الريسبشن غير مخول بالوصول للسجل الطبي');
    }
    // الريسبشن يمكنه الوصول لبيانات الهوية فقط
    return;
  }

  if (user.role === 'doctor') {
    const result = await pool.query(
      `SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND is_active = true`,
      [patientId, user.id]
    );
    if (result.rows.length === 0) {
      throw new ChartAccessError('غير مصرح لك بالوصول لملف هذا المريض');
    }
    return;
  }

  throw new ChartAccessError('دور مستخدم غير معروف');
}

/**
 * التحقق من ملكية السجل الطبي (يمكن التعديل/الحذف)
 * فقط صاحب السجل (المؤلف) يمكنه التعديل
 */
export async function assertCanWriteRecord(user: AuthUser, record: { doctor_id: string; patient_id: string }): Promise<void> {
  if (user.role !== 'doctor') {
    throw new RecordOwnershipError('الريسبشن غير مخول بتعديل السجلات الطبية');
  }

  // التحقق من أن الطبيب مُعيّن للمريض أولاً
  const chartAccess = await pool.query(
    `SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND is_active = true`,
    [record.patient_id, user.id]
  );
  if (chartAccess.rows.length === 0) {
    throw new ChartAccessError('غير مصرح لك بالوصول لملف هذا المريض');
  }

  // التحقق من ملكية السجل
  if (record.doctor_id !== user.id) {
    throw new RecordOwnershipError('لا يمكنك تعديل سجل طبي لم تكتبه أنت');
  }
}

/**
 * التحقق من أن الطبيب مُعيّن للمريض - يعيد boolean للاستخدام في الاستعلامات
 */
export async function isDoctorAssignedToPatient(doctorId: string, patientId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM patient_doctors WHERE patient_id = $1 AND doctor_id = $2 AND is_active = true`,
    [patientId, doctorId]
  );
  return result.rows.length > 0;
}

/**
 * الحصول على قائمة المرضى المعينين لطبيب معين
 */
export async function getAssignedPatients(doctorId: string, searchQuery?: string) {
  let query = `
    SELECT p.* FROM patients p
    JOIN patient_doctors pd ON pd.patient_id = p.id
    WHERE pd.doctor_id = $1 AND pd.is_active = true
  `;
  const params: any[] = [doctorId];

  if (searchQuery) {
    query += ` AND (p.full_name ILIKE $2 OR p.file_number ILIKE $2 OR p.phone ILIKE $2)`;
    params.push(`%${searchQuery}%`);
  }

  query += ` ORDER BY p.created_at DESC LIMIT 200`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * التحقق من صلاحية الوصول للملف (لـ attachments, prescription-images)
 * نفس منطق assertCanOpenChart لكن للقراءة فقط
 */
export async function assertCanAccessPatientFiles(user: AuthUser, patientId: string): Promise<void> {
  return assertCanOpenChart(user, patientId, true);
}

/**
 * التحقق من وجود فحص نشط (queue entry بحالة in_progress) للطبيب والمريض
 * يستخدم للسماح بإنشاء روشتة جديدة فقط أثناء الفحص النشط
 */
export async function assertActiveExamination(doctorId: string, patientId: string): Promise<void> {
  const examination = await getActiveExamination(doctorId, patientId);
  if (!examination) {
    throw new ActiveExaminationRequiredError('لا يمكن كتابة روشتة إلا أثناء جاري الكشف');
  }
}

/** يعيد فحص الطبيب النشط نفسه لاستخدامه كمرجع للمخرجات السريرية. */
export async function getActiveExamination(doctorId: string, patientId: string): Promise<{ id: string } | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM queue_entries
     WHERE doctor_id = $1 AND patient_id = $2 
     AND status = 'in_progress'
     ORDER BY started_at DESC NULLS LAST, checked_in_at DESC
     LIMIT 1`,
    [doctorId, patientId]
  );
  return result.rows[0] ?? null;
}

export class ActiveExaminationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActiveExaminationRequiredError';
  }
}

export class ChartAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartAccessError';
  }
}

export class RecordOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordOwnershipError';
  }
}

/**
 * معالج أخطاء مركزي لأخطاء الصلاحيات
 */
export function handleAuthzError(err: Error, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof ChartAccessError || err instanceof RecordOwnershipError || err instanceof ActiveExaminationRequiredError) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
}
