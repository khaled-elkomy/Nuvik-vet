import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Play, CheckCircle2, X as XIcon, Radio, FileEdit, UserPlus2, Users, Stethoscope } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { queueApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { QueueEntry } from '../types';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  return `منذ ${Math.floor(mins / 60)} ساعة`;
}

const statusMeta: Record<QueueEntry['status'], { label: string; dot: string; text: string }> = {
  waiting: { label: 'في الانتظار', dot: 'bg-amber-500', text: 'text-amber-600' },
  in_progress: { label: 'جاري الكشف', dot: 'bg-brand-500', text: 'text-brand-700' },
  done: { label: 'انتهى', dot: 'bg-ink-400', text: 'text-ink-500' },
  cancelled: { label: 'ملغي', dot: 'bg-red-500', text: 'text-red-600' },
};

/**
 * قائمة انتظار الدكتور — معزولة بالكامل على مستوى السيرفر (GET /queue بترجع
 * مرضى الدكتور المسجّل الدخول بس). الريسبشن بتشوف نفس الشاشة لكن بكل المرضى،
 * كنظرة عامة على توزيع الحالات على الدكاترة.
 */
export default function WaitingRoom() {
  const { currentUser, pushToast } = useApp();
  const navigate = useNavigate();

  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const isReception = currentUser?.role === 'reception';
  const isDoctor = currentUser?.role === 'doctor';

  useEffect(() => {
    let active = true;
    queueApi
      .list()
      .then((rows) => { if (active) setEntries(rows); })
      .catch((err) => pushToast(err.message || 'تعذّر تحميل قائمة الانتظار', 'error'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔴 الاتصال اللحظي — السيرفر بيبعت الحدث لغرفة الدكتور المعني بس (أو الريسبشن)
  useEffect(() => {
    const socket = getSocket();

    const handleNew = (entry: QueueEntry) => {
      setEntries((prev) => [...prev, entry]);
      if (isDoctor) pushToast(`مريض جديد في قائمة الانتظار: ${entry.patientName}`, 'info');
    };
    const handleUpdate = (entry: QueueEntry) => {
      setEntries((prev) => {
        const exists = prev.some((e) => e.id === entry.id);
        if (entry.status === 'done' || entry.status === 'cancelled') {
          return prev.filter((e) => e.id !== entry.id);
        }
        if (!exists) return [...prev, entry];
        return prev.map((e) => (e.id === entry.id ? entry : e));
      });
    };

    socket.on('queue:new', handleNew);
    socket.on('queue:update', handleUpdate);
    return () => {
      socket.off('queue:new', handleNew);
      socket.off('queue:update', handleUpdate);
    };
  }, [isDoctor, pushToast]);

  const waiting = useMemo(() => entries.filter((e) => e.status === 'waiting'), [entries]);
  const inProgress = useMemo(() => entries.filter((e) => e.status === 'in_progress'), [entries]);

  // Group by doctor for reception view
  const groupedByDoctor = useMemo(() => {
    const groups: Record<string, QueueEntry[]> = {};
    [...waiting, ...inProgress].forEach((entry) => {
      const doctorKey = entry.doctorId || 'unassigned';
      if (!groups[doctorKey]) groups[doctorKey] = [];
      groups[doctorKey].push(entry);
    });
    return groups;
  }, [waiting, inProgress]);

  const updateStatus = async (id: string, status: QueueEntry['status']) => {
    try {
      await queueApi.updateStatus(id, status);
    } catch (err: any) {
      pushToast(err.message || 'تعذّر تحديث الحالة', 'error');
    }
  };

  /** الدكتور بيدوس على مريض في الانتظار → يبدأ الكشف فورًا وتتفتح شاشة الروشتة مباشرة */
  const handleSelectWaiting = async (entry: QueueEntry) => {
    if (!isDoctor) return;
    await updateStatus(entry.id, 'in_progress');
    navigate(`/patients/${entry.patientId}/prescriptions/new`);
  };

  const renderEntry = (entry: QueueEntry, clickable: boolean) => {
    const meta = statusMeta[entry.status];
    return (
      <div key={entry.id} className="flex items-center gap-3 p-4 rounded-lg border border-ink-200 bg-white hover:border-clinical-200 hover:bg-clinical-50/50 transition-colors">
        <div className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
        <button
          onClick={() => (clickable ? handleSelectWaiting(entry) : undefined)}
          disabled={!clickable}
          className={`min-w-0 flex-1 text-right ${clickable ? 'hover:text-brand-700 transition-colors cursor-pointer' : ''}`}
        >
          <p className="text-sm font-semibold text-ink-800 truncate">{entry.patientName}</p>
          <p className="text-xs text-ink-400 mt-0.5">
            {entry.fileNumber} · <Clock size={11} className="inline -mt-0.5" /> {timeAgo(entry.checkedInAt)}
            {isReception && entry.doctorName ? ` · د. ${entry.doctorName}` : ''}
            {entry.note ? ` · ${entry.note}` : ''}
          </p>
        </button>
        <span className={`text-xs font-medium ${meta.text}`}>{meta.label}</span>

        {isDoctor && entry.status === 'waiting' && (
          <button
            onClick={() => handleSelectWaiting(entry)}
            title="بدء الكشف وكتابة الروشتة"
            className="p-2 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100"
          >
            <FileEdit size={14} />
          </button>
        )}
        {isDoctor && entry.status === 'in_progress' && (
          <>
            <button
              onClick={() => navigate(`/patients/${entry.patientId}/prescriptions/new`)}
              title="فتح شاشة الروشتة"
              className="p-2 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100"
            >
              <FileEdit size={14} />
            </button>
            <button
              onClick={() => updateStatus(entry.id, 'done')}
              title="إنهاء الكشف"
              className="p-2 rounded-md bg-ink-50 text-ink-600 hover:bg-ink-100"
            >
              <CheckCircle2 size={14} />
            </button>
          </>
        )}
        {isReception && entry.status === 'waiting' && (
          <button
            onClick={() => updateStatus(entry.id, 'cancelled')}
            title="إلغاء"
            className="p-2 rounded-md bg-red-50 text-red-600 hover:bg-red-100"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>
    );
  };

  const renderDoctorGroup = (doctorId: string, entries: QueueEntry[], doctorName: string) => {
    const waitingEntries = entries.filter((e) => e.status === 'waiting');
    const inProgressEntries = entries.filter((e) => e.status === 'in_progress');
    const totalCount = entries.length;

    return (
      <div key={doctorId} className="bg-white rounded-xl2 shadow-card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
              <Stethoscope size={18} className="text-brand-600" />
            </div>
            <div>
              <h3 className="font-bold text-ink-800">{doctorName || 'غير معين'}</h3>
              <p className="text-xs text-ink-400">{totalCount} مريض في الانتظار/الجاري</p>
            </div>
          </div>
        </div>
        <div className="space-y-2.5">
          {waitingEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-600 mb-1">في الانتظار ({waitingEntries.length})</p>
              {waitingEntries.map((e) => renderEntry(e, isDoctor))}
            </div>
          )}
          {inProgressEntries.length > 0 && (
            <div className="space-y-2 mt-3">
              <p className="text-xs font-medium text-brand-600 mb-1">جاري الكشف ({inProgressEntries.length})</p>
              {inProgressEntries.map((e) => renderEntry(e, false))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout title="قائمة الانتظار">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-ink-800 flex items-center gap-2">
            {isDoctor ? 'قائمة مرضاي' : 'قائمة الانتظار — كل الدكاترة'}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
              <Radio size={11} /> تحديث لحظي
            </span>
          </h2>
          <p className="text-sm text-ink-400 mt-0.5">
            {isDoctor
              ? 'دوس على أي مريض في الانتظار عشان تبدأ الكشف وتفتح شاشة الروشتة مباشرة'
              : 'نظرة عامة على مرضى كل الدكاترة — استخدمي "إضافة مريض" لإضافة حالة جديدة'}
          </p>
        </div>
        {isReception && (
          <button
            onClick={() => navigate('/patients/new')}
            className="sm:mr-auto inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors shrink-0"
          >
            <UserPlus2 size={16} />
            إضافة مريض
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-sm text-ink-400">جارِ التحميل...</p>
        </div>
      ) : isDoctor ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl2 shadow-card p-5">
            <h3 className="font-bold text-ink-800 mb-4">في الانتظار ({waiting.length})</h3>
            {waiting.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-8">لا يوجد مرضى في الانتظار حاليًا</p>
            ) : (
              <div className="space-y-2.5">{waiting.map((e) => renderEntry(e, true))}</div>
            )}
          </div>

          <div className="bg-white rounded-xl2 shadow-card p-5">
            <h3 className="font-bold text-ink-800 mb-4">جاري الكشف ({inProgress.length})</h3>
            {inProgress.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-8">لا يوجد كشف جاري حاليًا</p>
            ) : (
              <div className="space-y-2.5">{inProgress.map((e) => renderEntry(e, false))}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(groupedByDoctor).length === 0 ? (
            <div className="bg-white rounded-xl2 shadow-card p-12 text-center">
              <Users size={48} className="mx-auto text-ink-300 mb-4" />
              <p className="text-ink-500 text-lg font-medium">لا يوجد مرضى في الانتظار حاليًا</p>
              <p className="text-sm text-ink-400 mt-2">سيظهر المرضى هنا عند تسجيلهم في قائمة الانتظار</p>
            </div>
          ) : (
            Object.entries(groupedByDoctor).map(([doctorId, entries]) => {
              const doctorName = entries[0]?.doctorName || 'غير معين';
              return renderDoctorGroup(doctorId, entries, doctorName);
            })
          )}
        </div>
      )}
    </Layout>
  );
}
