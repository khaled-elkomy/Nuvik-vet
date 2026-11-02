import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from './context/AppContext';
import ToastContainer from './components/Toast';
import Login from './pages/Login';
import Layout from './components/Layout';
import Users from './pages/Users';
import Customers from './pages/Customers';
import Products from './pages/Products';

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, authLoading } = useApp();
  if (authLoading) return <div className="min-h-screen grid place-items-center text-ink-500">جارِ التحقق من الجلسة…</div>;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function UserManagement() {
  const { currentUser } = useApp();
  if (!currentUser?.permissions.includes('users.manage')) return <Navigate to="/no-access" replace />;
  return <Users />;
}

function CustomersManagement() {
  const { currentUser } = useApp();
  if (!currentUser?.permissions.some((p) => ['customers.animals.manage', 'clinical.records.read'].includes(p))) return <Navigate to="/no-access" replace />;
  return <Customers />;
}

function CatalogManagement() {
  const { currentUser } = useApp();
  if (!currentUser?.permissions.some((p) => ['catalog.read', 'invoices.draft.manage', 'invoices.finalize'].includes(p))) return <Navigate to="/no-access" replace />;
  return <Products />;
}

function Landing() {
  const { currentUser } = useApp();
  return <Navigate to={currentUser?.permissions.includes('users.manage') ? '/users' : '/no-access'} replace />;
}

function NoAccess() {
  return <Layout title="لا توجد صلاحية"><div className="bg-white rounded-xl2 p-6 text-ink-600" dir="rtl">لا تملك صلاحية لأي وحدة متاحة في هذا العرض. تواصل مع مدير العيادة.</div></Layout>;
}

export default function App() {
  return <>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/users" element={<RequireAuth><UserManagement /></RequireAuth>} />
      <Route path="/customers" element={<RequireAuth><CustomersManagement /></RequireAuth>} />
      <Route path="/products" element={<RequireAuth><CatalogManagement /></RequireAuth>} />
      <Route path="/no-access" element={<RequireAuth><NoAccess /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><Landing /></RequireAuth>} />
      <Route path="*" element={<RequireAuth><Landing /></RequireAuth>} />
    </Routes>
    <ToastContainer />
  </>;
}
