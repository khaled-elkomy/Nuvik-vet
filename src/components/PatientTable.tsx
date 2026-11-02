import { useNavigate } from 'react-router-dom';
import { Eye, Users, CalendarPlus, ClipboardList } from 'lucide-react';
import type { Patient } from '../types';

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface PatientTableProps {
  patients: Patient[];
  isReception?: boolean;
}

export default function PatientTable({ patients, isReception = false }: PatientTableProps) {
  const navigate = useNavigate();

  if (patients.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-500 font-medium">لا يوجد مرضى مطابقون للبحث</p>
        <p className="text-ink-400 text-sm mt-1">جرّب تعديل كلمات البحث أو الفلاتر المستخدمة</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-400 text-xs border-b border-ink-200 bg-ink-50/50">
            <th className="text-right font-medium py-3.5 px-4">الاسم</th>
            <th className="text-right font-medium py-3.5 px-4 hidden sm:table-cell">رقم الملف</th>
            <th className="text-right font-medium py-3.5 px-4 hidden md:table-cell">العمر</th>
            <th className="text-right font-medium py-3.5 px-4 hidden md:table-cell">رقم الهاتف</th>
            {isReception && <th className="text-right font-medium py-3.5 px-4 hidden lg:table-cell">الطبيب المعين</th>}
            <th className="text-right font-medium py-3.5 px-4 hidden lg:table-cell">آخر زيارة</th>
            <th className="text-right font-medium py-3.5 px-4 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr
              key={p.id}
              onClick={() => navigate(`/patients/${p.id}`)}
              className="clinic-row hover:bg-clinical-50/60 cursor-pointer transition-colors"
            >
              <td className="py-4 px-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: p.avatarColor }}
                  >
                    {p.fullName.split(' ')[0][0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-800 truncate">{p.fullName}</p>
                    <p className="text-xs text-ink-400 sm:hidden">{p.fileNumber}</p>
                  </div>
                </div>
              </td>
              <td className="py-4 px-4 text-ink-500 hidden sm:table-cell">{p.fileNumber}</td>
              <td className="py-4 px-4 text-ink-500 hidden md:table-cell">{p.age} سنة</td>
              <td className="py-4 px-4 text-ink-500 hidden md:table-cell" dir="ltr">{p.phone}</td>
              {isReception && (
                <td className="py-4 px-4 text-ink-500 hidden lg:table-cell">
                  {p.assignedDoctors && p.assignedDoctors.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 rounded-full px-2 py-1">
                      <Users size={11} /> {p.assignedDoctors.join('، ')}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-400">غير معين</span>
                  )}
                </td>
              )}
              <td className="py-4 px-4 text-ink-500 hidden lg:table-cell">{formatDate(p.lastVisit)}</td>
              <td className="py-4 px-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/patients/${p.id}`); }}
                    className="text-ink-400 hover:text-brand-600 p-1.5 rounded-md hover:bg-brand-50"
                    title="عرض الملف"
                  >
                    <Eye size={16} />
                  </button>
{isReception && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/patients/${p.id}/checkin`); }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg transition-colors"
                    title="تسجيل حضور"
                  >
                    <ClipboardList size={12} /> تسجيل حضور
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/patients/${p.id}/appointment`); }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-100 text-brand-700 hover:bg-brand-200 rounded-lg transition-colors"
                    title="حجز موعد"
                  >
                    <CalendarPlus size={12} /> حجز موعد
                  </button>
                </div>
              )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
