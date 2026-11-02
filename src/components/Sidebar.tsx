import { NavLink, useNavigate } from 'react-router-dom';
import { Activity, UsersRound, ShoppingBasket, Settings, UserCog, LogOut, X, ReceiptText, ScanLine, Clock3 } from 'lucide-react';
import { useApp } from '../context/AppContext';

const items = [
  { label: 'العملاء والحيوانات', icon: UsersRound, permissions: ['customers.animals.manage', 'clinical.records.read'], to: '/customers' },
  { label: 'الكتالوج والمخزون', icon: ShoppingBasket, permissions: ['catalog.read', 'catalog.prices.manage', 'goods_receipts.post', 'invoices.draft.manage', 'invoices.finalize'], to: '/products' },
  { label: 'نقطة البيع', icon: ScanLine, permissions: ['invoices.finalize'], to: '/pos' },
  { label: 'الفواتير', icon: ReceiptText, permissions: ['invoices.finalize', 'invoices.draft.manage', 'payments.receive'], to: '/invoices' },
  { label: 'الورديات', icon: Clock3, permissions: ['payments.receive', 'users.manage'], to: '/shifts' },
  { label: 'الإعدادات', icon: Settings, permissions: ['settings.manage'], soon: true },
  { label: 'المستخدمون', icon: UserCog, permissions: ['users.manage'], to: '/users' },
];

export default function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { currentUser, logout } = useApp();
  const navigate = useNavigate();
  const can = (permissions: string[]) => permissions.some((permission) => currentUser?.permissions.includes(permission));
  const content = <div className="flex flex-col h-full" dir="rtl">
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center"><Activity size={18} className="text-white" /></div>
      <div><p className="font-bold text-ink-800">Nuvik Vet</p><p className="text-[11px] text-ink-400">إدارة العيادة البيطرية</p></div>
      <button onClick={onCloseMobile} className="mr-auto lg:hidden text-ink-400 p-1" aria-label="إغلاق القائمة"><X size={20} /></button>
    </div>
    <nav className="flex-1 px-3 py-2 space-y-1">
      {items.filter((item) => can(item.permissions)).map((item) => item.soon ?
        <div key={item.label} aria-disabled="true" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-ink-400 cursor-not-allowed">
          <item.icon size={18} /><span className="flex-1">{item.label}</span><span className="text-[10px] border rounded px-1.5 py-0.5">قريبًا</span>
        </div> : <NavLink key={item.label} to={item.to!} onClick={onCloseMobile} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-50'}`}>
          <item.icon size={18} /><span>{item.label}</span>
        </NavLink>)}
    </nav>
    <div className="border-t border-ink-100 p-3">
      <p className="px-2 py-2 text-sm font-semibold text-ink-700 truncate">{currentUser?.fullName}</p>
      <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-ink-500 hover:bg-red-50 hover:text-red-600">
        <LogOut size={18} /><span>تسجيل الخروج</span>
      </button>
    </div>
  </div>;
  return <>
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-screen sticky top-0 bg-white border-l border-ink-100">{content}</aside>
    {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="إغلاق القائمة" className="absolute inset-0 bg-black/30" onClick={onCloseMobile} /><aside className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-xl">{content}</aside></div>}
  </>;
}
