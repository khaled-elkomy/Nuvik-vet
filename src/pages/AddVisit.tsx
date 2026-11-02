import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { visitsApi } from '../lib/api';

const visitTypes = ['كشف أولي', 'متابعة', 'كشف طارئ', 'كشف دوري'];

export default function AddVisit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getPatient, pushToast } = useApp();
  const patient = id ? getPatient(id) : undefined;

  const [date, setDate] = useState('2026-09-17');
  const [type, setType] = useState(visitTypes[1]);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [temperature, setTemperature] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [medications, setMedications] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!patient) {
    return (
      <Layout title="إضافة زيارة">
        <div className="bg-white rounded-xl2 shadow-card p-10 text-center">
          <p className="text-ink-600 font-medium">لم يتم العثور على هذا المريض</p>
        </div>
      </Layout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagnosis.trim()) {
      setError('يرجى إدخال التشخيص قبل حفظ الزيارة');
      return;
    }
    setError('');
    setSaving(true);
    try {
      // ملحوظة: اسم الدكتور بيتحدد تلقائيًا من جلسة الدخول في السيرفر، مش من الواجهة
      await visitsApi.create({
        patientId: patient.id,
        date,
        type,
        chiefComplaint: chiefComplaint.trim() || undefined,
        symptoms: symptoms.trim() || undefined,
        diagnosis: diagnosis.trim(),
        notes: notes.trim() || undefined,
        vitals: { bloodPressure, heartRate, temperature, weight, height },
        medications: medications.trim() || undefined,
        followUpDate: followUpDate || undefined,
      });
      pushToast('تم حفظ الزيارة وتحديث ملف المريض بنجاح', 'success');
      navigate(`/patients/${patient.id}`);
    } catch (err: any) {
      setError(err.message || 'تعذّر حفظ الزيارة، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400';

  return (
    <Layout title="إضافة زيارة">
      <button onClick={() => navigate(`/patients/${patient.id}`)} className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 mb-4">
        <ArrowRight size={16} />
        العودة لملف المريض
      </button>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl2 shadow-card p-5 sm:p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-ink-100">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: patient.avatarColor }}>
            {patient.fullName.split(' ')[0][0]}
          </div>
          <div>
            <h2 className="font-bold text-ink-800">تسجيل زيارة لـ {patient.fullName}</h2>
            <p className="text-xs text-ink-400">{patient.fileNumber} · {patient.age} سنة</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">تاريخ الزيارة</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">نوع الزيارة</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              {visitTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الشكوى الرئيسية</label>
            <input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className={inputClass} placeholder="مثال: صداع مستمر منذ يومين" />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الأعراض</label>
            <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={2} className={inputClass} />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink-600 mb-1.5">التشخيص *</label>
            <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={inputClass} placeholder="التشخيص الطبي" />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-ink-50/60 rounded-lg p-3.5">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">ضغط الدم</label>
              <input value={bloodPressure} onChange={(e) => setBloodPressure(e.target.value)} className="w-full bg-white border border-ink-100 rounded-md px-2.5 py-2 text-sm" placeholder="120/80" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">النبض</label>
              <input value={heartRate} onChange={(e) => setHeartRate(e.target.value)} className="w-full bg-white border border-ink-100 rounded-md px-2.5 py-2 text-sm" placeholder="72" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">الحرارة</label>
              <input value={temperature} onChange={(e) => setTemperature(e.target.value)} className="w-full bg-white border border-ink-100 rounded-md px-2.5 py-2 text-sm" placeholder="36.8" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">الوزن (كجم)</label>
              <input value={weight} onChange={(e) => setWeight(e.target.value)} className="w-full bg-white border border-ink-100 rounded-md px-2.5 py-2 text-sm" placeholder="75" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">الطول (سم)</label>
              <input value={height} onChange={(e) => setHeight(e.target.value)} className="w-full bg-white border border-ink-100 rounded-md px-2.5 py-2 text-sm" placeholder="175" />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الأدوية الموصوفة</label>
            <input value={medications} onChange={(e) => setMedications(e.target.value)} className={inputClass} placeholder="اسم الدواء والجرعة" />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">موعد المتابعة</label>
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={inputClass} />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-5 border-t border-ink-100">
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-70">
            {saving ? 'جارِ الحفظ...' : 'حفظ الزيارة'}
          </button>
          <button type="button" onClick={() => navigate(`/patients/${patient.id}`)} className="border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors">
            إلغاء
          </button>
        </div>
      </form>
    </Layout>
  );
}
