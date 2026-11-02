import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Patient, Appointment, ToastMessage, AuthUser, AppointmentStatus } from '../types';
import { authApi, setAuthToken, getAuthToken, type CheckInBilling } from '../lib/api';

interface AppContextValue {
  authLoading: boolean;
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  login: (email: string, password: string, clinicCode?: string) => Promise<void>;
  logout: () => void;
  refreshCurrentUser: () => Promise<void>;
  patients: Patient[];
  patientsLoading: boolean;
  refreshPatients: () => Promise<void>;
  addPatient: (data: Omit<Patient, 'id' | 'fileNumber' | 'avatarColor' | 'createdAt' | 'age'>) => Promise<Patient>;
  getPatient: (id: string) => Patient | undefined;
  appointments: Appointment[];
  appointmentsLoading: boolean;
  refreshAppointments: () => Promise<void>;
  addAppointment: (data: { patientId: string; patientName: string; date: string; time: string; type: string; status: AppointmentStatus; notes?: string; doctorId?: string; prepayment?: CheckInBilling }) => Promise<Appointment>;
  cancelAppointment: (appointmentId: string) => Promise<Appointment>;
  rescheduleAppointment: (appointmentId: string, newDate: string, newTime: string) => Promise<Appointment>;
  checkinAppointment: (appointmentId: string, billing?: CheckInBilling) => Promise<{ appointment: Appointment; queueEntry: any; invoice?: any }>;
  toasts: ToastMessage[];
  pushToast: (message: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);
const notReady = async (): Promise<never> => { throw new Error('هذه الوحدة لم تُفعّل في نسخة Nuvik Vet الحالية'); };

export function AppProvider({ children }: { children: ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((previous) => [...previous, { id, message, type }]);
    window.setTimeout(() => setToasts((previous) => previous.filter((toast) => toast.id !== id)), 3500);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((previous) => previous.filter((toast) => toast.id !== id)), []);

  useEffect(() => {
    if (!getAuthToken()) { setAuthLoading(false); return; }
    authApi.me().then(({ user }) => {
      setCurrentUser({ ...user, fullName: user.displayName });
    }).catch(() => setAuthToken(null)).finally(() => setAuthLoading(false));
  }, []);

  const login = async (email: string, password: string, clinicCode?: string) => {
    const { token, user } = await authApi.login(email, password, clinicCode);
    setAuthToken(token);
    setCurrentUser({ ...user, fullName: user.displayName });
  };
  const refreshCurrentUser = async () => {
    if (!getAuthToken()) return;
    const { user } = await authApi.me();
    setCurrentUser({ ...user, fullName: user.displayName });
  };
  const logout = () => { setAuthToken(null); setCurrentUser(null); };

  const value = useMemo<AppContextValue>(() => ({
    authLoading, isAuthenticated: !!currentUser, currentUser, login, logout, refreshCurrentUser,
    patients: [], patientsLoading: false, refreshPatients: async () => {},
    addPatient: () => notReady(), getPatient: () => undefined,
    appointments: [], appointmentsLoading: false, refreshAppointments: async () => {},
    addAppointment: () => notReady(), cancelAppointment: () => notReady(),
    rescheduleAppointment: () => notReady(), checkinAppointment: () => notReady(),
    toasts, pushToast, dismissToast,
  }), [authLoading, currentUser, login, logout, refreshCurrentUser, pushToast, dismissToast, toasts]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
