import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Edit, Plus, Stethoscope, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { SpecialtyDoctorGrid, SpecialtyGrid } from '../components/DoctorSelection';
import { useApp } from '../context/AppContext';
import { usersApi } from '../lib/api';

type ScheduleEntry = { id?: string; dayOfWeek: number; startTime: string; endTime: string };
type Doctor = { id: string; fullName: string; email: string; specialty: string | null; phone: string | null; clinicAddress: string | null; logoUrl: string | null; isActive: boolean; weeklySchedule: ScheduleEntry[]; isAvailableToday: boolean };
const weekDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function Doctors() {
  const { pushToast } = useApp();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [scheduleDoctor, setScheduleDoctor] = useState<Doctor | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [specialty, setSpecialty] = useState(''); const [phone, setPhone] = useState(''); const [clinicAddress, setClinicAddress] = useState('');

  const loadDoctors = async () => { setLoading(true); try { setDoctors(await usersApi.listAllDoctors()); } catch (err: any) { pushToast(err.message || 'تعذّر تحميل قائمة الدكاترة', 'error'); } finally { setLoading(false); } };
  useEffect(() => { loadDoctors(); }, []);
  const resetForm = () => { setEditingDoctor(null); setFullName(''); setEmail(''); setPassword(''); setSpecialty(''); setPhone(''); setClinicAddress(''); setError(''); };
  const openEdit = (doctor?: Doctor) => { if (doctor) { setEditingDoctor(doctor); setFullName(doctor.fullName); setEmail(doctor.email); setSpecialty(doctor.specialty || ''); setPhone(doctor.phone || ''); setClinicAddress(doctor.clinicAddress || ''); setPassword(''); setError(''); } else resetForm(); setModalOpen(true); };
  const saveDoctor = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!fullName.trim() || !specialty.trim()) return setError('الاسم والتخصص مطلوبان');
    if (!editingDoctor && (!email.trim() || password.length < 6)) return setError('البريد الإلكتروني وكلمة المرور (٦ أحرف على الأقل) مطلوبان');
    if (!/^01[0-9]{9}$/.test(phone.trim())) return setError('رقم الهاتف غير صحيح (11 رقمًا)');
    setSubmitting(true);
    try { const data = { fullName: fullName.trim(), specialty: specialty.trim(), phone: phone.trim(), clinicAddress: clinicAddress.trim() || undefined }; if (editingDoctor) await usersApi.updateDoctor(editingDoctor.id, data); else await usersApi.createDoctor({ ...data, email: email.trim().toLowerCase(), password }); pushToast(editingDoctor ? 'تم تحديث بيانات الدكتور' : 'تم إضافة الدكتور', 'success'); setModalOpen(false); resetForm(); await loadDoctors(); } catch (err: any) { setError(err.message || 'تعذّر حفظ البيانات'); } finally { setSubmitting(false); }
  };
  const toggleActive = async (doctor: Doctor) => { try { await usersApi.updateDoctor(doctor.id, { isActive: !doctor.isActive }); pushToast(`${doctor.isActive ? 'تم إلغاء تفعيل' : 'تم تفعيل'} الدكتور`, 'success'); await loadDoctors(); } catch (err: any) { pushToast(err.message || 'تعذّر تحديث الحالة', 'error'); } };
  const openSchedule = (doctor: Doctor) => { setScheduleDoctor(doctor); setScheduleEntries(doctor.weeklySchedule.map((entry) => ({ ...entry }))); setScheduleOpen(true); };
  const saveSchedule = async () => {
    if (!scheduleDoctor) return;
    if (scheduleEntries.some((entry) => !entry.startTime || !entry.endTime || entry.startTime >= entry.endTime)) return pushToast('يرجى إدخال فترة صحيحة لكل يوم', 'error');
    setSavingSchedule(true); try { await usersApi.replaceDoctorSchedule(scheduleDoctor.id, scheduleEntries); pushToast('تم حفظ جدول العمل الأسبوعي', 'success'); setScheduleOpen(false); await loadDoctors(); } catch (err: any) { pushToast(err.message || 'تعذّر حفظ جدول العمل', 'error'); } finally { setSavingSchedule(false); }
  };

  return <Layout title="الأطباء">
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5"><div><h2 className="text-lg font-bold text-ink-800">الأطباء</h2><p className="text-sm text-ink-400 mt-0.5">{selectedSpecialty ? `أطباء ${selectedSpecialty}` : 'اختر التخصص لعرض الأطباء'}</p></div><button onClick={() => openEdit()} className="sm:mr-auto inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5"><Plus size={16} />إضافة دكتور</button></div>
    {loading ? <p className="text-sm text-ink-400 text-center py-12">جارِ التحميل...</p> : doctors.length === 0 ? <div className="bg-white rounded-xl2 shadow-card p-12 text-center"><Stethoscope size={48} className="mx-auto text-ink-300 mb-4" /><p className="text-ink-500">لا يوجد دكاترة مسجلين</p></div> : !selectedSpecialty ? <SpecialtyGrid doctors={doctors} onSelect={setSelectedSpecialty} /> : <SpecialtyDoctorGrid specialty={selectedSpecialty} doctors={doctors} mode="manage" onBack={() => setSelectedSpecialty('')} onSelect={(doctor) => openEdit(doctor as Doctor)} renderActions={(doctor) => <div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => openEdit(doctor as Doctor)} className="inline-flex items-center justify-center gap-1 text-xs font-medium text-brand-600 border border-brand-200 hover:bg-brand-50 rounded-lg px-2 py-2"><Edit size={13} />تعديل</button><button type="button" onClick={() => openSchedule(doctor as Doctor)} className="inline-flex items-center justify-center gap-1 text-xs font-medium text-ink-600 border border-ink-200 hover:bg-ink-50 rounded-lg px-2 py-2"><CalendarClock size={13} />الجدول</button><button type="button" onClick={() => toggleActive(doctor as Doctor)} className="text-xs font-medium rounded-lg px-2 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100">{doctor.isActive ? 'إلغاء التفعيل' : 'تفعيل'}</button></div>} />}
    <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={editingDoctor ? 'تعديل دكتور' : 'إضافة دكتور جديد'}><form onSubmit={saveDoctor} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4"><Input label="الاسم بالكامل *" value={fullName} setValue={setFullName} /><Input label="التخصص *" value={specialty} setValue={setSpecialty} />{!editingDoctor && <Input label="البريد الإلكتروني *" value={email} setValue={setEmail} type="email" />}<Input label="كلمة المرور *" value={password} setValue={setPassword} type="password" disabled={!!editingDoctor} /><Input label="رقم الهاتف *" value={phone} setValue={setPhone} dir="ltr" /><Input label="عنوان العيادة" value={clinicAddress} setValue={setClinicAddress} /></div>{error && <p className="text-xs text-red-600">{error}</p>}<div className="flex gap-3 pt-2"><button type="submit" disabled={submitting} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-70">{submitting ? 'جارِ الحفظ...' : 'حفظ'}</button><button type="button" onClick={() => { setModalOpen(false); resetForm(); }} className="flex-1 border border-ink-200 text-ink-600 rounded-lg py-2.5 text-sm">إلغاء</button></div></form></Modal>
    <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title={`جدول العمل — ${scheduleDoctor?.fullName || ''}`}><div className="space-y-3"><p className="text-sm text-ink-500">أضف أيام وفترات العمل المتكررة.</p>{scheduleEntries.map((entry, index) => <div key={`${entry.id || 'new'}-${index}`} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"><div><label className="block text-xs text-ink-500 mb-1">اليوم</label><select value={entry.dayOfWeek} onChange={(event) => setScheduleEntries((items) => items.map((item, i) => i === index ? { ...item, dayOfWeek: Number(event.target.value) } : item))} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-2 py-2 text-sm">{weekDays.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></div><div><label className="block text-xs text-ink-500 mb-1">من</label><input type="time" value={entry.startTime} onChange={(event) => setScheduleEntries((items) => items.map((item, i) => i === index ? { ...item, startTime: event.target.value } : item))} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-2 py-2 text-sm" /></div><div><label className="block text-xs text-ink-500 mb-1">إلى</label><input type="time" value={entry.endTime} onChange={(event) => setScheduleEntries((items) => items.map((item, i) => i === index ? { ...item, endTime: event.target.value } : item))} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-2 py-2 text-sm" /></div><button type="button" onClick={() => setScheduleEntries((items) => items.filter((_, i) => i !== index))} className="p-2.5 text-red-600 hover:bg-red-50 rounded-lg" aria-label="حذف الفترة"><Trash2 size={17} /></button></div>)}<button type="button" onClick={() => setScheduleEntries((items) => [...items, { dayOfWeek: 6, startTime: '16:00', endTime: '21:00' }])} className="text-sm text-brand-600 font-semibold">+ إضافة يوم/فترة عمل</button><div className="flex gap-3 pt-3"><button type="button" onClick={saveSchedule} disabled={savingSchedule} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-70">{savingSchedule ? 'جارِ الحفظ...' : 'حفظ الجدول'}</button><button type="button" onClick={() => setScheduleOpen(false)} className="flex-1 border border-ink-200 text-ink-600 rounded-lg py-2.5 text-sm">إلغاء</button></div></div></Modal>
  </Layout>;
}

function Input({ label, value, setValue, type = 'text', dir, disabled = false }: { label: string; value: string; setValue: (value: string) => void; type?: string; dir?: string; disabled?: boolean }) {
  return <div><label className="block text-sm font-medium text-ink-600 mb-1.5">{label}</label><input type={type} value={value} onChange={(event) => setValue(event.target.value)} dir={dir} disabled={disabled} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm disabled:opacity-60" /></div>;
}
