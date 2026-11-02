import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { env } from '../env.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthUser, UserRole } from '../types.js';

export const authRouter = Router();

/**
 * تسجيل الدخول.
 * الواجهة بتبعت الدور المختار (reception / doctor) من صفحة تسجيل الدخول،
 * ونتأكد إن الحساب فعليًا من نفس الدور ده — عشان الريسبشن ما يقدرش
 * يدخل بحساب دكتور من نفس الفورم بالغلط أو قصدًا.
 */
authRouter.post('/login', async (req, res) => {
  const { email, password, role } = req.body as { email?: string; password?: string; role?: UserRole };

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور والدور مطلوبون' });
  }
  if (!['reception', 'doctor'].includes(role)) {
    return res.status(400).json({ error: 'الدور غير صحيح' });
  }

  const result = await pool.query(
    `SELECT id, full_name, email, password_hash, role, specialty, is_active
     FROM users WHERE email = $1 LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  const row = result.rows[0];

  if (!row || !row.is_active) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  const passwordOk = await bcrypt.compare(password, row.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  if (row.role !== role) {
    return res.status(401).json({
      error: `هذا الحساب مسجّل كـ ${row.role === 'doctor' ? 'دكتور' : 'ريسبشن'}، اختر النوع الصحيح لتسجيل الدخول`,
    });
  }

  const authUser: AuthUser = {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    specialty: row.specialty,
  };

  const token = jwt.sign(authUser, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
  });
  res.json({ token, user: authUser });
});

/** بيانات المستخدم الحالي — تستخدمها الواجهة لاسترجاع الجلسة بعد إعادة تحميل الصفحة */
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
