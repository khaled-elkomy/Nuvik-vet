import { useCallback, useEffect, useState } from 'react';
import { Plus, UserRound, UserX, ShieldCheck } from 'lucide-react';
import Layout from '../components/Layout';
import { usersAdminApi } from '../lib/api';
import { useApp } from '../context/AppContext';

const roles = [
  ['admin', 'مدير'], ['vet', 'طبيب بيطري'], ['reception_cashier', 'استقبال / صندوق'], ['store_keeper', 'مسؤول متجر'],
];

export default function Users() {
  const { pushToast, currentUser } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', password: '', roleCode: 'reception_cashier' });
  const canAssignRoles = currentUser?.permissions.includes('users.roles.manage') ?? false;
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await usersAdminApi.list()); }
    catch (error: any) { pushToast(error.message || 'تعذر تحميل المستخدمين', 'error'); }
    finally { setLoading(false); }
  }, [pushToast]);
  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const user = await usersAdminApi.create({ displayName: form.displayName, email: form.email, password: form.password });
      if (canAssignRoles) await usersAdminApi.assignRole(user.id, form.roleCode);
      setForm({ displayName: '', email: '', password: '', roleCode: 'reception_cashier' });
      pushToast(canAssignRoles ? 'تم إنشاء الحساب وإسناد الدور' : 'تم إنشاء الحساب', 'success');
      await load();
    } catch (error: any) { pushToast(error.message || 'تعذر إنشاء الحساب', 'error'); }
    finally { setSaving(false); }
  };
  const deactivate = async (userId: string) => {
    if (!window.confirm('تعطيل حساب المستخدم؟')) return;
    try { await usersAdminApi.deactivate(userId); pushToast('تم تعطيل الحساب', 'success'); await load(); }
    catch (error: any) { pushToast(error.message || 'تعذر تعطيل الحساب', 'error'); }
  };
  const assign = async (userId: string, roleCode: string) => {
    try { await usersAdminApi.assignRole(userId, roleCode); pushToast('تم تحديث الدور', 'success'); await load(); }
    catch (error: any) { pushToast(error.message || 'تعذر إسناد الدور', 'error'); }
  };

  return <Layout title="إدارة المستخدمين">
    <div className="grid xl:grid-cols-[minmax(0,1fr)_22rem] gap-5" dir="rtl">
      <section className="bg-white rounded-xl2 shadow-card p-5">
        <h2 className="font-bold text-ink-800 mb-4">حسابات العيادة</h2>
        {loading ? <p className="text-sm text-ink-500">جارِ التحميل…</p> : <div className="space-y-3">
          {rows.map((user) => <article key={user.id} className="border border-ink-100 rounded-lg p-3 flex flex-wrap items-center gap-3">
            <UserRound className="text-brand-600" size={19} />
            <div className="min-w-44 flex-1"><p className="font-semibold text-ink-800">{user.displayName}</p><p className="text-xs text-ink-500" dir="ltr">{user.email}</p></div>
            <span className={`text-xs ${user.active ? 'text-emerald-700' : 'text-red-600'}`}>{user.active ? 'نشط' : 'معطل'}</span>
            <div className="flex flex-wrap gap-1">{user.roles.map((role: string) => <span key={role} className="text-xs bg-ink-50 px-2 py-1 rounded">{roles.find(([code]) => code === role)?.[1] ?? role}</span>)}</div>
            {canAssignRoles && user.active && <select aria-label={`تعيين دور لـ ${user.displayName}`} defaultValue="" onChange={(event) => { if (event.target.value) void assign(user.id, event.target.value); }} className="border border-ink-200 rounded px-2 py-1 text-xs"><option value="">إضافة دور</option>{roles.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>}
            {user.active && user.id !== currentUser?.id && <button onClick={() => void deactivate(user.id)} className="text-red-600 p-1" aria-label="تعطيل الحساب"><UserX size={17} /></button>}
          </article>)}
          {!rows.length && <p className="text-sm text-ink-500">لا يوجد مستخدمون.</p>}
        </div>}
      </section>
      <section className="bg-white rounded-xl2 shadow-card p-5 h-fit">
        <h2 className="font-bold text-ink-800 mb-4 flex items-center gap-2"><Plus size={18} />حساب جديد</h2>
        <form onSubmit={submit} className="space-y-3">
          <Field label="الاسم" value={form.displayName} set={(displayName) => setForm({ ...form, displayName })} />
          <Field label="البريد الإلكتروني" type="email" value={form.email} set={(email) => setForm({ ...form, email })} />
          <Field label="كلمة المرور (12 حرفًا على الأقل)" type="password" value={form.password} set={(password) => setForm({ ...form, password })} />
          {canAssignRoles && <label className="block text-sm text-ink-600">الدور<select value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })} className="block w-full mt-1 border border-ink-200 rounded-lg px-3 py-2">{roles.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>}
          {!canAssignRoles && <p className="text-xs text-ink-500 flex gap-2"><ShieldCheck size={16} />يمكن لمدير الصلاحيات إسناد الدور بعد إنشاء الحساب.</p>}
          <button disabled={saving} className="w-full bg-brand-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? 'جارِ الحفظ…' : 'إنشاء الحساب'}</button>
        </form>
      </section>
    </div>
  </Layout>;
}

function Field({ label, value, set, type = 'text' }: { label: string; value: string; set: (value: string) => void; type?: string }) {
  return <label className="block text-sm text-ink-600">{label}<input required type={type} minLength={type === 'password' ? 12 : undefined} value={value} onChange={(event) => set(event.target.value)} className="block w-full mt-1 border border-ink-200 rounded-lg px-3 py-2" /></label>;
}
