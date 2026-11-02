import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
}

export default function StatCard({ label, value, sublabel, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="clinic-card p-5 flex items-start justify-between">
      <div>
        <p className="text-sm text-ink-500">{label}</p>
        <p className="text-2xl font-bold text-ink-800 mt-1.5 tabular-nums">{value}</p>
        {sublabel && <p className="text-xs text-ink-400 mt-1">{sublabel}</p>}
        {trend && (
          <p className={`text-xs mt-1.5 font-medium ${trend.positive ? 'text-brand-600' : 'text-red-600'}`}>
            {trend.value}
          </p>
        )}
      </div>
      <div className="w-11 h-11 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
        <Icon size={20} className="text-brand-600" />
      </div>
    </div>
  );
}
