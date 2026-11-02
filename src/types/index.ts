export type Gender = 'ذكر' | 'أنثى';

export interface Patient {
  id: string;
  fileNumber: string;
  fullName: string;
  birthDate: string;
  age: number;
  gender?: Gender;
  phone: string;
  email?: string;
  address?: string;
  bloodType?: string;
  allergies?: string[];
  chronicDiseases?: string[];
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  lastVisit?: string;
  avatarColor: string;
  createdAt: string;
  assignedDoctors?: string[];
}

export interface Visit {
  id: string;
  patientId: string;
  date: string;
  type: string;
  doctor: string;
  chiefComplaint?: string;
  symptoms?: string;
  diagnosis: string;
  notes?: string;
  vitals?: {
    bloodPressure?: string;
    heartRate?: string;
    temperature?: string;
    weight?: string;
    height?: string;
  };
  medications?: string;
  followUpDate?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  visitId?: string;
  date: string;
  diagnosis: string;
  medications: { name: string; dosage: string; duration: string }[];
}

export interface Attachment {
  id: string;
  patientId: string;
  name: string;
  type: 'تحليل دم' | 'أشعة' | 'تقرير طبي';
  date: string;
}

export type AppointmentStatus = 'مؤكد' | 'حضر' | 'جاري الكشف' | 'مكتمل' | 'ملغي' | 'لم يحضر';

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  type: string;
  status: AppointmentStatus;
  notes?: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  email: string;
  phone: string;
  clinicName: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// ===== المستخدمون والصلاحيات (متصل بالباك-إند الحقيقي) =====
export type UserRole = 'reception' | 'doctor';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  clinicId: string;
  branchId: string;
  permissions: string[];
  role?: UserRole;
  specialty?: string | null;
}

export type QueueStatus = 'waiting' | 'in_progress' | 'done' | 'cancelled';

export interface QueueEntry {
  id: string;
  patientId: string;
  patientName: string;
  fileNumber: string;
  patientPhone?: string;
  doctorId?: string | null;
  doctorName?: string | null;
  status: QueueStatus;
  note?: string | null;
  checkedInAt: string;
}
