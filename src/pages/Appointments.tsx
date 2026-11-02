import { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronRight, ChevronLeft, Check, X, Calendar, Clock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { useApp } from '../context/AppContext';
import { financeApi, usersApi } from '../lib/api';
import { appointmentSlotsForDate, SpecialtyDoctorGrid, SpecialtyGrid } from '../components/DoctorSelection';
import type { AppointmentStatus } from '../types';
import { formatTime12 } from '../lib/timeFormat';

const todayISO = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone
const appointmentTypes = ['كشف أولي', 'متابعة', 'كشف دوري', 'استشارة'];

function addDays(iso: string, delta: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Appointments() {
  const { patients, appointments, addAppointment, pushToast, currentUser, refreshAppointments, cancelAppointment, rescheduleAppointment, checkinAppointment } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [modalOpen, setModalOpen] = useState(false);
  const [newlyCreatedDate, setNewlyCreatedDate] = useState<string | null>(null);

  // Read date from URL query parameter on mount
  useEffect(() => {
    const urlDate = searchParams.get('date');
    if (urlDate) {
      setSelectedDate(urlDate);
      setSearchParams({}, { replace: true }); // Clean up URL
    }
  }, [searchParams]);

  // Auto-navigate to the newly created appointment's date
  useEffect(() => {
    if (newlyCreatedDate && newlyCreatedDate !== selectedDate) {
      setSelectedDate(newlyCreatedDate);
      setNewlyCreatedDate(null);
    }
  }, [newlyCreatedDate]);

  const [patientId, setPatientId] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState(appointmentTypes[0]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Doctors list for reception
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [bookingAvailability, setBookingAvailability] = useState<boolean | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [prepaymentEnabled, setPrepaymentEnabled] = useState(false);
  const [prepaymentServiceId, setPrepaymentServiceId] = useState('');
  const [prepaymentAmount, setPrepaymentAmount] = useState('');
  const [prepaymentMethod, setPrepaymentMethod] = useState('cash');

  // Reschedule modal state
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(todayISO);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  // Billing is confirmed at check-in, not when an appointment is merely booked.
  const [checkinAppointmentTarget, setCheckinAppointmentTarget] = useState<any | null>(null);
  const [billableServices, setBillableServices] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [checkinServiceId, setCheckinServiceId] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);

  const isReception = currentUser?.role === 'reception';

  // Load doctors for reception
  useEffect(() => {
    if (!isReception) return;
    let active = true;
    setLoadingDoctors(true);
    usersApi.listDoctors()
      .then((rows) => { if (active) setDoctors(rows); })
      .catch((err) => pushToast(err.message || 'تعذّر تحميل قائمة الدكاترة', 'error'))
      .finally(() => { if (active) setLoadingDoctors(false); });
    return () => { active = false; };
  }, [isReception, pushToast]);

  // This is a reception hint only; the backend performs the same validation before saving.
  useEffect(() => {
    if (!isReception || !selectedDoctorId || !selectedDate || !time) {
      setBookingAvailability(null);
      return;
    }
    let active = true;
    setCheckingAvailability(true);
    usersApi.getDoctorAvailability(selectedDoctorId, selectedDate, time)
      .then((result) => { if (active) setBookingAvailability(result.available); })
      .catch(() => { if (active) setBookingAvailability(null); })
      .finally(() => { if (active) setCheckingAvailability(false); });
    return () => { active = false; };
  }, [isReception, selectedDoctorId, selectedDate, time]);

  useEffect(() => {
    if (!prepaymentEnabled) return;
    let active = true;
    financeApi.services()
      .then((services) => { if (active) setBillableServices(services.filter((service) => service.isActive !== false)); })
      .catch((err) => { if (active) pushToast(err.message || 'تعذّر تحميل الخدمات القابلة للفوترة', 'error'); });
    return () => { active = false; };
  }, [prepaymentEnabled, pushToast]);

  const dayAppointments = useMemo(
    () => appointments.filter((a) => a.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, selectedDate],
  );

  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const appointmentSlots = useMemo(() => appointmentSlotsForDate(selectedDoctor, selectedDate), [selectedDoctor, selectedDate]);

  const upcoming = useMemo(
    () => appointments.filter((a) => a.date > todayISO).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6),
    [appointments],
  );

  const statusColorDot: Record<AppointmentStatus, string> = {
    'مؤكد': 'bg-brand-500', 'حضر': 'bg-amber-500', 'جاري الكشف': 'bg-blue-500', 'مكتمل': 'bg-ink-400', 'ملغي': 'bg-red-500', 'لم يحضر': 'bg-gray-500',
  };

  // Handler functions - defined before getActions so they can be referenced
  const openCheckIn = async (appointment: any) => {
    setCheckinAppointmentTarget(appointment);
    setCheckinServiceId('');
    setInitialPayment('0');
    setPaymentMethod('cash');
    setPaymentReference('');
    setLoadingServices(true);
    try {
      const services = await financeApi.services();
      setBillableServices(services.filter((service) => service.isActive !== false));
    } catch (err: any) {
      setBillableServices([]);
      pushToast(err.message || 'تعذّر تحميل الخدمات القابلة للفوترة', 'error');
    } finally {
      setLoadingServices(false);
    }
  };

  const handleCheckIn = async () => {
    if (!checkinAppointmentTarget || !checkinServiceId) return;
    if (initialPayment === '' || Number(initialPayment) < 0) {
      pushToast('أدخل مبلغًا مدفوعًا صحيحًا، ويمكن أن يكون صفرًا', 'error');
      return;
    }
    setCheckinSubmitting(true);
    try {
      const result = await checkinAppointment(checkinAppointmentTarget.id, {
        serviceId: checkinServiceId,
        paymentAmount: initialPayment,
        paymentMethod: Number(initialPayment) > 0 ? paymentMethod : undefined,
        paymentReferenceNumber: Number(initialPayment) > 0 ? paymentReference || undefined : undefined,
      });
      pushToast(result.invoice ? 'تم تسجيل الحضور وإنشاء الفاتورة' : 'تم تسجيل الحضور بنجاح', 'success');
      await refreshAppointments();
      setCheckinAppointmentTarget(null);
    } catch (err: any) {
      pushToast(err.message || 'تعذّر تسجيل الحضور', 'error');
    } finally {
      setCheckinSubmitting(false);
    }
  };

  const handleCancel = async (appointmentId: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا الموعد؟')) return;
    try {
      await cancelAppointment(appointmentId);
      pushToast('تم إلغاء الموعد بنجاح', 'success');
      await refreshAppointments();
    } catch (err: any) {
      pushToast(err.message || 'تعذّر إلغاء الموعد', 'error');
    }
  };

  const handleRescheduleOpen = (appointmentId: string, date: string, time: string) => {
    setRescheduleAppointmentId(appointmentId);
    setRescheduleDate(date);
    setRescheduleTime(time);
    setRescheduleModalOpen(true);
  };

  const handleReschedule = async () => {
    if (!rescheduleAppointmentId) return;
    if (!rescheduleDate || !rescheduleTime) {
      pushToast('يرجى اختيار التاريخ والوقت الجديدين', 'error');
      return;
    }
    setRescheduleSubmitting(true);
    try {
      await rescheduleAppointment(rescheduleAppointmentId, rescheduleDate, rescheduleTime);
      pushToast('تم تأجيل الموعد بنجاح', 'success');
      await refreshAppointments();
      setRescheduleModalOpen(false);
      setRescheduleAppointmentId(null);
    } catch (err: any) {
      pushToast(err.message || 'تعذّر تأجيل الموعد', 'error');
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!patientId || !time) {
      setFormError('يرجى اختيار المريض ووقت الموعد');
      return;
    }
    if (isReception && !selectedDoctorId) {
      setFormError('يرجى اختيار التخصص ثم الدكتور');
      return;
    }
    if (isReception && bookingAvailability === false) {
      setFormError('الدكتور غير متاح في التاريخ والوقت المحددين حسب جدول عمله');
      return;
    }
    if (prepaymentEnabled && (!prepaymentServiceId || !prepaymentAmount)) {
      setFormError('اختيار الخدمة وقيمة المقدم مطلوبان عند تحصيل مقدم حجز');
      return;
    }
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    setSubmitting(true);
    try {
      const newAppointment = await addAppointment({
        patientId: patient.id,
        patientName: patient.fullName,
        date: selectedDate,
        time,
        type,
        status: 'مؤكد',
        notes: notes.trim() || undefined,
        doctorId: isReception ? selectedDoctorId : undefined,
        prepayment: prepaymentEnabled ? { serviceId: prepaymentServiceId, paymentAmount: prepaymentAmount, paymentMethod: prepaymentMethod } : undefined,
      });
      // Ensure appointments list is refreshed from backend (fallback if socket event missed)
      await refreshAppointments();
      // Auto-navigate to the new appointment's date so user sees it immediately
      if (newAppointment?.date) {
        setNewlyCreatedDate(newAppointment.date);
      }
      pushToast(`تم حجز موعد لـ ${patient.fullName} الساعة ${formatTime12(time)}`, 'success');
      setModalOpen(false);
      resetForm();
    } catch (err: any) {
      setFormError(err.message || 'تعذّر حجز الموعد');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine available actions based on appointment status
  const getActions = (appointment: any) => {
    const actions: JSX.Element[] = [];
    const isReception = currentUser?.role === 'reception';

    if (appointment.status === 'مؤكد' && isReception) {
      // Check-in
      actions.push(
        <button
          key="checkin"
          onClick={() => void openCheckIn(appointment)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg transition-colors"
          title="تسجيل الحضور"
        >
          <Check size={12} /> حضر
        </button>
      );
      // Cancel
      actions.push(
        <button
          key="cancel"
          onClick={() => handleCancel(appointment.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors"
          title="إلغاء الموعد"
        >
          <X size={12} /> إلغاء
        </button>
      );
      // Reschedule
      actions.push(
        <button
          key="reschedule"
          onClick={() => handleRescheduleOpen(appointment.id, appointment.date, appointment.time)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors"
          title="تأجيل الموعد"
        >
          <Clock size={12} /> تأجيل
        </button>
      );
    }
    return actions;
  };

  const resetForm = () => {
    setPatientId(''); setTime(''); setType(appointmentTypes[0]); setNotes(''); setFormError(''); setSelectedDoctorId(''); setSelectedSpecialty(''); setBookingAvailability(null); setPrepaymentEnabled(false); setPrepaymentServiceId(''); setPrepaymentAmount(''); setPrepaymentMethod('cash');
  };

  return (
    <Layout title="المواعيد">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-ink-800">إدارة المواعيد</h2>
          <p className="text-sm text-ink-400 mt-0.5">{appointments.length} موعدًا مسجلًا</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="sm:mr-auto inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors shrink-0"
        >
          <Plus size={16} />
          حجز موعد جديد
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl2 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setSelectedDate((d) => addDays(d, -1))} className="p-1.5 rounded-md hover:bg-ink-50 text-ink-500">
              <ChevronRight size={18} />
            </button>
            <div className="text-center">
              <p className="font-bold text-ink-800">{formatDay(selectedDate)}</p>
              {selectedDate === todayISO && <p className="text-xs text-brand-600 font-medium">اليوم</p>}
            </div>
            <button onClick={() => setSelectedDate((d) => addDays(d, 1))} className="p-1.5 rounded-md hover:bg-ink-50 text-ink-500">
              <ChevronLeft size={18} />
            </button>
          </div>

          {dayAppointments.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-ink-500 text-sm font-medium">لا توجد مواعيد في هذا اليوم</p>
              <button onClick={() => setModalOpen(true)} className="mt-3 text-brand-600 font-medium text-sm">
                حجز موعد جديد
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {dayAppointments.map((a) => (
                <div key={a.id} className="clinic-row flex items-center gap-4 py-4 px-3 hover:bg-clinical-50/50 transition-colors">
                  <div className="w-14 text-sm font-semibold text-ink-700 tabular-nums shrink-0" dir="ltr">{formatTime12(a.time)}</div>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${statusColorDot[a.status]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800 truncate">{a.patientName}</p>
                    <p className="text-xs text-ink-400">{a.type}</p>
                  </div>
                  <StatusBadge status={a.status} />
                  {isReception && getActions(a)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl2 shadow-card p-5">
          <h3 className="font-bold text-ink-800 mb-4">المواعيد القادمة</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">لا توجد مواعيد قادمة</p>
          ) : (
          <div className="divide-y divide-ink-200">
            {upcoming.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className={`w-1.5 h-8 rounded-full shrink-0 ${statusColorDot[a.status]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800 truncate">{a.patientName}</p>
                    <p className="text-xs text-ink-400">{formatDay(a.date)} · {formatTime12(a.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title="حجز موعد جديد">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">المريض</label>
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200">
              <option value="">اختر المريض</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} — {p.fileNumber}</option>)}
            </select>
          </div>
          {isReception && patientId && !selectedSpecialty && <div><label className="block text-sm font-medium text-ink-600 mb-2">اختيار التخصص *</label>{loadingDoctors ? <p className="text-sm text-ink-400 py-6 text-center">جارِ تحميل التخصصات...</p> : <SpecialtyGrid doctors={doctors} onSelect={(specialty) => { setSelectedSpecialty(specialty); setSelectedDoctorId(''); setTime(''); }} />}</div>}
          {isReception && patientId && selectedSpecialty && !selectedDoctorId && <SpecialtyDoctorGrid specialty={selectedSpecialty} doctors={doctors} mode="appointment" onBack={() => setSelectedSpecialty('')} onSelect={(doctor) => { setSelectedDoctorId(doctor.id); setTime(''); }} />}
          {isReception && selectedDoctorId && <div className="flex items-center justify-between rounded-lg bg-clinical-50 border border-clinical-100 px-3 py-2"><p className="text-sm font-semibold text-ink-700">{selectedSpecialty} ← {selectedDoctor?.fullName}</p><button type="button" onClick={() => { setSelectedDoctorId(''); setTime(''); }} className="text-xs text-brand-700 font-semibold">تغيير الطبيب</button></div>}
          {(!isReception || selectedDoctorId) && <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1.5">التاريخ</label>
              <input type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setTime(''); }} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-600 mb-1.5">الوقت المتاح</label>
              {isReception ? appointmentSlots.length > 0 ? <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{appointmentSlots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} className={`rounded-lg border px-2 py-2 text-sm tabular-nums ${time === slot ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-ink-200 text-ink-600 hover:border-brand-300'}`} dir="ltr">{formatTime12(slot)}</button>)}</div> : <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">لا توجد فترة عمل مسجلة لهذا الطبيب في التاريخ المحدد.</p> : <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />}
            </div>
          </div>}
          {checkingAvailability && <p className="text-xs text-ink-400">جارِ التحقق من توفر الطبيب...</p>}
          {bookingAvailability === true && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">الطبيب يعمل في التاريخ والوقت المحددين.</p>}
          {bookingAvailability === false && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">الطبيب غير متاح في هذا التاريخ أو الوقت حسب جدوله الأسبوعي.</p>}
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">نوع الموعد</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm">
              {appointmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          {isReception && <div className="rounded-lg border border-clinical-100 bg-clinical-50/50 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-700 cursor-pointer"><input type="checkbox" checked={prepaymentEnabled} onChange={(e) => setPrepaymentEnabled(e.target.checked)} /> تحصيل مقدم عند الحجز</label>
            {prepaymentEnabled && <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <select value={prepaymentServiceId} onChange={(e) => setPrepaymentServiceId(e.target.value)} className="bg-white border border-ink-100 rounded-lg px-3 py-2.5 text-sm"><option value="">الخدمة</option>{billableServices.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.price} ج.م</option>)}</select>
              <input type="number" min="0.01" step="0.01" value={prepaymentAmount} onChange={(e) => setPrepaymentAmount(e.target.value)} placeholder="قيمة المقدم" className="bg-white border border-ink-100 rounded-lg px-3 py-2.5 text-sm" />
              <select value={prepaymentMethod} onChange={(e) => setPrepaymentMethod(e.target.value)} className="bg-white border border-ink-100 rounded-lg px-3 py-2.5 text-sm"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="instapay">InstaPay</option><option value="transfer">تحويل</option></select>
            </div>}
          </div>}
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={submitting || bookingAvailability === false || checkingAvailability} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold rounded-lg py-2.5 text-sm">
              {submitting ? 'جارِ الحجز...' : 'حجز الموعد'}
            </button>
            <button type="button" onClick={() => { setModalOpen(false); resetForm(); }} className="flex-1 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg py-2.5 text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!checkinAppointmentTarget} onClose={() => !checkinSubmitting && setCheckinAppointmentTarget(null)} title="تسجيل الحضور والتحصيل">
        <div className="space-y-4">
          <p className="text-sm text-ink-600">يتم إنشاء فاتورة الخدمة عند تأكيد حضور المريض، وليس عند حجز الموعد.</p>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الخدمة المؤكدة *</label>
            <select value={checkinServiceId} onChange={(e) => setCheckinServiceId(e.target.value)} disabled={loadingServices || checkinSubmitting} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm">
              <option value="">{loadingServices ? 'جارِ تحميل الخدمات...' : 'اختر الخدمة'}</option>
              {billableServices.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.price} ج.م</option>)}
            </select>
            {!loadingServices && billableServices.length === 0 && <p className="text-xs text-red-600 mt-1.5">لا توجد خدمات نشطة قابلة للفوترة.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">المبلغ المدفوع الآن *</label>
            <input type="number" min="0" step="0.01" value={initialPayment} onChange={(e) => setInitialPayment(e.target.value)} disabled={checkinSubmitting} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          {Number(initialPayment || '0') > 0 && <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-ink-600 mb-1.5">طريقة الدفع</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="instapay">InstaPay</option><option value="transfer">تحويل</option></select></div>
            <div><label className="block text-sm font-medium text-ink-600 mb-1.5">مرجع الدفع</label><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" /></div>
          </div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleCheckIn} disabled={!checkinServiceId || checkinSubmitting || loadingServices} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold rounded-lg py-2.5 text-sm">{checkinSubmitting ? 'جارِ التسجيل...' : 'تأكيد الحضور وإنشاء الفاتورة'}</button>
            <button type="button" onClick={() => setCheckinAppointmentTarget(null)} disabled={checkinSubmitting} className="flex-1 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg py-2.5 text-sm">إلغاء</button>
          </div>
        </div>
      </Modal>

      {/* Reschedule Modal */}
      <Modal open={rescheduleModalOpen} onClose={() => { setRescheduleModalOpen(false); setRescheduleAppointmentId(null); }} title="تأجيل الموعد">
        <form onSubmit={handleReschedule} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">التاريخ الجديد *</label>
            <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} min={todayISO} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-600 mb-1.5">الوقت الجديد *</label>
            <input type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} className="w-full bg-ink-50 border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={rescheduleSubmitting} className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white font-semibold rounded-lg py-2.5 text-sm">
              {rescheduleSubmitting ? 'جارِ التأجيل...' : 'تأجيل الموعد'}
            </button>
            <button type="button" onClick={() => { setRescheduleModalOpen(false); setRescheduleAppointmentId(null); }} className="flex-1 border border-ink-200 text-ink-600 hover:bg-ink-50 font-semibold rounded-lg py-2.5 text-sm">
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
