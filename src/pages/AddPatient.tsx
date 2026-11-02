import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, UserPlus, CheckCircle2, AlertCircle, Search, Phone, Mail, MapPin,
  Droplet, AlertTriangle, HeartPulse, StickyNote, Users, CalendarPlus, ClipboardList
} from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useApp } from '../context/AppContext';
import { patientsApi } from '../lib/api';
import type { Gender } from '../types';

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const genders: Gender[] = ['ذكر', 'أنثى'];

type DuplicateMatch = {
  id: string;
  fileNumber: string;
  fullName: string;
  birthDate: string;
  gender: string;
  phone: string;
  email: string | null;
  matchScore: number;
  matchReasons: string[];
};

export default function AddPatient() {
  const { pushToast, addPatient, refreshPatients } = useApp();
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    birthDate: '',
    gender: '' as Gender,
    phone: '',
    email: '',
    address: '',
    bloodType: '',
    allergies: '' as string,
    chronicDiseases: '' as string,
    emergencyContactName: '',
    emergencyContactPhone: '',
    notes: '',
  });

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string | undefined>>({});

  const validateForm = () => {
    const errors: Record<string, string | undefined> = {};
    if (!formData.fullName.trim()) errors.fullName = 'الاسم مطلوب';
    if (!formData.birthDate) errors.birthDate = 'تاريخ الميلاد مطلوب';
    if (!formData.gender) errors.gender = 'النوع مطلوب';
    if (!formData.phone.trim()) errors.phone = 'رقم الهاتف مطلوب';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'بريد إلكتروني غير صحيح';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name as keyof typeof formErrors]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleAllergiesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const values = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, allergies: values.join(', ') }));
  };

  const handleChronicDiseasesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const values = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, chronicDiseases: values.join(', ') }));
  };

  const checkDuplicates = async () => {
    setCheckingDuplicate(true);
    try {
      const result = await patientsApi.checkDuplicate({
        fullName: formData.fullName.trim(),
        birthDate: formData.birthDate,
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
      });
      const strongMatches = result.matches || [];
      if (strongMatches.length === 0) {
        // No likely duplicates - create patient directly
        createPatient();
      } else {
        // Likely duplicates found - show modal for user to decide
        setDuplicateMatches(strongMatches);
        setDuplicateModalOpen(true);
      }
    } catch (err: any) {
      pushToast(err.message || 'تعذّر التحقق من التكرارات', 'error');
      // If duplicate check fails, proceed with creation anyway
      createPatient();
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const createPatient = async () => {
    setSubmitting(true);
    try {
      const payload = {
        fullName: formData.fullName.trim(),
        birthDate: formData.birthDate,
        gender: formData.gender,
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        address: formData.address.trim() || undefined,
        bloodType: formData.bloodType || undefined,
        allergies: formData.allergies ? formData.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        chronicDiseases: formData.chronicDiseases ? formData.chronicDiseases.split(',').map(s => s.trim()).filter(Boolean) : [],
        emergencyContactName: formData.emergencyContactName.trim() || undefined,
        emergencyContactPhone: formData.emergencyContactPhone.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      };

      const created = await addPatient(payload);
      setCreatedPatientId(created.id);
      setSuccessModalOpen(true);
      pushToast('تم إنشاء المريض بنجاح', 'success');
      // Refresh patients to ensure dashboard and other pages have latest data
      await refreshPatients();
    } catch (err: any) {
      pushToast(err.message || 'تعذّر إنشاء المريض', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    checkDuplicates();
  };

  const handleCreateAnyway = () => {
    setDuplicateModalOpen(false);
    createPatient();
  };

  const handleUseExisting = (patientId: string) => {
    setDuplicateModalOpen(false);
    navigate(`/patients/${patientId}`);
  };

  const handleDone = () => {
    setSuccessModalOpen(false);
    setCreatedPatientId(null);
    navigate('/patients');
  };

  const handleCheckInNow = () => {
    if (!createdPatientId) return;
    setSuccessModalOpen(false);
    navigate(`/patients/${createdPatientId}/checkin`);
  };

  const handleBookAppointment = () => {
    if (!createdPatientId) return;
    setSuccessModalOpen(false);
    navigate(`/patients/${createdPatientId}/appointment`);
  };

  const handleBack = () => {
    navigate('/patients');
  };

  const today = new Date().toLocaleDateString('en-CA');

  return (
    <Layout title="إضافة مريض جديد">
      <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 mb-4">
        <ArrowLeft size={16} />
        العودة لقائمة المرضى
      </button>

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl2 shadow-card p-5 sm:p-6 mb-5">
          {/* Section: Basic Information */}
          <div className="mb-6">
            <h3 className="font-bold text-ink-800 mb-4 flex items-center gap-2">
              <UserPlus size={18} className="text-brand-600" /> البيانات الأساسية
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-sm font-medium text-ink-600 mb-1.5">الاسم الكامل *</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                  placeholder="مثال: أحمد محمد علي"
                  autoComplete="name"
                />
                {formErrors.fullName && <p className="text-xs text-red-600 mt-1">{formErrors.fullName}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-1.5">تاريخ الميلاد *</label>
                <input
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleChange}
                  max={today}
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                />
                {formErrors.birthDate && <p className="text-xs text-red-600 mt-1">{formErrors.birthDate}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-1.5">النوع *</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                >
                  <option value="">اختر النوع</option>
                  {genders.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {formErrors.gender && <p className="text-xs text-red-600 mt-1">{formErrors.gender}</p>}
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-sm font-medium text-ink-600 mb-1.5">رقم الهاتف *</label>
                <div className="relative">
                  <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    dir="ltr"
                    className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                    placeholder="01XXXXXXXXX"
                    autoComplete="tel"
                  />
                </div>
                {formErrors.phone && <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>}
              </div>
            </div>
          </div>

          {/* Section: Contact Information */}
          <div className="mb-6 pt-6 border-t border-ink-100">
            <h3 className="font-bold text-ink-800 mb-4 flex items-center gap-2">
              <Mail size={18} className="text-brand-600" /> معلومات الاتصال
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-sm font-medium text-ink-600 mb-1.5">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    dir="ltr"
                    className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                    placeholder="example@domain.com"
                    autoComplete="email"
                  />
                </div>
                {formErrors.email && <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>}
              </div>
              <div className="lg:col-span-3">
                <label className="block text-sm font-medium text-ink-600 mb-1.5">العنوان</label>
                <div className="relative">
                  <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                    placeholder="مثال: مدينة نصر، القاهرة"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Medical Information */}
          <div className="mb-6 pt-6 border-t border-ink-100">
            <h3 className="font-bold text-ink-800 mb-4 flex items-center gap-2">
              <Droplet size={18} className="text-brand-600" /> المعلومات الطبية
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-1.5">فصيلة الدم</label>
                <select
                  name="bloodType"
                  value={formData.bloodType}
                  onChange={handleChange}
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                >
                  <option value="">اختر فصيلة الدم</option>
                  {bloodTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-ink-600 mb-1.5">الحساسية <span className="text-xs text-ink-400">(افصل بفاصلة)</span></label>
                <div className="relative">
                  <AlertTriangle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    name="allergies"
                    value={formData.allergies}
                    onChange={handleAllergiesChange}
                    className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                    placeholder="مثال: البنسلين، الغبار، المكسرات"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-ink-600 mb-1.5">الأمراض المزمنة <span className="text-xs text-ink-400">(افصل بفاصلة)</span></label>
                <div className="relative">
                  <HeartPulse size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    name="chronicDiseases"
                    value={formData.chronicDiseases}
                    onChange={handleChronicDiseasesChange}
                    className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                    placeholder="مثال: السكري، ضغط الدم، الربو"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Emergency Contact */}
          <div className="mb-6 pt-6 border-t border-ink-100">
            <h3 className="font-bold text-ink-800 mb-4 flex items-center gap-2">
              <Phone size={18} className="text-brand-600" /> جهة اتصال للطوارئ
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-1.5">اسم جهة الاتصال</label>
                <input
                  type="text"
                  name="emergencyContactName"
                  value={formData.emergencyContactName}
                  onChange={handleChange}
                  className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                  placeholder="مثال: منى علي"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-1.5">رقم هاتف جهة الاتصال</label>
                <div className="relative">
                  <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="tel"
                    name="emergencyContactPhone"
                    value={formData.emergencyContactPhone}
                    onChange={handleChange}
                    dir="ltr"
                    className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                    placeholder="01XXXXXXXXX"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Notes */}
          <div className="mb-6 pt-6 border-t border-ink-100">
            <h3 className="font-bold text-ink-800 mb-4 flex items-center gap-2">
              <StickyNote size={18} className="text-brand-600" /> ملاحظات إضافية
            </h3>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
              placeholder="أي ملاحظات مهمة حول المريض..."
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-ink-100">
            <button
              type="submit"
              disabled={submitting || checkingDuplicate}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 disabled:hover:bg-brand-300 text-white font-bold rounded-lg px-8 py-3 text-base transition-colors"
            >
              {submitting || checkingDuplicate ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  {checkingDuplicate ? 'جارِ التحقق من التكرارات...' : 'جارِ الحفظ...'}
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  حفظ المريض
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting || checkingDuplicate}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg px-8 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              إلغاء
            </button>
          </div>
        </div>
      </form>

      {/* Duplicate Detection Modal */}
      <Modal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        title="تم العثور على مرضى محتملين مكررين"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            تم العثور على <strong>{duplicateMatches.length}</strong> مريض/ة يتطابق/ون مع البيانات المدخلة.
            هل تريد استخدام أحد المرضى الحاليين أم إنشاء مريض جديد؟
          </p>

          <div className="max-h-80 overflow-y-auto space-y-3">
            {duplicateMatches.map(match => (
              <div
                key={match.id}
                className="border border-ink-200 rounded-lg p-4 hover:bg-ink-50/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: '#146C5E' }}
                    >
                      {match.fullName.split(' ')[0][0]}
                    </div>
                    <div>
                      <p className="font-semibold text-ink-800">{match.fullName}</p>
                      <p className="text-xs text-ink-500 flex items-center gap-1">
                        <span>{match.fileNumber}</span>
                        <span>·</span>
                        <span>{match.birthDate}</span>
                        <span>·</span>
                        <span>{match.gender}</span>
                        <span>·</span>
                        <span dir="ltr">{match.phone}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUseExisting(match.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors shrink-0"
                  >
                    <UserPlus size={12} /> استخدام هذا المريض
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {match.matchReasons.map((reason, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full"
                    >
                      <AlertCircle size={10} /> {reason}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ink-100 text-ink-500 rounded-full">
                    درجة التطابق: {match.matchScore}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-ink-100">
            <button
              type="button"
              onClick={handleCreateAnyway}
              className="flex-1 inline-flex items-center justify-center gap-2 border-2 border-dashed border-ink-200 rounded-lg py-3 text-brand-600 hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
            >
              <UserPlus size={16} />
              <span dir="rtl">إنشاء مريض جديد على أي حال</span>
            </button>
            <button
              type="button"
              onClick={() => setDuplicateModalOpen(false)}
              className="flex-1 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg py-3 text-base"
            >
              إلغاء
            </button>
          </div>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        open={successModalOpen}
        onClose={handleDone}
        title="تم إنشاء المريض بنجاح"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center">
            <CheckCircle2 size={32} className="text-brand-600" />
          </div>
          <div>
            <p className="font-semibold text-ink-800 text-lg">تم إنشاء ملف المريض بنجاح</p>
            <p className="text-sm text-ink-500 mt-1">ماذا تريد أن تفعل بعد ذلك؟</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={handleDone}
              className="col-span-3 flex flex-col items-center gap-2 p-4 border border-ink-200 rounded-lg hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
            >
              <Search size={20} className="text-brand-600" />
              <span className="font-medium text-ink-700">العودة لقائمة المرضى</span>
              <span className="text-xs text-ink-400">عرض أو بحث عن مرضى آخرين</span>
            </button>
            <button
              type="button"
              onClick={handleCheckInNow}
              className="flex flex-col items-center gap-2 p-4 border border-ink-200 rounded-lg hover:border-amber-300 hover:bg-amber-50/30 transition-colors"
            >
              <ClipboardList size={20} className="text-amber-600" />
              <span className="font-medium text-ink-700">تسجيل حضور</span>
              <span className="text-xs text-ink-400">إضافة لقائمة الانتظار</span>
            </button>
            <button
              type="button"
              onClick={handleBookAppointment}
              className="flex flex-col items-center gap-2 p-4 border border-ink-200 rounded-lg hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
            >
              <CalendarPlus size={20} className="text-brand-600" />
              <span className="font-medium text-ink-700">حجز موعد</span>
              <span className="text-xs text-ink-400">جدولة موعد قادم</span>
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
