import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import { appointmentSlotsForDate, SpecialtyDoctorGrid, SpecialtyGrid } from '../components/DoctorSelection';
import { useApp } from '../context/AppContext';
import { appointmentsApi, patientsApi, usersApi } from '../lib/api';
import { formatTime12 } from '../lib/timeFormat';
import { ageFromBirthDate } from '../lib/age';

type PatientMatch = { id: string; fullName: string; fileNumber: string; phone: string; age: number; gender?: string };
const appointmentTypes = ['كشف', 'متابعة', 'كشف دوري', 'استشارة'];

export default function PatientAppointment() {
  const { id } = useParams();
  const { pushToast, refreshPatients, refreshAppointments } = useApp();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [patient, setPatient] = useState<PatientMatch | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [time, setTime] = useState('');
  const [type, setType] = useState(appointmentTypes[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { usersApi.listDoctors().then(setDoctors).catch((err) => pushToast(err.message || 'تعذّر تحميل قائمة الدكاترة', 'error')).finally(() => setLoadingDoctors(false)); }, []);
  useEffect(() => { if (!id) return; patientsApi.get(id).then((item: any) => setPatient({ id: item.id, fullName: item.fullName, fileNumber: item.fileNumber, phone: item.phone, age: ageFromBirthDate(item.birthDate), gender: item.gender })).catch((err) => pushToast(err.message || 'تعذّر تحميل بيانات المريض', 'error')).finally(() => setLoadingPatient(false)); }, [id]);

  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const slots = useMemo(() => appointmentSlotsForDate(selectedDoctor, date), [selectedDoctor, date]);
  const today = new Date().toLocaleDateString('en-CA');
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!selectedDoctorId || !time) return setError('اختر التخصص والطبيب والوقت المتاح');
    if (!patient) return;
    setSubmitting(true);
    try { await appointmentsApi.create({ patientId: patient.id, doctorId: selectedDoctorId, date, time, type, notes: notes.trim() || undefined }); pushToast('تم حجز الموعد بنجاح', 'success'); await Promise.all([refreshPatients(), refreshAppointments()]); navigate(`/appointments?date=${date}`); } catch (err: any) { setError(err.message || 'تعذّر حجز الموعد'); } finally { setSubmitting(false); }
  };

  if (loadingPatient) return <Layout title="حجز موعد"><p className="text-sm text-ink-400 text-center py-12">جارِ التحميل...</p></Layout>;
  if (!patient) return <Layout title="حجز موعد"><div className="bg-white rounded-xl2 shadow-card p-10 text-center"><p className="text-ink-600 font-medium">لم يتم العثور على هذا المريض</p><button onClick={() => navigate('/patients')} className="mt-4 text-brand-600 font-medium text-sm">العودة لقائمة المرضى</button></div></Layout>;
  return <Layout title="حجز موعد"><button onClick={() => navigate('/patients')} className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 mb-4"><ArrowLeft size={16} />العودة لقائمة المرضى</button><form onSubmit={handleSubmit}><div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6"><div className="bg-ink-50 rounded-lg p-4 mb-5"><p className="font-semibold text-ink-800">{patient.fullName}</p><p className="text-xs text-ink-500 mt-0.5">{patient.fileNumber} · {patient.age} سنة · {patient.phone}</p></div>{!selectedSpecialty ? <div><h3 className="font-bold text-ink-800 mb-4">اختيار التخصص</h3>{loadingDoctors ? <p className="text-sm text-ink-400 text-center py-8">جارِ التحميل...</p> : <SpecialtyGrid doctors={doctors} onSelect={setSelectedSpecialty} />}</div> : !selectedDoctorId ? <SpecialtyDoctorGrid specialty={selectedSpecialty} doctors={doctors} mode="appointment" onBack={() => setSelectedSpecialty('')} onSelect={(doctor) => { setSelectedDoctorId(doctor.id); setTime(''); }} /> : <div className="space-y-4"><div className="flex items-center justify-between rounded-lg bg-clinical-50 border border-clinical-100 px-3 py-2"><p className="text-sm font-semibold text-ink-700">{selectedSpecialty} ← {selectedDoctor?.fullName}</p><button type="button" onClick={() => { setSelectedDoctorId(''); setTime(''); }} className="text-xs text-brand-700 font-semibold">تغيير الطبيب</button></div><div><label className="block text-sm font-medium text-ink-600 mb-1.5">التاريخ *</label><input type="date" value={date} min={today} onChange={(event) => { setDate(event.target.value); setTime(''); }} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-3 text-base" /></div><div><label className="block text-sm font-medium text-ink-600 mb-1.5">الوقت المتاح *</label>{slots.length ? <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`rounded-lg border px-2 py-2 text-sm ${time === slot ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-ink-200 text-ink-600 hover:border-brand-300'}`} dir="ltr">{formatTime12(slot)}</button>)}</div> : <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">لا توجد فترة عمل مسجلة في هذا التاريخ.</p>}</div><div><label className="block text-sm font-medium text-ink-600 mb-1.5">نوع الموعد</label><select value={type} onChange={(event) => setType(event.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-3 text-base">{appointmentTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><div><label className="block text-sm font-medium text-ink-600 mb-1.5">ملاحظات</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" /></div></div>}{error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mt-4">{error}</p>}{selectedDoctorId && <div className="flex gap-3 pt-5"><button type="submit" disabled={submitting || !time} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-bold rounded-lg px-8 py-3.5 text-base">{submitting ? 'جارِ الحجز...' : 'حجز الموعد'}</button><button type="button" onClick={() => navigate('/patients')} className="flex-1 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg px-8 py-3.5 text-base">إلغاء</button></div>}</div></form></Layout>;
}
