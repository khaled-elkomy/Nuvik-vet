import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Patient, Appointment, ToastMessage, AuthUser, UserRole, AppointmentStatus } from '../types';
import { authApi, patientsApi, appointmentsApi, queueApi, setAuthToken, getAuthToken, type CheckInBilling } from '../lib/api';
import { reidentifySocket, getSocket } from '../lib/socket';
import { formatTime12 } from '../lib/timeFormat';
import { ageFromBirthDate } from '../lib/age';

interface AppContextValue {
  // ===== المصادقة والصلاحيات (متصلة بالالباك-إند الحقيقي) =====
  authLoading: boolean;
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  login: (email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;

  // ===== المرضى (لريسبشن فقط - محفوظ محليًا، للدكتور يتم جلبهم عبر API في الصفحات) =====
  patients: Patient[];
  patientsLoading: boolean;
  refreshPatients: () => Promise<void>;
  addPatient: (data: Omit<Patient, 'id' | 'fileNumber' | 'avatarColor' | 'createdAt' | 'age'>) => Promise<Patient>;
  getPatient: (id: string) => Patient | undefined;

  // ===== المواعيد (متصلة بالباك-إند الحقيقي) =====
  appointments: Appointment[];
  appointmentsLoading: boolean;
  refreshAppointments: () => Promise<void>;
  addAppointment: (data: {
    patientId: string;
    patientName: string;
    date: string;
    time: string;
    type: string;
    status: AppointmentStatus;
    notes?: string;
    doctorId?: string;
    prepayment?: CheckInBilling;
  }) => Promise<Appointment>;
  cancelAppointment: (appointmentId: string) => Promise<Appointment>;
  rescheduleAppointment: (appointmentId: string, newDate: string, newTime: string) => Promise<Appointment>;
  checkinAppointment: (appointmentId: string, billing?: CheckInBilling) => Promise<{ appointment: Appointment; queueEntry: any; invoice?: any }>;

  // ===== الإشعارات =====
  toasts: ToastMessage[];
  pushToast: (message: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const avatarPalette = ['#146C5E', '#2F8267', '#B8763A', '#5F726D', '#0F5A4E', '#4D9F83'];

function mapApiPatient(row: any, index = 0): Patient {
  return {
    id: row.id,
    fileNumber: row.fileNumber,
    fullName: row.fullName,
    birthDate: (row.birthDate || '').slice(0, 10),
    age: ageFromBirthDate(row.birthDate),
    gender: row.gender ?? undefined,
    phone: row.phone,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    bloodType: row.bloodType ?? undefined,
    allergies: row.allergies ?? [],
    chronicDiseases: row.chronicDiseases ?? [],
    emergencyContactName: row.emergencyContactName ?? undefined,
    emergencyContactPhone: row.emergencyContactPhone ?? undefined,
    notes: row.notes ?? undefined,
    lastVisit: row.lastVisit ? String(row.lastVisit).slice(0, 10) : undefined,
    avatarColor: avatarPalette[index % avatarPalette.length],
    createdAt: String(row.createdAt).slice(0, 10),
  };
}

function mapApiAppointment(row: any): Appointment {
  return {
    id: row.id,
    patientId: row.patientId,
    patientName: row.patientName,
    date: row.date,
    time: row.time,
    type: row.type,
    status: row.status,
    notes: row.notes,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshPatients = useCallback(async () => {
    if (currentUser?.role !== 'reception' && currentUser?.role !== 'doctor') return;
    setPatientsLoading(true);
    try {
      const rows = await patientsApi.list();
      setPatients(rows.map((r, i) => mapApiPatient(r, i)));
    } catch (err: any) {
      pushToast(err.message || 'تعذّر تحميل قائمة المرضى من السيرفر', 'error');
    } finally {
      setPatientsLoading(false);
    }
  }, [currentUser?.role, pushToast]);

  const refreshAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    try {
      const rows = await appointmentsApi.list();
      setAppointments(rows.map(mapApiAppointment));
    } catch (err: any) {
      pushToast(err.message || 'تعذّر تحميل المواعيد من السيرفر', 'error');
    } finally {
      setAppointmentsLoading(false);
    }
  }, [pushToast]);

  // عند فتح التطبيق: لو فيه توكن محفوظ، نتحقق منه ونرجّع الجلسة تلقائيًا
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ user }) => setCurrentUser(user))
      .catch(() => setAuthToken(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // بعد تسجيل الدخول (أو رجوع الجلسة) - الريسبشن يحمل قائمة المرضى، الدكتور يحمل مرضاه المعينين
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'reception' || currentUser.role === 'doctor') {
        refreshPatients();
      }
      refreshAppointments();
      reidentifySocket();
    }
  }, [currentUser, refreshPatients, refreshAppointments]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();

    const handleQueueNew = (entry: any) => {
      // Queue updates handled in WaitingRoom, but we can refresh appointments if needed
      pushToast(`مريض جديد في الانتظار: ${entry.patientName}`, 'info');
    };

    const handleQueueUpdate = (entry: any) => {
      // Queue status updates
    };

    const handleAppointmentCreated = (appointment: any) => {
      const mapped = mapApiAppointment(appointment);
      setAppointments((prev) => [mapped, ...prev]);
      pushToast(`موعد جديد: ${mapped.patientName} الساعة ${formatTime12(mapped.time)}`, 'info');
    };

    const handleAppointmentUpdated = (appointment: any) => {
      const mapped = mapApiAppointment(appointment);
      setAppointments((prev) => prev.map((a) => (a.id === mapped.id ? mapped : a)));
    };

    socket.on('queue:new', handleQueueNew);
    socket.on('queue:update', handleQueueUpdate);
    socket.on('appointment:created', handleAppointmentCreated);
    socket.on('appointment:updated', handleAppointmentUpdated);

    return () => {
      socket.off('queue:new', handleQueueNew);
      socket.off('queue:update', handleQueueUpdate);
      socket.off('appointment:created', handleAppointmentCreated);
      socket.off('appointment:updated', handleAppointmentUpdated);
    };
  }, [currentUser, pushToast]);

  const login = useCallback(async (email: string, password: string, role: UserRole) => {
    const { token, user } = await authApi.login(email, password, role);
    setAuthToken(token);
    setCurrentUser(user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setCurrentUser(null);
    setPatients([]);
    setAppointments([]);
  }, []);

  const addPatient: AppContextValue['addPatient'] = useCallback(async (data) => {
    const created = await patientsApi.create(data);
    const patient = mapApiPatient(created, patients.length);
    setPatients((prev) => [patient, ...prev]);
    return patient;
  }, [patients.length]);

  const getPatient = useCallback((id: string) => patients.find((p) => p.id === id), [patients]);

  const addAppointment: AppContextValue['addAppointment'] = useCallback(async (data) => {
    const payload: any = {
      patientId: data.patientId,
      date: data.date,
      time: data.time,
      type: data.type,
      notes: data.notes,
      prepayment: data.prepayment,
    };
    // For reception, doctorId must be provided; for doctor, backend sets it automatically
    if (currentUser?.role === 'reception' && data.doctorId) {
      payload.doctorId = data.doctorId;
    }

    const created = await appointmentsApi.create(payload);
    const appointment = mapApiAppointment(created);
    setAppointments((prev) => [appointment, ...prev]);

    // Backend creates/updates patient_doctors relationship — refresh patient list so doctor can access the patient
    await refreshPatients();

    return appointment;
  }, [currentUser?.role, refreshPatients]);

  const checkinAppointment: AppContextValue['checkinAppointment'] = useCallback(async (appointmentId: string, billing?: CheckInBilling) => {
    const data = await appointmentsApi.checkin(appointmentId, billing);
    await Promise.all([refreshAppointments(), refreshPatients()]);
    return data;
  }, [refreshAppointments, refreshPatients]);

  const cancelAppointment: AppContextValue['cancelAppointment'] = useCallback(async (appointmentId: string) => {
    const data = await appointmentsApi.cancel(appointmentId);
    await refreshAppointments();
    return data;
  }, [refreshAppointments]);

  const rescheduleAppointment: AppContextValue['rescheduleAppointment'] = useCallback(async (appointmentId: string, newDate: string, newTime: string) => {
    const data = await appointmentsApi.reschedule(appointmentId, newDate, newTime);
    await refreshAppointments();
    return data;
  }, [refreshAppointments]);

  const value = useMemo<AppContextValue>(() => ({
    authLoading, isAuthenticated: !!currentUser, currentUser, login, logout,
    patients, patientsLoading, refreshPatients, addPatient, getPatient,
    appointments, appointmentsLoading, refreshAppointments, addAppointment, cancelAppointment, rescheduleAppointment, checkinAppointment,
    toasts, pushToast, dismissToast,
  }), [authLoading, currentUser, login, logout, patients, patientsLoading, refreshPatients,
      addPatient, getPatient, appointments, appointmentsLoading, refreshAppointments, addAppointment, cancelAppointment, rescheduleAppointment, checkinAppointment, toasts, pushToast, dismissToast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
