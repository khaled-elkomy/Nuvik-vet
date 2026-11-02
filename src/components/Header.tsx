import { Menu, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Header({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/patients?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-ink-100 px-4 sm:px-6 py-3.5 flex items-center gap-3">
      <button onClick={onMenuClick} className="lg:hidden text-ink-500 p-1.5 -mr-1">
        <Menu size={22} />
      </button>
      <h1 className="font-bold text-ink-800 text-lg shrink-0">{title}</h1>
      <form onSubmit={handleSearch} className="hidden sm:flex items-center relative mr-auto w-full max-w-xs">
        <Search size={16} className="absolute right-3 text-ink-400 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث عن مريض..."
          className="w-full bg-ink-50 border border-ink-100 rounded-lg pr-9 pl-3 py-2 text-sm text-ink-700 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
        />
      </form>
    </header>
  );
}
