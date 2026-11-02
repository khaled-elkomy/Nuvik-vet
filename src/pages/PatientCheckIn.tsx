import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import CheckInBillingFields from '../components/CheckInBillingFields';
import { SpecialtyDoctorGrid, SpecialtyGrid } from '../components/DoctorSelection';
import { useApp } from '../context/AppContext';
import { financeApi, patientsApi, queueApi, usersApi } from '../lib/api';
import { ageFromBirthDate } from '../lib/age';

type PatientMatch = { id: string; fullName: string; fileNumber: string; phone: string; age: number; gender?: string };

export default function PatientCheckIn() {
  const { id } = useParams();
  const { pushToast, refreshPatients } = useApp();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [patient, setPatient] = useState<PatientMatch | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { usersApi.listDoctors().then(setDoctors).catch((err) => pushToast(err.message || 'تعذّر تحميل قائمة الدكاترة', 'error')).finally(() => setLoadingDoctors(false)); }, [pushToast]);
  useEffect(() => { financeApi.services().then((rows) => setServices(rows.filter((service) => service.isActive !== false))).catch((err) => pushToast(err.message || 'تعذّر تحميل الخدمات القابلة للفوترة', 'error')).finally(() => setLoadingServices(false)); }, [pushToast]);
  useEffect(() => { if (!id) return; patientsApi.get(id).then((item: any) => setPatient({ id: item.id, fullName: item.fullName, fileNumber: item.fileNumber, phone: item.phone, age: ageFromBirthDate(item.birthDate), gender: item.gender })).catch((err) => pushToast(err.message || 'تعذّر تحميل بيانات المريض', 'error')).finally(() => setLoadingPatient(false)); }, [id, pushToast]);

  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!selectedDoctorId || !patient) return setError('اختر الطبيب المتاح');
    if (!serviceId) return setError('اختر الخدمة المؤكدة');
    if (paymentAmount === '' || Number(paymentAmount) < 0) return setError('أدخل مبلغًا مدفوعًا صحيحًا، ويمكن أن يكون صفرًا');
    if (!selectedDoctor?.isAvailableToday) return setError('لا يمكن تسجيل الحضور: الدكتور غير متاح اليوم حسب جدول عمله');
    setSubmitting(true);
    try {
      await queueApi.checkIn(patient.id, selectedDoctorId, undefined, { serviceId, paymentAmount, paymentMethod: Number(paymentAmount) > 0 ? paymentMethod : undefined });
      pushToast('تم تسجيل الحضور وإنشاء الفاتورة', 'success'); await refreshPatients(); navigate('/queue');
    } catch (err: any) { setError(err.message || 'تعذّر تسجيل الحضور'); } finally { setSubmitting(false); }
  };

  if (loadingPatient) return <Layout title="تسجيل حضور"><p className="text-sm text-ink-400 text-center py-12">جارِ التحميل...</p></Layout>;
  if (!patient) return <Layout title="تسجيل حضور"><div className="bg-white rounded-xl2 shadow-card p-10 text-center"><p className="text-ink-600 font-medium">لم يتم العثور على هذا المريض</p><button onClick={() => navigate('/patients')} className="mt-4 text-brand-600 font-medium text-sm">العودة لقائمة المرضى</button></div></Layout>;
  return <Layout title="تسجيل حضور"><button onClick={() => navigate('/patients')} className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 mb-4"><ArrowLeft size={16} />العودة لقائمة المرضى</button><form onSubmit={handleSubmit}><div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6"><div className="bg-ink-50 rounded-lg p-4 mb-5"><p className="font-semibold text-ink-800">{patient.fullName}</p><p className="text-xs text-ink-500 mt-0.5">{patient.fileNumber} · {patient.age} سنة · {patient.phone}</p></div>{!selectedSpecialty ? <div><h3 className="font-bold text-ink-800 mb-4">اختيار التخصص</h3>{loadingDoctors ? <p className="text-sm text-ink-400 text-center py-8">جارِ التحميل...</p> : <SpecialtyGrid doctors={doctors} onSelect={setSelectedSpecialty} />}</div> : <SpecialtyDoctorGrid specialty={selectedSpecialty} doctors={doctors} mode="checkin" selectedDoctorId={selectedDoctorId} onBack={() => { setSelectedSpecialty(''); setSelectedDoctorId(''); }} onSelect={(doctor) => setSelectedDoctorId(doctor.id)} />}{selectedDoctorId && <CheckInBillingFields services={services} loading={loadingServices} serviceId={serviceId} onServiceIdChange={setServiceId} paymentAmount={paymentAmount} onPaymentAmountChange={setPaymentAmount} paymentMethod={paymentMethod} onPaymentMethodChange={setPaymentMethod} disabled={submitting} />}{error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mt-4">{error}</p>}{selectedDoctorId && <div className="flex gap-3 pt-5"><button type="submit" disabled={submitting || loadingServices} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-bold rounded-lg px-8 py-3.5 text-base">{submitting ? 'جارِ التسجيل...' : 'تأكيد الحضور وإنشاء الفاتورة'}</button><button type="button" onClick={() => navigate('/patients')} className="flex-1 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg px-8 py-3.5 text-base">إلغاء</button></div>}</div></form></Layout>;
}
