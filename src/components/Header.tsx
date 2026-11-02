import { Menu } from 'lucide-react';

export default function Header({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-ink-100 px-4 sm:px-6 py-3.5 flex items-center gap-3" dir="rtl">
    <button onClick={onMenuClick} className="lg:hidden text-ink-500 p-1.5" aria-label="فتح القائمة"><Menu size={22} /></button>
    <h1 className="font-bold text-ink-800 text-lg">{title}</h1>
  </header>;
}
