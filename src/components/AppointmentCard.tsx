import { Clock, User } from 'lucide-react';
import type { Appointment } from '../types';
import StatusBadge from './StatusBadge';
import { useNavigate } from 'react-router-dom';
import { formatTime12 } from '../lib/timeFormat';

export default function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/patients/${appointment.patientId}`)}
      className="flex items-center gap-3 p-3.5 rounded-lg border border-ink-200 hover:border-brand-200 hover:bg-brand-50/30 cursor-pointer transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-ink-50 flex flex-col items-center justify-center shrink-0 text-brand-700">
        <Clock size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-800 text-sm truncate">{appointment.patientName}</p>
        <div className="flex items-center gap-2 text-xs text-ink-400 mt-0.5">
          <span className="tabular-nums" dir="ltr">{formatTime12(appointment.time)}</span>
          <span>·</span>
          <span className="truncate">{appointment.type}</span>
        </div>
      </div>
      <StatusBadge status={appointment.status} />
    </div>
  );
}
