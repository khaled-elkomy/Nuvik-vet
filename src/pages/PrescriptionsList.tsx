import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { prescriptions as mockPrescriptions } from '../data/mockData';

// نفس ملحوظة صفحة الزيارات: قائمة كل الروشتات في العيادة لسه تجريبية
// لحد ما نضيف endpoint مخصص لكل الروشتات في السيرفر.

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PrescriptionsList() {
  const { getPatient } = useApp();
  const navigate = useNavigate();
  const sorted = [...mockPrescriptions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Layout title="الروشتات">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink-800">جميع الروشتات</h2>
        <p className="text-sm text-ink-400 mt-0.5">{mockPrescriptions.length} روشتة (بيانات تجريبية)</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((rx) => {
          const patient = getPatient(rx.patientId);
          return (
            <button
              key={rx.id}
              onClick={() => navigate(`/patients/${rx.patientId}`)}
              className="bg-white rounded-xl2 shadow-card p-4 text-right hover:ring-1 hover:ring-brand-200 transition-shadow"
            >
              <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-brand-600" />
                <p className="text-sm font-semibold text-ink-800 truncate">{patient?.fullName || 'مريض غير معروف'}</p>
              </div>
              <p className="text-xs text-ink-500">{rx.diagnosis}</p>
              <p className="text-xs text-ink-400 mt-1">{formatDate(rx.date)} · {rx.medications.length} أدوية</p>
            </button>
          );
        })}
      </div>
    </Layout>
  );
}
