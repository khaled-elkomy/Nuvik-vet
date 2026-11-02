import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Phone, Mail, MapPin, Droplet, AlertTriangle, HeartPulse, StickyNote,
  Plus, FileText, Paperclip, Printer, FlaskConical, Scan, ClipboardList, Calendar,
  Upload, Image as ImageIcon, Users, UserPlus, TestTube2, Scissors, CalendarPlus,
} from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { useApp } from '../context/AppContext';
import Modal from '../components/Modal';
import { visitsApi, prescriptionsApi, attachmentsApi, prescriptionImagesApi, queueApi, medicalRecordsApi, appointmentsApi, patientsApi } from '../lib/api';
import AttachmentThumb from '../components/AttachmentThumb';
import { formatTime12 } from '../lib/timeFormat';
import { ageFromBirthDate } from '../lib/age';

type Tab = 'overview' | 'medical' | 'history' | 'prescriptions' | 'investigations' | 'followups' | 'attachments';

const allTabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'medical', label: 'التاريخ المرضي' },
  { key: 'history', label: 'سجل الزيارات' },
  { key: 'prescriptions', label: 'الروشتات' },
  { key: 'investigations', label: 'الفحوصات' },
  { key: 'followups', label: 'المتابعات' },
  { key: 'attachments', label: 'المرفقات' },
];

// Reception only sees overview; doctors see all clinical tabs
const getTabsForRole = (role?: string) => {
  if (role === 'reception') {
    return allTabs.filter((t) => t.key === 'overview');
  }
  return allTabs;
};

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

