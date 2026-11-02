import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

async function auditUserChange(req: import('express').Request, eventType: string, entityId: string) {
  await pool.query(
    `INSERT INTO audit_events (clinic_id, branch_id, actor_id, event_type, entity_type, entity_id, safe_summary)
     VALUES ($1,$2,$3,$4,'user',$5,$6)`,
    [req.auth!.clinicId, req.auth!.branchId, req.auth!.userId, eventType, entityId, 'Staff account updated'],
  );
}

usersRouter.get('/', requirePermission('users.manage'), async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.normalized_email AS email, u.display_name AS "displayName", u.branch_id AS "branchId",
            u.active, u.locked_at AS "lockedAt", COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.clinic_id = u.clinic_id
       LEFT JOIN roles r ON r.id = ur.role_id AND r.clinic_id = ur.clinic_id
      WHERE u.clinic_id = $1
      GROUP BY u.id ORDER BY u.created_at`,
    [req.auth!.clinicId],
  );
  res.json(result.rows);
});

usersRouter.post('/', requirePermission('users.manage'), async (req, res) => {
  const displayName = String(req.body?.displayName ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = req.body?.password;
  if (!displayName || !email || typeof password !== 'string' || password.length < 12) {
    return res.status(400).json({ error: 'الاسم والبريد وكلمة مرور من 12 حرفًا على الأقل مطلوبة' });
  }
  const branchId = req.auth!.branchId;
  const branch = await pool.query(`SELECT id FROM branches WHERE id=$1 AND clinic_id=$2 AND active`, [branchId, req.auth!.clinicId]);
  if (!branch.rows[0]) return res.status(400).json({ error: 'الفرع غير صالح' });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO users (clinic_id, branch_id, normalized_email, password_hash, display_name)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, normalized_email AS email, display_name AS "displayName", branch_id AS "branchId", active`,
      [req.auth!.clinicId, branchId, email, passwordHash, displayName],
    );
    await auditUserChange(req, 'users.account.created', result.rows[0].id);
    res.status(201).json({ ...result.rows[0], roles: [] });
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'البريد مستخدم بالفعل في هذه العيادة' });
    throw error;
  }
});

usersRouter.post('/:userId/roles', requirePermission('users.roles.manage'), async (req, res) => {
  const roleCode = String(req.body?.roleCode ?? '').trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query(`SELECT id FROM roles WHERE clinic_id=$1 AND code=$2`, [req.auth!.clinicId, roleCode]);
    if (!role.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الدور غير موجود' }); }
    const user = await client.query(`SELECT id FROM users WHERE id=$1 AND clinic_id=$2`, [req.params.userId, req.auth!.clinicId]);
    if (!user.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'المستخدم غير موجود' }); }
    await client.query(
      `INSERT INTO user_roles (clinic_id,user_id,role_id,assigned_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,role_id) DO NOTHING`,
      [req.auth!.clinicId, req.params.userId, role.rows[0].id, req.auth!.userId],
    );
    await client.query(
      `INSERT INTO audit_events (clinic_id,branch_id,actor_id,event_type,entity_type,entity_id,safe_summary)
       VALUES ($1,$2,$3,'users.role.assigned','user',$4,'Staff role assigned')`,
      [req.auth!.clinicId, req.auth!.branchId, req.auth!.userId, req.params.userId],
    );
    await client.query('COMMIT');
    res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});

usersRouter.patch('/:userId/deactivate', requirePermission('users.manage'), async (req, res) => {
  if (req.params.userId === req.auth!.userId) return res.status(400).json({ error: 'لا يمكن تعطيل حسابك الحالي' });
  const result = await pool.query(
    `UPDATE users SET active=false, updated_at=now()
      WHERE id=$1 AND clinic_id=$2 RETURNING id`,
    [req.params.userId, req.auth!.clinicId],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'المستخدم غير موجود' });
  await auditUserChange(req, 'users.account.deactivated', req.params.userId);
  res.status(204).end();
});
