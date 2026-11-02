import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { env } from '../env.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function attemptKey(email: string, ip: string) { return `${email}\u0000${ip}`; }
function recentFailures(key: string, now = Date.now()) {
  const current = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  failures.set(key, current);
  return current;
}

async function recordLoginAudit(clinicId: string, branchId: string, actorId: string | null, success: boolean) {
  await pool.query(
    `INSERT INTO audit_events (clinic_id, branch_id, actor_id, event_type, entity_type, entity_id, safe_summary)
     VALUES ($1,$2,$3,$4,'auth',COALESCE($5::uuid, gen_random_uuid()),$6)`,
    [clinicId, branchId, actorId, success ? 'auth.login.success' : 'auth.login.failure', actorId, success ? 'Login succeeded' : 'Login failed'],
  );
}

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = req.body?.password;
  const clinicCode = String(req.body?.clinicCode ?? '').trim();
  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }
  const key = attemptKey(email, req.ip ?? 'unknown');
  if (recentFailures(key).length >= MAX_FAILURES) {
    return res.status(429).json({ error: 'محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة.' });
  }

  const clinics = await pool.query(`SELECT id, code FROM clinics ORDER BY created_at`);
  if (!clinics.rows.length) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  let clinic: { id: string; code: string } | undefined;
  if (clinicCode) clinic = clinics.rows.find((row) => row.code.toLowerCase() === clinicCode.toLowerCase());
  else if (clinics.rows.length === 1) clinic = clinics.rows[0];
  if (!clinic) return res.status(400).json({ error: clinics.rows.length > 1 ? 'رمز العيادة مطلوب' : 'رمز العيادة غير صحيح' });

  const result = await pool.query(
    `SELECT u.id, u.clinic_id, u.branch_id, u.normalized_email, u.password_hash,
            u.display_name, u.active, u.locked_at, b.active AS branch_active
       FROM users u JOIN branches b ON b.id = u.branch_id AND b.clinic_id = u.clinic_id
      WHERE u.clinic_id = $1 AND u.normalized_email = $2`,
    [clinic.id, email],
  );
  const row = result.rows[0];
  const passwordMatches = row ? await bcrypt.compare(password, row.password_hash) : false;
  if (!row || !row.active || row.locked_at || !row.branch_active || !passwordMatches) {
    const branch = row?.branch_id ?? (await pool.query(
      `SELECT id FROM branches WHERE clinic_id = $1 AND active ORDER BY created_at LIMIT 1`, [clinic.id],
    )).rows[0]?.id;
    if (branch) await recordLoginAudit(clinic.id, branch, row?.id ?? null, false);
    failures.set(key, [...recentFailures(key), Date.now()]);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  failures.delete(key);
  const grants = await pool.query(
    `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.clinic_id = ur.clinic_id
       JOIN role_permissions rp ON rp.role_id = r.id AND rp.clinic_id = r.clinic_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1 AND ur.clinic_id = $2`,
    [row.id, row.clinic_id],
  );
  await recordLoginAudit(row.clinic_id, row.branch_id, row.id, true);
  const token = jwt.sign(
    { clinic_id: row.clinic_id, branch_id: row.branch_id },
    env.jwtSecret,
    { subject: row.id, expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'], issuer: env.jwtIssuer, audience: env.jwtAudience },
  );
  res.json({
    token,
    user: {
      id: row.id,
      displayName: row.display_name,
      email: row.normalized_email,
      clinicId: row.clinic_id,
      branchId: row.branch_id,
      permissions: grants.rows.map((grant) => grant.code),
    },
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await pool.query(
    `SELECT id, display_name, normalized_email FROM users
      WHERE id = $1 AND clinic_id = $2 AND branch_id = $3`,
    [req.auth!.userId, req.auth!.clinicId, req.auth!.branchId],
  );
  if (!user.rows[0]) return res.status(401).json({ error: 'الحساب غير موجود' });
  res.json({ user: { ...req.auth, displayName: user.rows[0].display_name, email: user.rows[0].normalized_email } });
});
