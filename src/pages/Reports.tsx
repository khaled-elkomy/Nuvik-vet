import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Users, Activity } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { visitsApi } from '../lib/api';

export default function Reports() {
  const { patients, appointments } = useApp();
  const [visitsCount, setVisitsCount] = useState<number | null>(null);

  useEffect(() => {
    if (patients.length === 0) { setVisitsCount(0); return; }
    let active = true;
    Promise.all(patients.map((p) => visitsApi.listByPatient(p.id).catch(() => [])))
      .then((lists) => { if (active) setVisitsCount(lists.reduce((sum, l) => sum + l.length, 0)); });
    return () => { active = false; };
  }, [patients]);

  const patientGroups = patients.reduce<Record<string, number>>((acc, p) => {
    const group = p.gender || 'غير محدد';
    acc[group] = (acc[group] || 0) + 1;
    return acc;
  }, {});

  const maxCount = Math.max(...Object.values(patientGroups), 1);

  return (
    <Layout title="التقارير">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink-800">تقارير العيادة</h2>
        <p className="text-sm text-ink-400 mt-0.5">ملخص أداء العيادة حتى اليوم</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <Users size={18} className="text-brand-600 mb-2" />
          <p className="text-2xl font-bold text-ink-800">{patients.length}</p>
          <p className="text-sm text-ink-500 mt-1">إجمالي المرضى المسجلين</p>
        </div>
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <Activity size={18} className="text-brand-600 mb-2" />
          <p className="text-2xl font-bold text-ink-800">{visitsCount ?? '...'}</p>
          <p className="text-sm text-ink-500 mt-1">إجمالي الزيارات المسجلة</p>
        </div>
        <div className="bg-white rounded-xl2 shadow-card p-5">
          <TrendingUp size={18} className="text-brand-600 mb-2" />
          <p className="text-2xl font-bold text-ink-800">{appointments.length}</p>
          <p className="text-sm text-ink-500 mt-1">إجمالي المواعيد</p>
        </div>
      </div>

      <div className="bg-white rounded-xl2 shadow-card p-5">
        <h3 className="font-bold text-ink-800 flex items-center gap-2 mb-4">
          <BarChart3 size={17} className="text-brand-600" /> توزيع المرضى حسب النوع
        </h3>
        {patients.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">لا يوجد مرضى مسجلون بعد</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(patientGroups).map(([group, count]) => (
              <div key={group} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-ink-500 shrink-0">{group}</span>
                <div className="flex-1 h-3 bg-ink-50 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="w-8 text-ink-700 font-medium tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
