import { ArrowLeft, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { UPLOADS_BASE_URL } from '../lib/api';
import { formatTime12 } from '../lib/timeFormat';

export type SelectableDoctor = {
  id: string;
  fullName: string;
  specialty?: string | null;
  logoUrl?: string | null;
  isActive?: boolean;
  isAvailableToday?: boolean;
  weeklySchedule?: { id?: string; dayOfWeek: number; startTime: string; endTime: string }[];
};

const weekDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatTime(time: string) {
  return formatTime12(time);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
}

/** Presentation of the stored weekly schedule; backend availability remains authoritative. */
export function appointmentSlotsForDate(doctor: SelectableDoctor | undefined, date: string) {
  if (!doctor || !date) return [] as string[];
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const slots = new Set<string>();
  for (const entry of doctor.weeklySchedule || []) {
    if (entry.dayOfWeek !== dayOfWeek) continue;
    const [startHour, startMinute] = entry.startTime.slice(0, 5).split(':').map(Number);
    const [endHour, endMinute] = entry.endTime.slice(0, 5).split(':').map(Number);
    for (let minutes = startHour * 60 + startMinute; minutes + 30 <= endHour * 60 + endMinute; minutes += 30) {
      slots.add(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
  }
  return Array.from(slots).sort();
}

export function SpecialtyGrid({ doctors, onSelect }: { doctors: SelectableDoctor[]; onSelect: (specialty: string) => void }) {
  const specialties = Array.from(new Map(
    doctors.map((doctor) => [doctor.specialty?.trim() || 'غير محدد التخصص', 0]),
  ).keys()).map((specialty) => ({ specialty, count: doctors.filter((doctor) => (doctor.specialty?.trim() || 'غير محدد التخصص') === specialty).length }));

  return <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
    {specialties.map(({ specialty, count }) => (
      <button key={specialty} type="button" onClick={() => onSelect(specialty)} className="bg-white border border-ink-200 rounded-xl2 p-5 sm:p-6 text-center shadow-card hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
        <span className="w-12 h-12 mx-auto mb-3 rounded-full bg-clinical-100 text-brand-600 flex items-center justify-center"><Stethoscope size={24} /></span>
        <p className="font-bold text-ink-800">{specialty}</p>
        <p className="text-xs text-ink-500 mt-1">{count} {count === 1 ? 'طبيب' : 'أطباء'}</p>
      </button>
    ))}
  </div>;
}

export function SpecialtyDoctorGrid({ specialty, doctors, mode, selectedDoctorId, onBack, onSelect, renderActions }: {
  specialty: string;
  doctors: SelectableDoctor[];
  mode: 'appointment' | 'checkin' | 'manage';
  selectedDoctorId?: string;
  onBack: () => void;
  onSelect: (doctor: SelectableDoctor) => void;
  renderActions?: (doctor: SelectableDoctor) => ReactNode;
}) {
  const doctorsInSpecialty = doctors.filter((doctor) => (doctor.specialty?.trim() || 'غير محدد التخصص') === specialty);
  const checkin = mode === 'checkin';
  return <div>
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-brand-700 mb-4"><ArrowLeft size={16} />رجوع إلى التخصصات</button>
    <h3 className="text-lg font-bold text-ink-800">{specialty}</h3>
    <p className="text-sm text-ink-500 mt-1 mb-4">اختر الطبيب</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {doctorsInSpecialty.map((doctor) => {
        const available = doctor.isAvailableToday === true;
        const disabled = checkin && !available;
        const selected = selectedDoctorId === doctor.id;
        return <article key={doctor.id} className={`bg-white border rounded-xl2 p-5 shadow-card ${selected ? 'border-brand-500 ring-2 ring-brand-100' : disabled ? 'border-red-100' : 'border-ink-200'}`}>
          <div className="flex items-center gap-3"><div className="w-16 h-16 rounded-full bg-ink-50 overflow-hidden flex items-center justify-center shrink-0">{doctor.logoUrl ? <img src={`${UPLOADS_BASE_URL}${doctor.logoUrl}`} alt={doctor.fullName} className="w-full h-full object-cover" /> : <span className="text-lg font-bold text-ink-500">{initials(doctor.fullName)}</span>}</div><div className="min-w-0"><p className="font-bold text-ink-800 truncate">{doctor.fullName}</p><p className="text-sm text-brand-600 mt-0.5">{doctor.specialty || 'دكتور'}</p></div></div>
          <p className={`inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-2.5 py-1.5 mt-4 ${available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}><span className={`w-2.5 h-2.5 rounded-full ${available ? 'bg-green-500' : 'bg-red-500'}`} />{available ? 'متاح اليوم' : 'غير متاح اليوم'}</p>
          <div className="mt-3 rounded-lg bg-clinical-50/70 border border-clinical-100 p-3 min-h-16"><p className="text-xs font-semibold text-ink-600 mb-1">جدول العمل الأسبوعي</p>{doctor.weeklySchedule?.length ? doctor.weeklySchedule.map((entry) => <p key={entry.id || `${entry.dayOfWeek}-${entry.startTime}`} className="text-xs text-ink-500">{weekDays[entry.dayOfWeek]} <span dir="ltr">{formatTime(entry.startTime)} – {formatTime(entry.endTime)}</span></p>) : <p className="text-xs text-ink-400">لا يوجد جدول مسجل</p>}</div>
          {renderActions ? <div className="mt-4">{renderActions(doctor)}</div> : <button type="button" disabled={disabled} onClick={() => onSelect(doctor)} className={`w-full mt-4 font-semibold rounded-lg py-2.5 text-sm ${disabled ? 'bg-red-50 text-red-700 cursor-not-allowed' : selected ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}>{disabled ? 'غير متاح اليوم' : selected ? 'تم اختيار الطبيب' : checkin ? 'اختيار لتسجيل الحضور' : mode === 'manage' ? 'إدارة الطبيب' : 'اختيار الطبيب'}</button>}
        </article>;
      })}
    </div>
  </div>;
}
