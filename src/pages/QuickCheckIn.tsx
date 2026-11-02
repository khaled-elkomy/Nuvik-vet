import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, AlertCircle, UserCheck, X } from 'lucide-react';
import Layout from '../components/Layout';
import CheckInBillingFields from '../components/CheckInBillingFields';
import { useApp } from '../context/AppContext';
import { financeApi, patientsApi, queueApi, usersApi } from '../lib/api';
import { SpecialtyDoctorGrid, SpecialtyGrid } from '../components/DoctorSelection';
import { ageFromBirthDate } from '../lib/age';

type Step = 'search' | 'select-patient' | 'select-specialty' | 'select-doctor';
type PatientMatch = { id: string; fullName: string; fileNumber: string; phone: string; age: number; gender?: string; assignedDoctors?: string[] };

export default function QuickCheckIn() {
  const { pushToast, refreshPatients } = useApp();
  const navigate = useNavigate();

  const [doctors, setDoctors] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingServices, setLoadingServices] = useState(true);

  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PatientMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientMatch | null>(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    usersApi.listDoctors()
      .then(setDoctors)
      .catch((err) => pushToast(err.message || 'تعذّر تحميل قائمة الدكاترة', 'error'))
      .finally(() => setLoadingDoctors(false));
  }, []);
  useEffect(() => {
    financeApi.services()
      .then((rows) => setServices(rows.filter((service) => service.isActive !== false)))
      .catch((err) => pushToast(err.message || 'تعذّر تحميل الخدمات القابلة للفوترة', 'error'))
      .finally(() => setLoadingServices(false));
  }, [pushToast]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    try {
      const results = await patientsApi.list(q);
      const mapped: PatientMatch[] = results.map((p: any) => ({
        id: p.id,
        fullName: p.fullName,
        fileNumber: p.fileNumber,
        phone: p.phone,
        age: ageFromBirthDate(p.birthDate),
        gender: p.gender,
        assignedDoctors: p.assignedDoctors,
      }));
      setSearchResults(mapped);
      if (mapped.length === 1) {
        setSelectedPatient(mapped[0]);
        setStep('select-specialty');
      } else if (mapped.length > 1) {
        setStep('select-patient');
      } else {
        // 0 matches - patient doesn't exist, redirect to AddPatient
        setError('المريض غير موجود. يرجى إنشاء مريض جديد أولاً.');
        setTimeout(() => navigate('/patients/new'), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'تعذّر البحث');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectPatient = (patient: PatientMatch) => {
    setSelectedPatient(patient);
    setStep('select-specialty');
  };

  const handleBackToSearch = () => {
    setStep('search');
    setSelectedPatient(null);
    setSelectedSpecialty('');
    setSelectedDoctorId('');
    setSelectedSpecialty('');
  };

  const handleBackToPatientSelection = () => {
    setStep(searchResults.length > 1 ? 'select-patient' : 'search');
    setSelectedDoctorId('');
    setSelectedSpecialty('');
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedDoctorId) {
      setError('اختر الدكتور المستهدف من الشبكة تحت');
      return;
    }

    if (!selectedPatient) {
      setError('لم يتم اختيار مريض');
      return;
    }

    if (!serviceId) {
      setError('اختر الخدمة المؤكدة');
      return;
    }
    if (paymentAmount === '' || Number(paymentAmount) < 0) {
      setError('أدخل مبلغًا مدفوعًا صحيحًا، ويمكن أن يكون صفرًا');
      return;
    }

    const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
    if (!selectedDoctor?.isAvailableToday) {
      setError('لا يمكن تسجيل الحضور: الدكتور غير متاح اليوم حسب جدول عمله');
      return;
    }

    setSubmitting(true);
    try {
      await queueApi.checkIn(selectedPatient.id, selectedDoctorId, undefined, {
        serviceId,
        paymentAmount,
        paymentMethod: Number(paymentAmount) > 0 ? paymentMethod : undefined,
      });
      const doctor = doctors.find((d) => d.id === selectedDoctorId);
      pushToast(`تم تسجيل حضور ${selectedPatient.fullName} لـ ${doctor?.fullName}`, 'success');
      resetForm();
      refreshPatients();
      navigate('/queue');
    } catch (err: any) {
      setError(err.message || 'تعذّر إتمام العملية');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPatient(null);
    setSelectedDoctorId('');
    setServiceId('');
    setPaymentAmount('0');
    setPaymentMethod('cash');
    setError('');
    setStep('search');
  };

  return (
    <Layout title="تسجيل حضور مريض">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink-800">تسجيل حضور مريض موجود</h2>
        <p className="text-sm text-ink-400 mt-0.5">
          {step === 'search' && 'ابحث عن المريض بالاسم أو رقم الملف أو رقم الهاتف'}
          {step === 'select-patient' && 'اختر المريض الصحيح من النتائج'}
          {step === 'select-specialty' && 'اختر التخصص أولاً'}
          {step === 'select-doctor' && 'اختر الطبيب المعالج'}
        </p>
      </div>

      <form onSubmit={handleCheckIn}>
        {/* Step 1: Search */}
        {step === 'search' && (
          <div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6 mb-5">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch(e as any)}
                  placeholder="ابحث بالاسم أو رقم الملف أو رقم الهاتف..."
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-10 pl-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <button type="button" onClick={handleSearch} disabled={searching} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg px-6 py-3 disabled:opacity-70 shrink-0">
                {searching ? 'جارِ البحث...' : 'بحث'}
              </button>
            </div>
            <p className="text-xs text-ink-400 mt-3">إذا كان المريض جديدًا، اذهب إلى <a href="/patients/new" className="text-brand-600 hover:underline">إضافة مريض</a></p>
          </div>
        )}

        {/* Step 2: Multiple matches - Select Patient */}
        {step === 'select-patient' && (
          <div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-ink-800">نتائج البحث ({searchResults.length})</h3>
              <button type="button" onClick={handleBackToSearch} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700">
                <ArrowLeft size={16} /> بحث جديد
              </button>
            </div>
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 mb-4">
              <AlertCircle size={14} className="inline -mt-0.5" /> تم العثور على عدة مرضى مطابقين. يرجى اختيار المريض الصحيح يدويًا.
            </p>
            <div className="space-y-3">
              {searchResults.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleSelectPatient(p)}
                  className="w-full text-right p-4 border border-ink-100 rounded-lg hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-ink-800">{p.fullName}</p>
                      <p className="text-xs text-ink-400 mt-0.5">{p.fileNumber} · {p.age} سنة{p.gender ? ` · ${p.gender}` : ''} · {p.phone}</p>
                      {p.assignedDoctors && p.assignedDoctors.length > 0 && (
                        <p className="text-xs text-brand-600 mt-0.5 flex items-center gap-1">
                          <UserCheck size={11} /> طبيب معين: {p.assignedDoctors.join('، ')}
                        </p>
                      )}
                    </div>
                    <UserCheck size={20} className="text-brand-500 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Specialty first */}
        {step === 'select-specialty' && (
          <div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-ink-800">اختيار التخصص</h3>
              <button type="button" onClick={handleBackToPatientSelection} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700">
                <ArrowLeft size={16} /> تغيير المريض
              </button>
            </div>

            {selectedPatient && (
              <div className="bg-ink-50 rounded-lg p-3 mb-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-ink-800">{selectedPatient.fullName}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{selectedPatient.fileNumber} · {selectedPatient.age} سنة · {selectedPatient.phone}</p>
                </div>
                <X size={20} className="text-ink-400 cursor-pointer hover:text-red-500" onClick={() => { setSelectedPatient(null); handleBackToPatientSelection(); }} />
              </div>
            )}

            {loadingDoctors ? <p className="text-sm text-ink-400 text-center py-8">جارِ التحميل...</p> : doctors.length === 0 ? <p className="text-sm text-ink-400 text-center py-8">لا يوجد دكاترة مسجّلين في النظام بعد</p> : <SpecialtyGrid doctors={doctors} onSelect={(specialty) => { setSelectedSpecialty(specialty); setStep('select-doctor'); }} />}
          </div>
        )}

        {step === 'select-doctor' && <div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6 mb-5"><SpecialtyDoctorGrid specialty={selectedSpecialty} doctors={doctors} mode="checkin" selectedDoctorId={selectedDoctorId} onBack={() => { setSelectedDoctorId(''); setStep('select-specialty'); }} onSelect={(doctor) => setSelectedDoctorId(doctor.id)} /></div>}

        {step === 'select-doctor' && selectedDoctorId && <CheckInBillingFields services={services} loading={loadingServices} serviceId={serviceId} onServiceIdChange={setServiceId} paymentAmount={paymentAmount} onPaymentAmountChange={setPaymentAmount} paymentMethod={paymentMethod} onPaymentMethodChange={setPaymentMethod} disabled={submitting} />}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">{error}</p>}

        {step === 'select-doctor' && selectedDoctorId && (
          <button
            type="submit"
            disabled={submitting || loadingServices}
            className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg px-8 py-3.5 text-base disabled:opacity-70"
          >
            {submitting ? 'جارِ التسجيل...' : 'تأكيد الحضور وإنشاء الفاتورة'}
          </button>
        )}
      </form>
    </Layout>
  );
}
