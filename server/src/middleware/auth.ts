import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { env } from '../env.js';
import type { RequestAuth } from '../types.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'يجب تسجيل الدخول أولًا' });
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
    }) as jwt.JwtPayload;
  } catch {
    return res.status(401).json({ error: 'جلسة الدخول غير صالحة أو منتهية، سجّل الدخول من جديد' });
  }
  const userId = payload.sub;
  const clinicId = payload.clinic_id;
  const branchId = payload.branch_id;
  if (typeof userId !== 'string' || typeof clinicId !== 'string' || typeof branchId !== 'string') {
    return res.status(401).json({ error: 'جلسة الدخول غير صالحة أو منتهية، سجّل الدخول من جديد' });
  }
  const result = await pool.query(
    `SELECT u.id, u.clinic_id, u.branch_id, u.display_name, u.normalized_email
       FROM users u JOIN branches b ON b.id = u.branch_id AND b.clinic_id = u.clinic_id AND b.active
      WHERE u.id = $1 AND u.clinic_id = $2 AND u.branch_id = $3
        AND u.active = true AND u.locked_at IS NULL`,
    [userId, clinicId, branchId],
  );
  if (!result.rows[0]) return res.status(401).json({ error: 'الحساب غير نشط أو الجلسة لم تعد صالحة' });
  const grants = await pool.query(
    `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.clinic_id = ur.clinic_id
       JOIN role_permissions rp ON rp.role_id = r.id AND rp.clinic_id = r.clinic_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1 AND ur.clinic_id = $2`,
    [userId, clinicId],
  );
  const auth: RequestAuth = { userId, clinicId, branchId, permissions: grants.rows.map((row) => row.code) };
  req.auth = auth;
  req.user = { ...auth, displayName: result.rows[0].display_name, email: result.rows[0].normalized_email };
  return next();
}

export function requirePermission(code: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'يجب تسجيل الدخول أولًا' });
    if (!req.auth.permissions.includes(code)) return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
    return next();
  };
}
