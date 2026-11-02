import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const iconMap = {
  success: <CheckCircle2 size={18} className="text-brand-600" />,
  error: <XCircle size={18} className="text-red-600" />,
  info: <Info size={18} className="text-ink-500" />,
};

const borderMap = {
  success: 'border-r-4 border-brand-500',
  error: 'border-r-4 border-red-500',
  info: 'border-r-4 border-ink-400',
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm sm:left-auto sm:right-4 sm:translate-x-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast-in flex items-start gap-2.5 bg-white rounded-lg shadow-lg shadow-ink-900/10 px-4 py-3 ${borderMap[t.type]}`}
        >
          {iconMap[t.type]}
          <p className="flex-1 text-sm text-ink-800 leading-snug">{t.message}</p>
          <button onClick={() => dismissToast(t.id)} className="text-ink-400 hover:text-ink-600 shrink-0">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
