import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Eye, EyeOff, Lock, Mail, UserRound, Stethoscope } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../types';

const roleOptions: { key: UserRole; label: string; hint: string; icon: typeof UserRound }[] = [
  { key: 'reception', label: 'الريسبشن', hint: 'تسجيل المرضى والمواعيد وقائمة الانتظار', icon: UserRound },
  { key: 'doctor', label: 'الدكتور', hint: 'ملفات المرضى، الزيارات، الروشتات', icon: Stethoscope },
];

export default function Login() {
  const { login, pushToast } = useApp();
  const navigate = useNavigate();

  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!role) {
      setError('اختر نوع الحساب أولًا: ريسبشن أم دكتور');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('من فضلك أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password, role);
      pushToast('تم تسجيل الدخول بنجاح، أهلًا بك', 'success');
      // كل دور بيهبط على الشاشة الأساسية اللي هيشتغل عليها فعليًا
      navigate(role === 'reception' ? '/reception' : '/queue');
    } catch (err: any) {
      setError(err.message || 'بيانات الدخول غير صحيحة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mb-3">
            <Activity size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-ink-800">عيادة النيل التخصصية</h1>
          <p className="text-sm text-ink-400 mt-1">نظام إدارة العيادة الإلكتروني</p>
        </div>

        <div className="bg-white rounded-xl2 shadow-card p-6 sm:p-7">
          <h2 className="font-bold text-ink-800 text-lg mb-1">تسجيل الدخول</h2>
          <p className="text-xs text-ink-400 mb-5">اختر نوع الحساب اللي هتدخل بيه</p>

          {/* اختيار نوع الحساب — أول خطوة قبل أي بيانات، وهي اللي بتحدد صلاحياتك جوه النظام */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {roleOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRole(opt.key)}
                className={`flex flex-col items-center gap-2 rounded-xl2 border-2 px-3 py-4 text-center transition-colors ${
                  role === opt.key
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-ink-100 hover:border-brand-200'
                }`}
              >
                <opt.icon size={22} className={role === opt.key ? 'text-brand-700' : 'text-ink-400'} />
                <span className={`text-sm font-bold ${role === opt.key ? 'text-brand-700' : 'text-ink-700'}`}>
                  {opt.label}
                </span>
                <span className="text-[11px] text-ink-400 leading-tight">{opt.hint}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1.5">البريد الإلكتروني</label>
              <div className="relative">
                <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                  placeholder="example@clinic.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1.5">كلمة المرور</label>
              <div className="relative">
                <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>}

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-ink-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-ink-300 text-brand-600 focus:ring-brand-300"
                />
                تذكرني
              </label>
              <button type="button" className="text-brand-600 hover:text-brand-700 font-medium">
                نسيت كلمة المرور؟
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-70"
            >
              {loading ? 'جارِ تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-ink-100 text-[11px] text-ink-400 leading-relaxed">
            <p className="font-semibold text-ink-500 mb-1">حسابات تجريبية (كلمة المرور: demo1234):</p>
            <p>ريسبشن: reception@clinicpro.eg</p>
            <p>دكتور: dr.ahmed@clinicpro.eg</p>
          </div>
        </div>

        <p className="text-center text-xs text-ink-400 mt-6">
          نموذج تجريبي — لا تستخدم بيانات مرضى حقيقية
        </p>
      </div>
    </div>
  );
}
