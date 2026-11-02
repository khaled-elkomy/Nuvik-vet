import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarDays, ListChecks, BarChart3, Settings,
  LogOut, Activity, X, Stethoscope, WalletCards,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../types';

const navItems: { to: string; label: string; icon: any; onlyFor?: UserRole }[] = [
  { to: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/queue', label: 'قائمة الانتظار', icon: ListChecks },
  { to: '/patients', label: 'المرضى', icon: Users },
  { to: '/doctors', label: 'الدكاترة', icon: Stethoscope, onlyFor: 'reception' },
  { to: '/appointments', label: 'المواعيد', icon: CalendarDays },
  { to: '/finance', label: 'الحسابات', icon: WalletCards, onlyFor: 'reception' },
  { to: '/reports', label: 'التقارير', icon: BarChart3, onlyFor: 'doctor' },
  { to: '/settings', label: 'الإعدادات', icon: Settings, onlyFor: 'doctor' },
];

export default function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { currentUser, logout } = useApp();
  const navigate = useNavigate();
  const visibleNavItems = navItems.filter((item) => !item.onlyFor || item.onlyFor === currentUser?.role);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
          <Activity size={18} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-ink-800 leading-tight">عيادتي</p>
          <p className="text-[11px] text-ink-400 leading-tight">نظام إدارة العيادة</p>
        </div>
        <button onClick={onCloseMobile} className="mr-auto lg:hidden text-ink-400 p-1">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'
              }`
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
            {(currentUser?.fullName || '؟').replace('د. ', '').slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-800 truncate">{currentUser?.fullName}</p>
            <p className="text-xs text-ink-400 truncate">
              {currentUser?.role === 'doctor' ? (currentUser?.specialty || 'دكتور') : 'ريسبشن'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium text-ink-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={18} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-screen sticky top-0 bg-white border-l border-ink-100">
        {content}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={onCloseMobile} />
          <aside className="absolute top-0 right-0 h-full w-72 bg-white shadow-xl animate-fade-in">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
