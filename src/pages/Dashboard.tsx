import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, CalendarCheck, ClipboardList, UserPlus2, Search, CalendarPlus2, RefreshCw } from 'lucide-react';
import Layout from '../components/Layout';
import StatCard from '../components/StatCard';
import AppointmentCard from '../components/AppointmentCard';
import { useApp } from '../context/AppContext';
import { patientsApi, queueApi, appointmentsApi } from '../lib/api';
import { getSocket } from '../lib/socket';

// Use local date to avoid timezone issues with date picker and filtering
const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA');

export default function Dashboard() {
  const { appointments, patients, currentUser, pushToast, refreshPatients, refreshAppointments } = useApp();
  const navigate = useNavigate();

  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [waitingCount, setWaitingCount] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [totalPatients, setTotalPatients] = useState(0);
  const [newThisMonth, setNewThisMonth] = useState(0);

  const isReception = currentUser?.role === 'reception';

  const todayAppointments = appointments.filter((a) => a.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const completedToday = todayAppointments.filter((a) => a.status === 'مكتمل').length;

  // Load initial data
  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      setLoadingPatients(true);
      setLoadingQueue(true);
      try {
        // For reception: use cached patients from context for total count
        // For doctors: fetch from API
        let patientRows: any[] = [];
        if (isReception) {
          patientRows = patients;
          setTotalPatients(patients.length);
          setNewThisMonth(patients.filter((p) => p.createdAt >= thisMonthStart).length);
        } else {
          patientRows = await patientsApi.list();
          setTotalPatients(patientRows.length);
          setNewThisMonth(patientRows.filter((p) => p.createdAt >= thisMonthStart).length);
        }

        if (active) {
          const sorted = [...patientRows].sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || '')).slice(0, 5);
          setRecentPatients(sorted);
        }

        // Load queue count for reception
        if (isReception) {
          const queueRows = await queueApi.list();
          if (active) setWaitingCount(queueRows.filter((e: any) => e.status === 'waiting' || e.status === 'in_progress').length);
        }
      } catch (err: any) {
        pushToast(err.message || 'تعذّر تحميل البيانات', 'error');
      } finally {
        if (active) {
          setLoadingPatients(false);
          setLoadingQueue(false);
        }
      }
    };

    loadInitialData();
    return () => { active = false; };
  }, [isReception, patients, pushToast]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();

    const handleQueueNew = (entry: any) => {
      if (isReception) {
        setWaitingCount((prev) => prev + 1);
      }
      pushToast(`مريض جديد في الانتظار: ${entry.patientName}`, 'info');
    };

    const handleQueueUpdate = (entry: any) => {
      if (isReception) {
        // Refresh queue count when status changes
        queueApi.list().then((rows) => {
          setWaitingCount(rows.filter((e: any) => e.status === 'waiting' || e.status === 'in_progress').length);
        }).catch(() => {});
      }
    };

    const handleAppointmentCreated = (appointment: any) => {
      if (appointment.date === today) {
        // The context already updates via socket listener in AppContext
        // But we can also refresh to be safe
        refreshAppointments();
      }
    };

    const handleAppointmentUpdated = (appointment: any) => {
      if (appointment.date === today) {
        refreshAppointments();
      }
    };

    socket.on('queue:new', handleQueueNew);
    socket.on('queue:update', handleQueueUpdate);
    socket.on('appointment:created', handleAppointmentCreated);
    socket.on('appointment:updated', handleAppointmentUpdated);

    return () => {
      socket.off('queue:new', handleQueueNew);
      socket.off('queue:update', handleQueueUpdate);
      socket.off('appointment:created', handleAppointmentCreated);
      socket.off('appointment:updated', handleAppointmentUpdated);
    };
  }, [currentUser, isReception, pushToast, refreshAppointments]);

  // Refresh all data function
  const handleRefreshAll = async () => {
    setLoadingPatients(true);
    setLoadingQueue(true);
    try {
      await Promise.all([
        refreshPatients(),
        refreshAppointments(),
      ]);
      if (isReception) {
        const queueRows = await queueApi.list();
        setWaitingCount(queueRows.filter((e: any) => e.status === 'waiting' || e.status === 'in_progress').length);
      }
      pushToast('تم تحديث البيانات', 'success');
    } catch (err: any) {
      pushToast(err.message || 'تعذّر تحديث البيانات', 'error');
    } finally {
      setLoadingPatients(false);
      setLoadingQueue(false);
    }
  };

  const quickActions = isReception
    ? [
        { label: 'إضافة مريض', icon: UserPlus2, action: () => navigate('/patients/new') },
        { label: 'قائمة الانتظار', icon: ClipboardList, action: () => navigate('/queue') },
        { label: 'المواعيد', icon: CalendarPlus2, action: () => navigate('/appointments') },
        { label: 'البحث عن مريض', icon: Search, action: () => navigate('/patients') },
      ]
    : [
        { label: 'قائمة مرضاي', icon: ClipboardList, action: () => navigate('/queue') },
        { label: 'المواعيد', icon: CalendarPlus2, action: () => navigate('/appointments') },
        { label: 'البحث عن مريض', icon: Search, action: () => navigate('/patients') },
      ];

  return (
    <Layout title="الرئيسية">
      <div className="mb-5">
        <p className="text-ink-500 text-sm">أهلًا بك، {currentUser?.fullName} 👋</p>
        <h2 className="text-xl font-bold text-ink-800 mt-0.5">{isReception ? 'لوحة تحكم الاستقبال' : 'نظرة عامة على العيادة اليوم'}</h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="إجمالي المرضى" value={totalPatients || (loadingPatients ? '...' : 0)} icon={Users} trend={{ value: newThisMonth > 0 ? `+${newThisMonth} هذا الشهر` : 'هذا الشهر', positive: true }} />
        <StatCard label="مواعيد اليوم" value={todayAppointments.length} icon={CalendarCheck} sublabel={`${completedToday} تم إنجازها`} />
        <StatCard label={isReception ? 'مرضى في الانتظار' : 'زيارات اليوم'} value={isReception ? (loadingQueue ? '...' : waitingCount) : todayAppointments.length} icon={ClipboardList} sublabel={isReception ? 'حاليًا' : 'حتى الآن'} />
        <StatCard label="المرضى الجدد" value={newThisMonth} icon={UserPlus2} sublabel="هذا الشهر" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-1 bg-white rounded-xl2 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink-800">إجراءات سريعة</h3>
            <button onClick={handleRefreshAll} disabled={loadingPatients || loadingQueue} className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50 flex items-center gap-1">
              <RefreshCw size={12} className={(loadingPatients || loadingQueue) ? 'animate-spin' : ''} />
              تحديث
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={a.action}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border border-ink-100 hover:border-brand-300 hover:bg-brand-50/40 py-4 px-2 transition-colors text-center"
              >
                <a.icon size={20} className="text-brand-600" />
                <span className="text-xs font-medium text-ink-700">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl2 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink-800">المواعيد القادمة اليوم</h3>
            <button onClick={() => navigate('/appointments')} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              عرض الكل
            </button>
          </div>
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
            {todayAppointments.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-ink-500 text-sm">لا توجد مواعيد لهذا اليوم</p>
              </div>
            ) : (
              todayAppointments.map((a) => <AppointmentCard key={a.id} appointment={a} />)
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl2 shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-ink-800">{isReception ? 'أحدث المرضى' : 'أحدث مرضاي'}</h3>
          <button onClick={() => navigate('/patients')} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            عرض كل المرضى
          </button>
        </div>
        {loadingPatients ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-2 p-3.5 rounded-lg border border-ink-100 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-ink-100" />
                <div className="w-20 h-3 bg-ink-100 rounded" />
                <div className="w-16 h-2 bg-ink-100 rounded" />
              </div>
            ))}
          </div>
        ) : recentPatients.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-8">لا يوجد مرضى بعد</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {recentPatients.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/patients/${p.id}`)}
                className="flex flex-col items-center text-center gap-2 p-3.5 rounded-lg border border-ink-100 hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ backgroundColor: p.avatarColor }}
                >
                  {p.fullName.split(' ')[0][0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800 truncate w-full">{p.fullName}</p>
                  <p className="text-xs text-ink-400">{p.fileNumber}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}