import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from './context/AppContext';
import ToastContainer from './components/Toast';
import type { UserRole } from './types';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import AddPatient from './pages/AddPatient';
import PatientProfile from './pages/PatientProfile';
import Appointments from './pages/Appointments';
import WaitingRoom from './pages/WaitingRoom';
import Doctors from './pages/Doctors';
import PatientCheckIn from './pages/PatientCheckIn';
import PatientAppointment from './pages/PatientAppointment';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import WritePrescription from './pages/WritePrescription';
import Finance from './pages/Finance';

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authLoading } = useApp();
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <p className="text-ink-400 text-sm">جارِ التحميل...</p>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** بعض الشاشات مقصورة على دور معيّن (زي تسجيل زيارة/روشتة — دكتور فقط، أو استقبال مريض — ريسبشن فقط) */
function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { currentUser, pushToast } = useApp();
  if (currentUser && currentUser.role !== role) {
    pushToast(role === 'doctor' ? 'هذه الصفحة مخصصة للدكاترة فقط' : 'هذه الصفحة مخصصة للريسبشن فقط', 'error');
    return <Navigate to={currentUser.role === 'reception' ? '/dashboard' : '/queue'} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/queue" element={<RequireAuth><WaitingRoom /></RequireAuth>} />
        <Route path="/patients" element={<RequireAuth><Patients /></RequireAuth>} />
        <Route path="/doctors" element={<RequireAuth><RequireRole role="reception"><Doctors /></RequireRole></RequireAuth>} />
        <Route
          path="/patients/new"
          element={
            <RequireAuth>
              <RequireRole role="reception"><AddPatient /></RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/patients/:id" element={<RequireAuth><PatientProfile /></RequireAuth>} />
        <Route
          path="/patients/:id/checkin"
          element={
            <RequireAuth>
              <RequireRole role="reception"><PatientCheckIn /></RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/patients/:id/appointment"
          element={
            <RequireAuth>
              <RequireRole role="reception"><PatientAppointment /></RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/appointments" element={<RequireAuth><Appointments /></RequireAuth>} />
        <Route path="/finance" element={<RequireAuth><RequireRole role="reception"><Finance /></RequireRole></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><RequireRole role="doctor"><Reports /></RequireRole></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><RequireRole role="doctor"><Settings /></RequireRole></RequireAuth>} />
        <Route
          path="/patients/:id/prescriptions/new"
          element={
            <RequireAuth>
              <RequireRole role="doctor"><WritePrescription /></RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
