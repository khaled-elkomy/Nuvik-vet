import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Lock, Mail, Building2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Login() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clinicCode, setClinicCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password, clinicCode.trim() || undefined);
      navigate('/', { replace: true });
    } catch (reason: any) {
      setError(reason.message || 'تعذر تسجيل الدخول');
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-ink-50 px-4 py-10" dir="rtl">
      <div className="w-full max-w-sm">
        <header className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mb-3"><Activity size={26} className="text-white" /></div>
          <h1 className="text-2xl font-bold text-ink-800">Nuvik Vet</h1>
          <p className="text-sm text-ink-500 mt-1">إدارة العيادة البيطرية والمتجر</p>
        </header>
        <form onSubmit={submit} className="bg-white rounded-xl2 shadow-card p-6 sm:p-7 space-y-4">
          <h2 className="font-bold text-ink-800 text-lg">تسجيل الدخول</h2>
          <Field icon={<Building2 size={16} />} label="رمز العيادة (عند الحاجة)" value={clinicCode} onChange={setClinicCode} autoComplete="organization" />
          <Field icon={<Mail size={16} />} label="البريد الإلكتروني" value={email} onChange={setEmail} type="email" autoComplete="username" required />
          <Field icon={<Lock size={16} />} label="كلمة المرور" value={password} onChange={setPassword} type="password" autoComplete="current-password" required />
          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60">
            {loading ? 'جارِ تسجيل الدخول...' : 'دخول'}
          </button>
        </form>
        <p className="text-center text-xs text-ink-400 mt-5">يتم تحديد الصلاحيات حسب حسابك.</p>
      </div>
    </main>
  );
}

function Field({ icon, label, value, onChange, type = 'text', autoComplete, required = false }: {
  icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; required?: boolean;
}) {
  return <label className="block text-sm font-medium text-ink-600">
    <span className="block mb-1.5">{label}</span>
    <span className="relative block"><span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">{icon}</span>
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete}
        className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400" />
    </span>
  </label>;
}
