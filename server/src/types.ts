export type UserRole = 'reception' | 'doctor';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  specialty?: string | null;
}

// نوسّع Express.Request عشان نضيف بيانات المستخدم بعد فحص التوكن
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