const attachmentIcon: Record<string, typeof FlaskConical> = { 'تحليل دم': FlaskConical, 'أشعة': Scan, 'تقرير طبي': ClipboardList };
const attachmentTypes = ['تحليل دم', 'أشعة', 'تقرير طبي'] as const;

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getPatient, currentUser, pushToast } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const [viewingRx, setViewingRx] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [visits, setVisits] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [prescriptionImages, setPrescriptionImages] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [medicalHistory, setMedicalHistory] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [investigationTypes, setInvestigationTypes] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [operationOpen, setOperationOpen] = useState(false);
  const [investigationOpen, setInvestigationOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [historyDraft, setHistoryDraft] = useState({ title: '', description: '', knownDate: '' });
  const [operationDraft, setOperationDraft] = useState({ operationName: '', description: '', surgeonName: '', operationDate: '', facility: '', notes: '' });
  const [investigationDraft, setInvestigationDraft] = useState({ investigationTypeId: '', notes: '' });
  const [followUpDraft, setFollowUpDraft] = useState({ date: '', time: '', notes: '' });
  const [loadingRecords, setLoadingRecords] = useState(true);

  // رفع مرفق جديد
  const [file, setFile] = useState<File | null>(null);
  const [attachmentType, setAttachmentType] = useState<typeof attachmentTypes[number]>('تحليل دم');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentInvestigationId, setAttachmentInvestigationId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const cachedPatient = id ? getPatient(id) : undefined;
  const [loadedPatient, setLoadedPatient] = useState<any>(null);
  const patient = loadedPatient || cachedPatient;
  const isDoctor = currentUser?.role === 'doctor';
  const isReception = currentUser?.role === 'reception';
  const [hasActiveExamination, setHasActiveExamination] = useState(false);
  const [checkingExamination, setCheckingExamination] = useState(true);

  useEffect(() => {
    if (!id || !isDoctor) return;
    let active = true;
    patientsApi.get(id).then((row) => {
      if (!active) return;
      setLoadedPatient({ ...row, age: ageFromBirthDate(row.birthDate), avatarColor: '#146C5E' });
    }).catch((err) => pushToast(err.message || 'تعذّر تحميل بيانات المريض', 'error'));
    return () => { active = false; };
  }, [id, isDoctor, pushToast]);

  // Check for active examination when patient loads
  useEffect(() => {
    if (!id || !isDoctor) {
      setCheckingExamination(false);
      return;
    }
    let active = true;
    setCheckingExamination(true);
    queueApi.hasActiveExamination(id)
      .then(({ hasActive }) => { if (active) setHasActiveExamination(hasActive); })
      .catch(() => { if (active) setHasActiveExamination(false); })
      .finally(() => { if (active) setCheckingExamination(false); });
    return () => { active = false; };
  }, [id, isDoctor]);

  // Only fetch clinical data for doctors, not reception
  useEffect(() => {
    if (!id || isReception) {
      if (isReception) setLoadingRecords(false);
      return;
    }
    let active = true;
    setLoadingRecords(true);
    Promise.all([
      visitsApi.listByPatient(id).catch(() => []),
      prescriptionsApi.listByPatient(id).catch(() => []),
      attachmentsApi.listByPatient(id).catch(() => []),
      prescriptionImagesApi.listByPatient(id).catch(() => []),
      medicalRecordsApi.listHistory(id).catch(() => []),
      medicalRecordsApi.listOperations(id).catch(() => []),
      medicalRecordsApi.listInvestigations(id).catch(() => []),
      medicalRecordsApi.listInvestigationTypes().catch(() => []),
      appointmentsApi.list().then((rows) => rows.filter((a) => a.patientId === id && a.isFollowUp)).catch(() => []),
    ]).then(([v, rx, att, rxImg, historyRows, operationRows, investigationRows, typeRows, followUpRows]) => {
      if (!active) return;
      setVisits(v);
      setPrescriptions(rx);
      setAttachments(att);
      setPrescriptionImages(rxImg);
      setMedicalHistory(historyRows); setOperations(operationRows); setInvestigations(investigationRows); setInvestigationTypes(typeRows);
      setFollowUps(followUpRows);
    }).finally(() => { if (active) setLoadingRecords(false); });
    return () => { active = false; };
  }, [id, isReception]);

  if (!patient) {
    return (
      <Layout title="ملف المريض">
        <div className="bg-white rounded-xl2 shadow-card p-10 text-center">
          <p className="text-ink-600 font-medium">لم يتم العثور على هذا المريض</p>
          <button onClick={() => navigate('/patients')} className="mt-4 text-brand-600 font-medium text-sm">
            العودة لقائمة المرضى
          </button>
        </div>
      </Layout>
    );
  }

  const activeRx = prescriptions.find((r) => r.id === viewingRx);
  const activeRxInvestigations = activeRx ? investigations.filter((item) => item.queue_entry_id === activeRx.queueEntryId) : [];

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setUploadError('اختر ملفًا أولًا'); return; }
    setUploadError('');
    setUploading(true);
    try {
      const created = await attachmentsApi.upload(patient.id, file, attachmentType, attachmentName.trim() || file.name, attachmentInvestigationId || undefined);
      setAttachments((prev) => [created, ...prev]);
      pushToast('تم رفع المرفق بنجاح', 'success');
      setUploadOpen(false);
      setFile(null);
      setAttachmentName('');
      setAttachmentInvestigationId('');
    } catch (err: any) {
      setUploadError(err.message || 'تعذّر رفع الملف');
    } finally {
      setUploading(false);
    }
  };

  const saveHistory = async (e: React.FormEvent) => {
    e.preventDefault(); if (!id) return;
    try { const created = await medicalRecordsApi.createHistory({ patientId: id, ...historyDraft }); setMedicalHistory((p) => [created, ...p]); setHistoryDraft({ title: '', description: '', knownDate: '' }); setHistoryOpen(false); pushToast('تمت إضافة التاريخ المرضي', 'success'); } catch (err: any) { pushToast(err.message, 'error'); }
  };
  const saveOperation = async (e: React.FormEvent) => {
    e.preventDefault(); if (!id) return;
    try { const created = await medicalRecordsApi.createOperation({ patientId: id, ...operationDraft }); setOperations((p) => [created, ...p]); setOperationDraft({ operationName: '', description: '', surgeonName: '', operationDate: '', facility: '', notes: '' }); setOperationOpen(false); pushToast('تمت إضافة العملية السابقة', 'success'); } catch (err: any) { pushToast(err.message, 'error'); }
  };
  const saveInvestigation = async (e: React.FormEvent) => {
    e.preventDefault(); if (!id) return;
    try { const created = await medicalRecordsApi.createInvestigation({ patientId: id, ...investigationDraft }); const type = investigationTypes.find((t) => t.id === investigationDraft.investigationTypeId); setInvestigations((p) => [{ ...created, investigation_name: type?.name, category: type?.category, doctor_name: currentUser?.fullName }, ...p]); setInvestigationDraft({ investigationTypeId: '', notes: '' }); setInvestigationOpen(false); pushToast('تم طلب الفحص', 'success'); } catch (err: any) { pushToast(err.message, 'error'); }
  };
  const saveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault(); if (!id) return;
    try { const created = await appointmentsApi.create({ patientId: id, date: followUpDraft.date, time: followUpDraft.time, type: 'متابعة', notes: followUpDraft.notes, isFollowUp: true }); setFollowUps((p) => [created, ...p]); setFollowUpDraft({ date: '', time: '', notes: '' }); setFollowUpOpen(false); pushToast('تم حجز موعد المتابعة', 'success'); } catch (err: any) { pushToast(err.message, 'error'); }
  };
  const editHistory = async (item: any) => {
    const title = window.prompt('عنوان السجل التاريخي', item.title); if (title === null) return;
    const description = window.prompt('وصف السجل التاريخي', item.description); if (description === null) return;
    try { const updated = await medicalRecordsApi.updateHistory(item.id, { title, description, knownDate: item.known_date }); setMedicalHistory((p) => p.map((r) => r.id === item.id ? { ...r, ...updated } : r)); } catch (err: any) { pushToast(err.message, 'error'); }
  };
  const deleteHistory = async (item: any) => {
    if (!window.confirm('حذف السجل التاريخي؟')) return;
    try { await medicalRecordsApi.deleteHistory(item.id); setMedicalHistory((p) => p.filter((r) => r.id !== item.id)); } catch (err: any) { pushToast(err.message, 'error'); }
  };
  const editOperation = async (item: any) => {
    const operationName = window.prompt('اسم العملية', item.operation_name); if (operationName === null) return;
    const description = window.prompt('وصف العملية', item.description || ''); if (description === null) return;
    try { const updated = await medicalRecordsApi.updateOperation(item.id, { operationName, description, surgeonName: item.surgeon_name, operationDate: item.operation_date, facility: item.facility, notes: item.notes }); setOperations((p) => p.map((r) => r.id === item.id ? { ...r, ...updated } : r)); } catch (err: any) { pushToast(err.message, 'error'); }
  };
  const deleteOperation = async (item: any) => {
    if (!window.confirm('حذف العملية السابقة؟')) return;
    try { await medicalRecordsApi.deleteOperation(item.id); setOperations((p) => p.filter((r) => r.id !== item.id)); } catch (err: any) { pushToast(err.message, 'error'); }
  };

  return (
    <Layout title="ملف المريض">
      <button onClick={() => navigate('/patients')} className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 mb-4">
        <ArrowRight size={16} />
        العودة لقائمة المرضى
      </button>

      <div className="clinic-card p-5 sm:p-6 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
            style={{ backgroundColor: patient.avatarColor }}
          >
            {patient.fullName.split(' ')[0][0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink-800">{patient.fullName}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500 mt-1.5">
              <span>{patient.fileNumber}</span>
              <span>{patient.age} سنة{patient.gender ? ` · ${patient.gender}` : ''}</span>
              <span dir="ltr" className="inline-flex items-center gap-1"><Phone size={13} />{patient.phone}</span>
            </div>
          </div>
          {/* كتابة روشتة: للدكاترة فقط، وتظهر فقط عند وجود فحص نشط (مريض في الانتظار أو جاري الكشف) */}
          {isDoctor && hasActiveExamination && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => navigate(`/patients/${patient.id}/prescriptions/new`)}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors"
              >
                <FileText size={16} />
                كتابة روشتة
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-ink-100 mb-5 overflow-x-auto">
        {getTabsForRole(currentUser?.role).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-400 hover:text-ink-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl2 shadow-card p-5">
            <h3 className="font-bold text-ink-800 mb-4">البيانات الأساسية</h3>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-ink-400 flex items-center gap-1.5 mb-1"><Calendar size={14} />تاريخ الميلاد</dt>
                <dd className="text-ink-700 font-medium">{formatDate(patient.birthDate)}</dd>
              </div>
              <div>
                <dt className="text-ink-400 flex items-center gap-1.5 mb-1"><Droplet size={14} />فصيلة الدم</dt>
                <dd className="text-ink-700 font-medium">{patient.bloodType || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400 flex items-center gap-1.5 mb-1"><Mail size={14} />البريد الإلكتروني</dt>
                <dd className="text-ink-700 font-medium truncate" dir="ltr">{patient.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400 flex items-center gap-1.5 mb-1"><MapPin size={14} />العنوان</dt>
                <dd className="text-ink-700 font-medium">{patient.address || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400 flex items-center gap-1.5 mb-1"><Phone size={14} />جهة اتصال الطوارئ</dt>
                <dd className="text-ink-700 font-medium">
                  {patient.emergencyContactName ? `${patient.emergencyContactName} — ${patient.emergencyContactPhone}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400 flex items-center gap-1.5 mb-1">تاريخ التسجيل</dt>
                <dd className="text-ink-700 font-medium">{formatDate(patient.createdAt)}</dd>
              </div>
            </dl>

            {patient.notes && (
              <div className="mt-5 pt-5 border-t border-ink-100">
                <h4 className="text-ink-400 flex items-center gap-1.5 text-sm mb-1.5"><StickyNote size={14} />ملاحظات مهمة</h4>
                <p className="text-sm text-ink-700 bg-ink-50 rounded-lg p-3 leading-relaxed">{patient.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl2 shadow-card p-5">
              <h4 className="font-bold text-ink-800 flex items-center gap-1.5 mb-3 text-sm">
                <AlertTriangle size={15} className="text-amber-500" /> الحساسية
              </h4>
              {patient.allergies && patient.allergies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patient.allergies.map((a: string) => (
                    <span key={a} className="text-xs bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100 rounded-md px-2 py-1">{a}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-400">لا توجد حساسية مسجلة</p>
              )}
            </div>

            <div className="bg-white rounded-xl2 shadow-card p-5">
              <h4 className="font-bold text-ink-800 flex items-center gap-1.5 mb-3 text-sm">
                <HeartPulse size={15} className="text-red-500" /> الأمراض المزمنة
              </h4>
              {patient.chronicDiseases && patient.chronicDiseases.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patient.chronicDiseases.map((d: string) => (
                    <span key={d} className="text-xs bg-red-50 text-red-600 ring-1 ring-inset ring-red-100 rounded-md px-2 py-1">{d}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-400">لا توجد أمراض مزمنة مسجلة</p>
              )}
            </div>

            {isDoctor && (
              <div className="bg-white rounded-xl2 shadow-card p-5">
                <h4 className="font-bold text-ink-800 mb-3 text-sm">الأدوية الحالية</h4>
                {visits[0]?.medications ? (
                  <p className="text-sm text-ink-700">{visits[0].medications}</p>
                ) : (
                  <p className="text-sm text-ink-400">لا توجد أدوية مسجلة حاليًا</p>
                )}
              </div>
            )}

            {isReception && (
              <div className="bg-white rounded-xl2 shadow-card p-5">
                <h4 className="font-bold text-ink-800 mb-3 text-sm flex items-center gap-1.5">
                  <Users size={15} className="text-brand-600" /> الأطباء المعينون
                </h4>
                <div className="text-sm text-ink-600">
                  <p className="mb-2">هذا المريض غير معين لأي دكتور حاليًا.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <h3 className="font-bold text-ink-800 mb-4">سجل الزيارات</h3>
          {loadingRecords ? (
            <p className="text-sm text-ink-400 text-center py-12">جارِ التحميل...</p>
          ) : visits.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-ink-500 text-sm">لا توجد زيارات مسجلة لهذا المريض بعد</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute top-0 bottom-0 right-[15px] w-px bg-ink-100" />
              <div className="space-y-6">
                {visits.map((v) => (
                  <div key={v.id} className="relative pr-9">
                    <div className="absolute right-0 top-1 w-8 h-8 rounded-full bg-brand-50 ring-4 ring-white flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-brand-600" />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                      <p className="font-semibold text-ink-800 text-sm">{formatDate(v.date)}</p>
                      <span className="text-xs bg-ink-50 text-ink-500 rounded-full px-2 py-0.5">{v.type}</span>
                      <span className="text-xs text-ink-400">{v.doctor}</span>
                    </div>
                    <p className="text-sm font-medium text-ink-700">{v.diagnosis}</p>
                    {v.notes && <p className="text-sm text-ink-500 mt-1">{v.notes}</p>}
                    {v.vitals && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-400">
                        {v.vitals.bloodPressure && <span>ضغط الدم: {v.vitals.bloodPressure}</span>}
                        {v.vitals.heartRate && <span>النبض: {v.vitals.heartRate}</span>}
                        {v.vitals.temperature && <span>الحرارة: {v.vitals.temperature}°</span>}
                        {v.vitals.weight && <span>الوزن: {v.vitals.weight}كجم</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'medical' && (
        <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl2 shadow-card p-5">
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-ink-800">ملاحظات تاريخية</h3>{isDoctor && hasActiveExamination && <button onClick={() => setHistoryOpen(true)} className="text-brand-600 text-xs font-semibold inline-flex gap-1"><Plus size={14} />إضافة</button>}</div>
            {medicalHistory.length === 0 ? <p className="text-sm text-ink-400 py-5">لا توجد ملاحظات تاريخية</p> : <div className="space-y-3">{medicalHistory.map((item) => <div key={item.id} className="border border-ink-100 rounded-lg p-3"><div className="flex justify-between gap-2"><p className="font-semibold text-sm text-ink-800">{item.title}</p>{isDoctor && hasActiveExamination && <span className="flex gap-2 text-xs"><button onClick={() => editHistory(item)} className="text-brand-600">تعديل</button><button onClick={() => deleteHistory(item)} className="text-red-600">حذف</button></span>}</div><p className="text-sm text-ink-600 mt-1 whitespace-pre-wrap">{item.description}</p><p className="text-xs text-ink-400 mt-2">{formatDate(item.known_date)} · {item.doctor_name}</p></div>)}</div>}
          </div>
            <div className="bg-white rounded-xl2 shadow-card p-5">
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-ink-800 inline-flex items-center gap-2"><Scissors size={16} />عمليات سابقة</h3>{isDoctor && hasActiveExamination && <button onClick={() => setOperationOpen(true)} className="text-brand-600 text-xs font-semibold inline-flex gap-1"><Plus size={14} />إضافة</button>}</div>
            {operations.length === 0 ? <p className="text-sm text-ink-400 py-5">لا توجد عمليات مسجلة</p> : <div className="space-y-3">{operations.map((item) => <div key={item.id} className="border border-ink-100 rounded-lg p-3"><div className="flex justify-between gap-2"><p className="font-semibold text-sm text-ink-800">{item.operation_name}</p>{isDoctor && hasActiveExamination && <span className="flex gap-2 text-xs"><button onClick={() => editOperation(item)} className="text-brand-600">تعديل</button><button onClick={() => deleteOperation(item)} className="text-red-600">حذف</button></span>}</div>{item.description && <p className="text-sm text-ink-600 mt-1">{item.description}</p>}<p className="text-xs text-ink-400 mt-2">{formatDate(item.operation_date)} · {item.surgeon_name || '—'} · {item.facility || '—'}</p></div>)}</div>}
          </div>
        </div>
      )}

      {tab === 'investigations' && (
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-ink-800 inline-flex items-center gap-2"><TestTube2 size={17} />سجل الفحوصات</h3><p className="text-xs text-ink-600">يتم طلب الفحوصات أثناء الكشف النشط</p></div>
          {investigations.length === 0 ? <p className="text-sm text-ink-600 py-7">لا توجد فحوصات مطلوبة</p> : <div className="grid lg:grid-cols-2 gap-4">{(['laboratory', 'radiology'] as const).map((category) => { const rows = investigations.filter((item) => item.category === category); const isLaboratory = category === 'laboratory'; return <section key={category} className={`rounded-xl border p-4 ${isLaboratory ? 'border-sky-200 bg-sky-50/50' : 'border-violet-200 bg-violet-50/50'}`}><h4 className={`font-semibold text-sm mb-2 ${isLaboratory ? 'text-sky-950' : 'text-violet-950'}`}>{isLaboratory ? 'التحاليل المعملية' : 'الأشعة والتصوير'}</h4>{rows.length === 0 ? <p className="text-xs text-ink-600 py-4">لا توجد طلبات</p> : <div className="space-y-3">{rows.map((item) => { const results = attachments.filter((attachment) => attachment.investigationId === item.id); return <div key={item.id} className="border border-white/80 bg-white rounded-lg p-3"><p className="font-semibold text-ink-900">{item.investigation_name}</p><p className={`text-xs font-semibold mt-1 ${isLaboratory ? 'text-sky-800' : 'text-violet-800'}`}>{item.status === 'requested' ? 'مطلوب' : item.status}</p>{item.notes && <p className="text-sm text-ink-700 mt-2">{item.notes}</p>}<p className="text-xs text-ink-600 mt-2">طُلب في {formatDate(item.requested_at)} · {item.doctor_name}</p>{results.length > 0 && <p className="text-xs font-semibold text-emerald-800 mt-2">نتيجة/مرفق مرتبط: {results.map((result) => result.name).join('، ')}</p>}</div>; })}</div>}</section>; })}</div>}
        </div>
      )}

      {tab === 'followups' && (
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-ink-800 inline-flex items-center gap-2"><CalendarPlus size={17} />مواعيد المتابعة</h3><p className="text-xs text-ink-400">تُحجز أثناء إنهاء الروشتة</p></div>
          {followUps.length === 0 ? <p className="text-sm text-ink-400 py-7">لا توجد مواعيد متابعة</p> : <div className="space-y-3">{followUps.map((item) => <div key={item.id} className="border border-ink-100 rounded-lg p-3 flex justify-between"><div><p className="font-semibold text-ink-800">{formatDate(item.date)} · {formatTime12(item.time)}</p>{item.notes && <p className="text-sm text-ink-600 mt-1">{item.notes}</p>}</div><StatusBadge status={item.status} /></div>)}</div>}
        </div>
      )}

      {tab === 'prescriptions' && (
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <h3 className="font-bold text-ink-800 mb-4">الروشتات المكتوبة بالكيبورد</h3>
          {prescriptions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-ink-500 text-sm">لا توجد روشتات مسجلة لهذا المريض</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="border border-ink-100 rounded-lg p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-ink-800 text-sm"><span className="text-ink-500">التشخيص: </span>{rx.diagnosis}</p>
                      <p className="text-xs text-ink-400 mt-0.5">{formatDate(rx.date)}</p>
                    </div>
                    <button
                      onClick={() => setViewingRx(rx.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:bg-brand-50 rounded-md px-3 py-1.5"
                    >
                      <Printer size={13} /> عرض / طباعة
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-ink-600 mt-3 mb-1.5">الأدوية</p>
                  <div className="flex flex-wrap gap-2">
                    {rx.medications.map((m: any) => (
                      <span key={m.name} className="text-xs bg-ink-50 text-ink-600 rounded-md px-2.5 py-1">
                        <span className="font-semibold text-ink-800">{m.name}</span> · الجرعة: {m.dosage}{m.frequency ? ` · التكرار: ${m.frequency}` : ''}{m.duration ? ` · المدة: ${m.duration}` : ''}{m.instructions ? ` · التعليمات: ${m.instructions}` : ''}
                      </span>
                    ))}
                  </div>
                  {rx.instructions && <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2 mt-3 whitespace-pre-wrap"><span className="font-semibold">التحذيرات والتعليمات العامة: </span>{rx.instructions}</p>}
                  {investigations.filter((item) => item.queue_entry_id === rx.queueEntryId).length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-ink-600 mb-1.5">الفحوصات المطلوبة</p><div className="flex flex-wrap gap-2">{investigations.filter((item) => item.queue_entry_id === rx.queueEntryId).map((item) => <span key={item.id} className="text-xs bg-brand-50 text-brand-700 rounded-md px-2.5 py-1">{item.category === 'laboratory' ? 'تحليل' : 'أشعة'}: {item.investigation_name}</span>)}</div></div>}
                </div>
              ))}
            </div>
          )}

          <h3 className="font-bold text-ink-800 mt-6 mb-4 pt-5 border-t border-ink-100">الروشتات المكتوبة يدويًا</h3>
          {prescriptionImages.length === 0 ? (
            <p className="text-sm text-ink-400">لا توجد روشتات مرسومة لهذا المريض بعد</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {prescriptionImages.map((img) => (
                <PrescriptionImageCard key={img.id} image={img} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'attachments' && (
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink-800">المرفقات</h3>
            {(currentUser?.role === 'doctor' || currentUser?.role === 'reception') && (
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md px-3 py-2"
              >
                <Upload size={13} /> رفع مرفق
              </button>
            )}
          </div>
          {attachments.length === 0 ? (
            <div className="text-center py-12">
              <Paperclip size={22} className="mx-auto text-ink-300 mb-2" />
              <p className="text-ink-500 text-sm">لا توجد مرفقات لهذا المريض بعد</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map((a) => (
                <AttachmentThumb key={a.id} attachment={a} icon={attachmentIcon[a.type] || FileText} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* نافذة رفع مرفق — تحليل / أشعة / تقرير كصورة أو PDF حقيقي على السيرفر */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="رفع مرفق جديد">
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">نوع المرفق</label>
            <select
              value={attachmentType}
              onChange={(e) => setAttachmentType(e.target.value as typeof attachmentTypes[number])}
              className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm"
            >
              {attachmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">اسم المرفق</label>
            <input
              value={attachmentName}
              onChange={(e) => setAttachmentName(e.target.value)}
              className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm"
              placeholder="مثال: تحليل دهون شامل"
            />
          </div>
          {isDoctor && investigations.length > 0 && <div><label className="block text-sm font-medium text-ink-600 mb-1.5">ربط النتيجة بفحص (اختياري)</label><select value={attachmentInvestigationId} onChange={(e) => setAttachmentInvestigationId(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm"><option value="">مرفق طبي عام</option>{investigations.map((item) => <option key={item.id} value={item.id}>{item.investigation_name}</option>)}</select></div>}
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الملف (صورة أو PDF، حتى 15 ميجا)</label>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-ink-200 rounded-lg py-6 cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
              <ImageIcon size={22} className="text-ink-400" />
              <span className="text-sm text-ink-500">{file ? file.name : 'اضغط لاختيار الملف'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={uploading} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-70">
              {uploading ? 'جارِ الرفع...' : 'رفع الملف'}
            </button>
            <button type="button" onClick={() => setUploadOpen(false)} className="flex-1 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg py-2.5 text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="إضافة تاريخ مرضي">
        <form onSubmit={saveHistory} className="space-y-3">
          <input required value={historyDraft.title} onChange={(e) => setHistoryDraft({ ...historyDraft, title: e.target.value })} placeholder="العنوان / النوع" className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <textarea required value={historyDraft.description} onChange={(e) => setHistoryDraft({ ...historyDraft, description: e.target.value })} placeholder="وصف تاريخي للمريض" rows={4} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <input type="date" value={historyDraft.knownDate} onChange={(e) => setHistoryDraft({ ...historyDraft, knownDate: e.target.value })} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <button className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5 text-sm">حفظ</button>
        </form>
      </Modal>

      <Modal open={operationOpen} onClose={() => setOperationOpen(false)} title="إضافة عملية سابقة">
        <form onSubmit={saveOperation} className="space-y-3">
          <input required value={operationDraft.operationName} onChange={(e) => setOperationDraft({ ...operationDraft, operationName: e.target.value })} placeholder="اسم العملية" className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <textarea value={operationDraft.description} onChange={(e) => setOperationDraft({ ...operationDraft, description: e.target.value })} placeholder="وصف العملية" rows={2} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <input value={operationDraft.surgeonName} onChange={(e) => setOperationDraft({ ...operationDraft, surgeonName: e.target.value })} placeholder="اسم الطبيب/الجراح" className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <input type="date" value={operationDraft.operationDate} onChange={(e) => setOperationDraft({ ...operationDraft, operationDate: e.target.value })} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <input value={operationDraft.facility} onChange={(e) => setOperationDraft({ ...operationDraft, facility: e.target.value })} placeholder="المستشفى / المنشأة" className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <textarea value={operationDraft.notes} onChange={(e) => setOperationDraft({ ...operationDraft, notes: e.target.value })} placeholder="ملاحظات اختيارية" rows={2} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <button className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5 text-sm">حفظ العملية</button>
        </form>
      </Modal>

      <Modal open={investigationOpen} onClose={() => setInvestigationOpen(false)} title="طلب فحص">
        <form onSubmit={saveInvestigation} className="space-y-3">
          <select required value={investigationDraft.investigationTypeId} onChange={(e) => setInvestigationDraft({ ...investigationDraft, investigationTypeId: e.target.value })} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm"><option value="">اختر الفحص</option>{investigationTypes.map((item) => <option key={item.id} value={item.id}>{item.category === 'laboratory' ? 'معمل' : 'أشعة'} — {item.name}</option>)}</select>
          <textarea value={investigationDraft.notes} onChange={(e) => setInvestigationDraft({ ...investigationDraft, notes: e.target.value })} placeholder="تعليمات أو ملاحظات" rows={3} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <button className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5 text-sm">تأكيد الطلب</button>
        </form>
      </Modal>

      <Modal open={followUpOpen} onClose={() => setFollowUpOpen(false)} title="حجز موعد متابعة">
        <form onSubmit={saveFollowUp} className="space-y-3">
          <input required type="date" value={followUpDraft.date} onChange={(e) => setFollowUpDraft({ ...followUpDraft, date: e.target.value })} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <input required type="time" value={followUpDraft.time} onChange={(e) => setFollowUpDraft({ ...followUpDraft, time: e.target.value })} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <textarea value={followUpDraft.notes} onChange={(e) => setFollowUpDraft({ ...followUpDraft, notes: e.target.value })} placeholder="ملاحظات المتابعة" rows={3} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
          <button className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5 text-sm">حجز الموعد</button>
        </form>
      </Modal>

      <Modal open={!!activeRx} onClose={() => setViewingRx(null)} title="تفاصيل الروشتة">
        {activeRx && (
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-ink-100 mb-3">
              <div>
                <p className="font-semibold text-ink-800">{patient.fullName}</p>
                <p className="text-xs text-ink-400">{patient.fileNumber} · {formatDate(activeRx.date)}</p>
              </div>
              <FileText size={20} className="text-brand-600" />
            </div>
            <p className="text-sm font-medium text-ink-700 mb-3">التشخيص: {activeRx.diagnosis}</p>
            <p className="text-xs font-semibold text-ink-600 mb-2">الأدوية</p>
            <div className="space-y-2">
              {activeRx.medications.map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-ink-50 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium text-ink-700">{m.name}</span>
                  <span className="text-ink-500">الجرعة: {m.dosage}{m.frequency ? ` · التكرار: ${m.frequency}` : ''}{m.duration ? ` · المدة: ${m.duration}` : ''}{m.instructions ? ` · التعليمات: ${m.instructions}` : ''}</span>
                </div>
              ))}
            </div>
            {activeRx.instructions && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3 whitespace-pre-wrap"><span className="font-semibold">التحذيرات والتعليمات العامة: </span>{activeRx.instructions}</p>}
            {activeRxInvestigations.length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-ink-600 mb-2">الفحوصات المطلوبة</p><div className="flex flex-wrap gap-2">{activeRxInvestigations.map((item) => <span key={item.id} className="text-xs bg-brand-50 text-brand-700 rounded-md px-2.5 py-1">{item.category === 'laboratory' ? 'تحليل' : 'أشعة'}: {item.investigation_name}</span>)}</div></div>}
            <button
              onClick={() => window.print()}
              className="w-full mt-4 inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg py-2.5 text-sm"
            >
              <Printer size={16} /> طباعة الروشتة
            </button>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

/** بطاقة عرض لروشتة مرسومة (Canvas) — بتجيب الصورة كـ Blob محمي وتفتحها بالحجم الكامل عند الضغط */
function PrescriptionImageCard({ image }: { image: any }) {
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const sections = [
      ['الأدوية', image.medicationsUrl || image.url],
      ['التحذيرات والتعليمات', image.instructionsUrl],
      ['الفحوصات المطلوبة', image.investigationsUrl],
    ].filter(([, url]) => Boolean(url)) as [string, string][];
    const loaded: string[] = [];
    Promise.all(sections.map(async ([label, url]) => [label, await prescriptionImagesApi.fetchImageBlobUrl(url)] as const))
      .then((rows) => {
        if (!active) { rows.forEach(([, url]) => URL.revokeObjectURL(url)); return; }
        rows.forEach(([, url]) => loaded.push(url));
        setBlobUrls(Object.fromEntries(rows));
      }).catch(() => {});
    return () => { active = false; loaded.forEach((url) => URL.revokeObjectURL(url)); };
  }, [image.url, image.medicationsUrl, image.instructionsUrl, image.investigationsUrl]);

  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden text-right">
      {Object.entries(blobUrls).map(([label, url]) => (
        <button key={label} onClick={() => window.open(url, '_blank', 'noopener')} className="block w-full border-b last:border-0 border-ink-100 hover:bg-brand-50 transition-colors">
          <p className="text-xs font-semibold text-ink-700 px-2.5 py-2">{label}</p>
          <div className="aspect-[4/3] bg-ink-50 flex items-center justify-center overflow-hidden">
            <img src={url} alt={`روشتة مرسومة — ${label}`} className="w-full h-full object-cover" />
          </div>
        </button>
      ))}
      {Object.keys(blobUrls).length === 0 && <div className="aspect-[4/3] bg-ink-50 flex items-center justify-center"><FileText size={20} className="text-ink-300" /></div>}
      <div className="p-2.5"><p className="text-xs font-medium text-ink-700">{image.doctorName}</p><p className="text-[11px] text-ink-400 mt-0.5">{formatDate(image.createdAt)}</p></div>
    </div>
  );
}
