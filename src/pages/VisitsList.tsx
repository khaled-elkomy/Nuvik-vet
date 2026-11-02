import { useNavigate } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { visits as mockVisits } from '../data/mockData';

// ملحوظة: هذه الشاشة (كل الزيارات في كل العيادة) لسه بتعرض بيانات تجريبية،
// لأن الباك-إند دلوقتي بيوفر endpoint لزيارات مريض واحد بس (GET /visits/patient/:id).
// لو احتجت الشاشة دي حقيقية، تحتاج إضافة GET /api/visits (كل الزيارات) في السيرفر.

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function VisitsList() {
  const { getPatient } = useApp();
  const navigate = useNavigate();
  const sorted = [...mockVisits].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Layout title="الزيارات">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink-800">سجل الزيارات</h2>
        <p className="text-sm text-ink-400 mt-0.5">{mockVisits.length} زيارة (بيانات تجريبية — سجل زيارات مريض واحد حقيقي من صفحة ملفه)</p>
      </div>

      <div className="bg-white rounded-xl2 shadow-card divide-y divide-ink-50">
        {sorted.map((v) => {
          const patient = getPatient(v.patientId);
          return (
            <button
              key={v.id}
              onClick={() => navigate(`/patients/${v.patientId}`)}
              className="w-full flex items-center gap-4 p-4 hover:bg-ink-50/60 transition-colors text-right"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                <Stethoscope size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-800 truncate">{patient?.fullName || 'مريض غير معروف'}</p>
                <p className="text-xs text-ink-400 mt-0.5">{v.diagnosis}</p>
              </div>
              <div className="text-left shrink-0">
                <p className="text-xs text-ink-500">{formatDate(v.date)}</p>
                <p className="text-xs text-ink-400">{v.type}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Layout>
  );
}
