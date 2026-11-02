import { useEffect, useState } from 'react';
import { Building2, UserPlus2, Image as ImageIcon, Users } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { usersApi, UPLOADS_BASE_URL } from '../lib/api';
import type { UserRole } from '../types';

type SettingsTab = 'profile' | 'accounts';

export default function Settings() {
  const { currentUser, pushToast } = useApp();
  const isDoctor = currentUser?.role === 'doctor';
  const [tab, setTab] = useState<SettingsTab>('profile');

  // ===== ملف الطبيب (اسم، تخصص، عنوان العيادة، هاتف، شعار) =====
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    usersApi.me().then((u) => {
      setProfile(u);
      setFullName(u.fullName || '');
      setSpecialty(u.specialty || '');
      setClinicAddress(u.clinicAddress || '');
      setPhone(u.phone || '');
    }).catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await usersApi.updateMe({ fullName, specialty, clinicAddress, phone });
      setProfile(updated);
      pushToast('تم حفظ بيانات الملف الشخصي بنجاح', 'success');
    } catch (err: any) {
      pushToast(err.message || 'تعذّر حفظ البيانات', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const updated = await usersApi.uploadLogo(file);
      setProfile(updated);
      pushToast('تم رفع شعار العيادة بنجاح', 'success');
    } catch (err: any) {
      pushToast(err.message || 'تعذّر رفع الشعار', 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  return (
    <Layout title="الإعدادات">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink-800">إعدادات الحساب</h2>
        <p className="text-sm text-ink-400 mt-0.5">إدارة بيانات العيادة والحسابات</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <nav className="bg-white rounded-xl2 shadow-card p-2 h-fit">
          <button
            onClick={() => setTab('profile')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-right ${
              tab === 'profile' ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'
            }`}
          >
            <Building2 size={17} /> ملف الطبيب والعيادة
          </button>
          {isDoctor && (
            <button
              onClick={() => setTab('accounts')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-right ${
                tab === 'accounts' ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'
              }`}
            >
              <Users size={17} /> إدارة الحسابات
            </button>
          )}
        </nav>

        {tab === 'profile' && (
          <div className="lg:col-span-2 space-y-4">
            {isDoctor && (
              <div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6">
                <h3 className="font-bold text-ink-800 mb-4 text-sm">شعار العيادة</h3>
                <p className="text-xs text-ink-400 mb-3">بيظهر في هيدر صفحة الروشتة تلقائيًا</p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-ink-50 border border-ink-100 flex items-center justify-center overflow-hidden shrink-0">
                    {profile?.logoUrl ? (
                      <img src={`${UPLOADS_BASE_URL}${profile.logoUrl}`} alt="الشعار" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-ink-300" />
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg px-4 py-2.5 text-sm cursor-pointer">
                    {uploadingLogo ? 'جارِ الرفع...' : 'تغيير الشعار'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
                  </label>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="bg-white rounded-xl2 shadow-card p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-1.5">الاسم</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
              </div>
              {isDoctor && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-ink-600 mb-1.5">التخصص</label>
                    <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-600 mb-1.5">عنوان العيادة</label>
                    <textarea value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)} rows={2} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" placeholder="بيظهر في هيدر الروشتة" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-1.5">رقم الهاتف</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
              </div>
              <div className="pt-3 border-t border-ink-100">
                <button type="submit" disabled={savingProfile} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm disabled:opacity-70">
                  {savingProfile ? 'جارِ الحفظ...' : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'accounts' && isDoctor && <AccountsPanel />}
      </div>
    </Layout>
  );
}

/** إدارة الحسابات — إضافة حساب ريسبشن أو دكتور جديد، وعرض الحسابات الحالية */
function AccountsPanel() {
  const { pushToast } = useApp();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('reception');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const loadAccounts = () => {
    setLoading(true);
    usersApi.list().then(setAccounts).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(loadAccounts, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setFormError('الاسم والبريد الإلكتروني وكلمة المرور مطلوبون');
      return;
    }
    if (newPassword.length < 6) {
      setFormError('كلمة المرور لازم تكون ٦ أحرف على الأقل');
      return;
    }
    setCreating(true);
    try {
      await usersApi.register({
        fullName: newName.trim(), email: newEmail.trim(), password: newPassword,
        role: newRole, specialty: newRole === 'doctor' ? newSpecialty.trim() || undefined : undefined,
      });
      pushToast(`تم إنشاء حساب ${newName} بنجاح`, 'success');
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewSpecialty('');
      loadAccounts();
    } catch (err: any) {
      setFormError(err.message || 'تعذّر إنشاء الحساب');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="lg:col-span-2 space-y-4">
      <form onSubmit={handleCreate} className="bg-white rounded-xl2 shadow-card p-5 sm:p-6">
        <h3 className="font-bold text-ink-800 flex items-center gap-2 mb-4 text-sm">
          <UserPlus2 size={16} className="text-brand-600" /> إضافة حساب جديد
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink-600 mb-1.5">نوع الحساب</label>
            <div className="flex gap-2">
              {(['reception', 'doctor'] as UserRole[]).map((r) => (
                <button
                  type="button" key={r} onClick={() => setNewRole(r)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    newRole === r ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-100 text-ink-600'
                  }`}
                >
                  {r === 'reception' ? 'ريسبشن' : 'دكتور'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الاسم بالكامل</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          {newRole === 'doctor' && (
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1.5">التخصص</label>
              <input value={newSpecialty} onChange={(e) => setNewSpecialty(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">البريد الإلكتروني</label>
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} dir="ltr" className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">كلمة المرور</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
        </div>
        {formError && <p className="text-xs text-red-600 mt-3">{formError}</p>}
        <button type="submit" disabled={creating} className="mt-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm disabled:opacity-70">
          {creating ? 'جارِ الإنشاء...' : 'إنشاء الحساب'}
        </button>
      </form>

      <div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6">
        <h3 className="font-bold text-ink-800 mb-4 text-sm">الحسابات الحالية</h3>
        {loading ? (
          <p className="text-sm text-ink-400">جارِ التحميل...</p>
        ) : (
          <div className="divide-y divide-ink-50">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink-800">{a.fullName}</p>
                  <p className="text-xs text-ink-400" dir="ltr">{a.email}</p>
                </div>
                <span className="text-xs bg-ink-50 text-ink-500 rounded-full px-2.5 py-1">
                  {a.role === 'doctor' ? (a.specialty || 'دكتور') : 'ريسبشن'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
