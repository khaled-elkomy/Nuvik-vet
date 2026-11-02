import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, RefreshCw } from 'lucide-react';
import Layout from '../components/Layout';
import PatientTable from '../components/PatientTable';
import { useApp } from '../context/AppContext';
import { patientsApi } from '../lib/api';
import { ageFromBirthDate } from '../lib/age';
export default function Patients() {
  const { patients: cachedPatients, currentUser, refreshPatients, patientsLoading: cachedLoading, pushToast } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [patients, setPatients] = useState<typeof cachedPatients>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const isReception = currentUser?.role === 'reception';

  // Load patients - reception uses cached, doctors fetch from API
  const loadPatients = async (searchQuery?: string) => {
    setLoading(true);
    try {
      let rows;
      if (isReception) {
        // Reception uses cached patients (already loaded in AppContext)
        rows = cachedPatients;
      } else {
        // Doctors fetch their assigned patients from API
        const doctorPatients = await patientsApi.list(searchQuery);
        // The doctor endpoint returns the DOB, while the UI age is intentionally derived.
        rows = doctorPatients.map((patient: any) => ({
          ...patient,
          age: ageFromBirthDate(patient.birthDate),
        }));
      }
      setPatients(rows);
      setTotalCount(rows.length);
    } catch (err: any) {
      pushToast(err.message || 'تعذّر تحميل قائمة المرضى', 'error');
      setPatients([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadPatients();
  }, [isReception, cachedPatients]);

  // Search - debounced
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isReception) {
        loadPatients(query);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, isReception]);

  const filtered = useMemo(() => {
    if (isReception) {
      // Reception filters locally on cached data
      return patients.filter((p) => {
        const matchesQuery =
          !query.trim() ||
          p.fullName.includes(query.trim()) ||
          p.fileNumber.includes(query.trim()) ||
          p.phone.includes(query.trim());
        return matchesQuery;
      });
    }
    // Doctors - filtering is done server-side
    return patients;
  }, [patients, query, isReception]);

  const handleRefresh = () => {
    if (isReception) {
      refreshPatients();
    } else {
      loadPatients(query);
    }
  };

  return (
    <Layout title="المرضى">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-ink-800">قائمة المرضى</h2>
          <p className="text-sm text-ink-400 mt-0.5">
            {isReception ? `${totalCount} مريض مسجل في العيادة` : `${totalCount} مريض معين لك`}
          </p>
        </div>
        {isReception && (
          <button
            onClick={() => navigate('/patients/new')}
            className="sm:mr-auto inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors shrink-0"
          >
            <Plus size={16} />
            إضافة مريض
          </button>
        )}
      </div>

      <div className="clinic-card overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-ink-200">
          <div className="relative flex-1">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو رقم الملف أو رقم الهاتف..."
              className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors border-ink-200 text-ink-500 hover:border-brand-300 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              تحديث
            </button>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="mx-auto text-brand-500 animate-spin" size={24} />
            <p className="text-sm text-ink-400 mt-2">جارِ التحميل...</p>
          </div>
        ) : (
          <PatientTable patients={filtered} isReception={isReception} />
        )}
      </div>
    </Layout>
  );
}
