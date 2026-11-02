import type { AppointmentStatus } from '../types';

type Status = AppointmentStatus;

const styles: Record<Status, string> = {
  'مؤكد': 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
  'حضر': 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100',
  'جاري الكشف': 'bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100',
  'مكتمل': 'bg-ink-100 text-ink-600 ring-1 ring-inset ring-ink-200',
  'ملغي': 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-100',
  'لم يحضر': 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-100',
};

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${styles[status]}`}>
      {status}
    </span>
  );
}
