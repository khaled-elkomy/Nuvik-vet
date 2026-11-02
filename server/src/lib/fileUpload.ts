import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { fileTypeFromBuffer } from 'file-type';

export const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

// File payload cap is 50 MB (decimal); the multipart request cap allows the
// file headers/boundaries while staying below Nginx's 50 MiB body limit.
export const MAX_UPLOAD_FILE_BYTES = 50_000_000;
const MAX_UPLOAD_REQUEST_BYTES = 50 * 1024 * 1024;

export function enforceUploadRequestLimit(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const rawLength = req.headers['content-length'];
  if (rawLength === undefined) return next();
  const requestLength = Number(rawLength);
  if (!Number.isSafeInteger(requestLength) || requestLength < 0) {
    return res.status(400).json({ error: 'Invalid upload request size' });
  }
  if (requestLength > MAX_UPLOAD_REQUEST_BYTES) {
    return res.status(413).json({ error: 'Upload request exceeds the 50 MB limit' });
  }
  next();
}

/**
 * ملحوظة أمان: بنستخدم memoryStorage عشان نقدر نفحص المحتوى الحقيقي للملف
 * (magic bytes) قبل ما نحفظه — بدل ما نصدّق الـ mimetype أو اسم الملف
 * اللي بيبعتهم المتصفح، وهما سهل جدًا التلاعب فيهم (Content-Type spoofing).
 */
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_BYTES, files: 4 },
});

/**
 * يفحص محتوى الملف فعليًا، ويرجّع امتداد آمن مبني على النوع الحقيقي
 * (مش على اسم الملف اللي ممكن يكون "x.html" متنكر في صورة).
 * لو النوع مش من ضمن المسموح، بيرفض الملف.
 */
export async function detectSafeExtension(buffer: Buffer): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TO_EXT[detected.mime]) return null;
  return ALLOWED_MIME_TO_EXT[detected.mime];
}

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** يحفظ Buffer على القرص باسم عشوائي آمن (UUID) + الامتداد الحقيقي المكتشف */
export function saveBufferSafely(dir: string, buffer: Buffer, ext: string): { filename: string; filePath: string } {
  ensureDir(dir);
  const filename = `${uuid()}${ext}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return { filename, filePath };
}
