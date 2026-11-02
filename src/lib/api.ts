// Nuvik Vet API; Vite and Nginx proxy /api to the isolated API service.

const API_URL = import.meta.env.VITE_API_URL || '/api';
const AUTH_STORAGE_KEY = import.meta.env.VITE_AUTH_STORAGE_KEY || 'nuvik_vet_auth_token';

let authToken: string | null = localStorage.getItem(AUTH_STORAGE_KEY);

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem(AUTH_STORAGE_KEY, token);
  else localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getAuthToken() {
  return authToken;
}

class ApiError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    // فشل الـ fetch نفسه (مش رد بخطأ) بيعني غالبًا: السيرفر مش شغال، أو البورت غلط،
    // أو الـ CORS رافض الاتصال — رسالة واضحة بدل "Server Connection Error" غامضة
    throw new ApiError(`تعذّر الاتصال بالسيرفر على ${API_URL} — تأكد إن الباك-إند شغال وعلى نفس العنوان في ملف .env`);
  }

  if (!res.ok) {
    let message = 'حدث خطأ في الاتصال بالسيرفر';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // تجاهل — مفيش body صالح
    }
    throw new ApiError(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** الملفات المحمية (مرفقات المريض / صور الروشتات) بنجيبها كـ Blob بالتوكن بدل رابط مباشر عام */
export async function fetchAuthedBlobUrl(apiPath: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_URL}${apiPath.replace(/^\/api/, '')}`, { headers });
  if (!res.ok) throw new ApiError('تعذّر تحميل الملف');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ===== Auth =====
export const authApi = {
  login: (email: string, password: string, clinicCode?: string) =>
    request<{ token: string; user: { id: string; displayName: string; email: string; clinicId: string; branchId: string; permissions: string[] } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, clinicCode }),
    }),
  me: () => request<{ user: any }>('/auth/me'),
};

export const usersAdminApi = {
  list: () => request<any[]>('/users'),
  create: (data: { displayName: string; email: string; password: string }) =>
    request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  assignRole: (userId: string, roleCode: string) =>
    request<void>(`/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ roleCode }) }),
  removeRole: (userId: string, roleCode: string) => request<void>(`/users/${userId}/roles/${encodeURIComponent(roleCode)}`, { method: 'DELETE' }),
  deactivate: (userId: string) => request<void>(`/users/${userId}/deactivate`, { method: 'PATCH' }),
  update: (userId: string, data: { displayName?: string; active?: boolean }) => request<any>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resetPassword: (userId: string, password: string) => request<void>(`/users/${userId}/password-reset`, { method: 'POST', body: JSON.stringify({ password }) }),
};

export const customersApi = {
  list: (q = '') => request<any[]>(`/customers?q=${encodeURIComponent(q)}`),
  get: (id: string) => request<any>(`/customers/${encodeURIComponent(id)}`),
  create: (data: any) => request<any>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivate: (id: string) => request<void>(`/customers/${encodeURIComponent(id)}/deactivate`, { method: 'PATCH' }),
};

export const animalsApi = {
  list: (q = '', customerId = '') => request<any[]>(`/animals?q=${encodeURIComponent(q)}&customerId=${encodeURIComponent(customerId)}`),
  get: (id: string) => request<any>(`/animals/${encodeURIComponent(id)}`),
  create: (data: any) => request<any>('/animals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/animals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivate: (id: string) => request<void>(`/animals/${encodeURIComponent(id)}/deactivate`, { method: 'PATCH' }),
};

export const speciesApi = {
  list: () => request<any[]>('/species'),
  create: (data: { code: string; label: string }) => request<any>('/species', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { code?: string; label?: string }) => request<any>(`/species/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  breeds: (id: string) => request<any[]>(`/species/${encodeURIComponent(id)}/breeds`),
  createBreed: (id: string, data: { code: string; label: string }) => request<any>(`/species/${encodeURIComponent(id)}/breeds`, { method: 'POST', body: JSON.stringify(data) }),
  updateBreed: (id: string, data: { code?: string; label?: string }) => request<any>(`/breeds/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export const catalogApi = {
  products: (q = '') => request<any[]>(`/products?q=${encodeURIComponent(q)}`),
  product: (id: string) => request<any>(`/products/${encodeURIComponent(id)}`),
  barcode: (barcode: string) => request<any>(`/products/barcode/${encodeURIComponent(barcode)}`),
  lots: (variantId: string) => request<any[]>(`/variants/${encodeURIComponent(variantId)}/lots`),
  createProduct: (data: any) => request<any>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: any) => request<any>(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivateProduct: (id: string) => request<void>(`/products/${encodeURIComponent(id)}/deactivate`, { method: 'PATCH' }),
  addVariant: (id: string, data: any) => request<any>(`/products/${encodeURIComponent(id)}/variants`, { method: 'POST', body: JSON.stringify(data) }),
  openingStock: (variantId: string, data: any) => request<any>(`/products/${encodeURIComponent(variantId)}/opening-stock`, { method: 'POST', body: JSON.stringify(data) }),
};

export const posApi = {
  shift: () => request<any>('/pos/shift'),
  shifts: (date = '') => request<any[]>(`/pos/shifts${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  shiftDetail: (id: string) => request<any>(`/pos/shifts/${encodeURIComponent(id)}`),
  openShift: (openingCash: string) => request<any>('/pos/shifts/open', { method: 'POST', body: JSON.stringify({ openingCash }) }),
  closeShift: (shiftId: string, countedCash: string) => request<any>(`/pos/shifts/${encodeURIComponent(shiftId)}/close`, { method: 'POST', body: JSON.stringify({ countedCash }) }),
  finalizeSale: (data: any, idempotencyKey: string) => request<any>('/pos/sales', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(data) }),
  invoices: (q = '') => request<any[]>(`/invoices?q=${encodeURIComponent(q)}`),
  invoice: (id: string) => request<any>(`/invoices/${encodeURIComponent(id)}`),
  balance: (customerId: string) => request<{ balance: string; currency: string }>(`/customers/${encodeURIComponent(customerId)}/balance`),
  openInvoices: (customerId: string) => request<any[]>(`/customers/${encodeURIComponent(customerId)}/open-invoices`),
  receivePayment: (customerId: string, data: { amount: string; method: string }, key?: string) => request<any>(`/customers/${encodeURIComponent(customerId)}/receive-payment`, { method: 'POST', headers: key ? { 'Idempotency-Key': key } : undefined, body: JSON.stringify(data) }),
};

// ===== Patients =====
export const patientsApi = {
  list: (q?: string) => request<any[]>(`/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id: string) => request<any>(`/patients/${id}`),
  create: (data: any) => request<any>('/patients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request<any>(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  assignDoctor: (patientId: string, doctorId: string) => request<any>(`/patients/${patientId}/doctors`, { method: 'POST', body: JSON.stringify({ doctorId }) }),
  checkDuplicate: (data: { fullName: string; birthDate: string; phone: string; email?: string }) => 
    request<any>('/patients/check-duplicate', { method: 'POST', body: JSON.stringify(data) }),
};

// ===== Visits =====
export const visitsApi = {
  listByPatient: (patientId: string) => request<any[]>(`/visits/patient/${patientId}`),
  create: (data: any) => request<any>('/visits', { method: 'POST', body: JSON.stringify(data) }),
};

// ===== Prescriptions =====
export const prescriptionsApi = {
  listByPatient: (patientId: string) => request<any[]>(`/prescriptions/patient/${patientId}`),
  create: (data: { patientId: string; diagnosis: string; medications: { name: string; dosage: string; duration: string }[]; instructions?: string; date?: string }) =>
    request<any>('/prescriptions', { method: 'POST', body: JSON.stringify(data) }),
};

// ===== Medical records (patient-level history, operations, investigations) =====
export const medicalRecordsApi = {
  listHistory: (patientId: string) => request<any[]>(`/medical-records/history/patient/${patientId}`),
  createHistory: (data: { patientId: string; title: string; description: string; knownDate?: string }) => request<any>('/medical-records/history', { method: 'POST', body: JSON.stringify(data) }),
  updateHistory: (id: string, data: any) => request<any>(`/medical-records/history/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteHistory: (id: string) => request<void>(`/medical-records/history/${id}`, { method: 'DELETE' }),
  listOperations: (patientId: string) => request<any[]>(`/medical-records/operations/patient/${patientId}`),
  createOperation: (data: any) => request<any>('/medical-records/operations', { method: 'POST', body: JSON.stringify(data) }),
  updateOperation: (id: string, data: any) => request<any>(`/medical-records/operations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteOperation: (id: string) => request<void>(`/medical-records/operations/${id}`, { method: 'DELETE' }),
  listInvestigationTypes: () => request<any[]>('/medical-records/investigation-types'),
  listInvestigations: (patientId: string) => request<any[]>(`/medical-records/investigations/patient/${patientId}`),
  createInvestigation: (data: { patientId: string; investigationTypeId: string; notes?: string }) => request<any>('/medical-records/investigations', { method: 'POST', body: JSON.stringify(data) }),
  updateInvestigation: (id: string, data: any) => request<any>(`/medical-records/investigations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ===== Attachments =====
export const attachmentsApi = {
  listByPatient: (patientId: string) => request<any[]>(`/attachments/patient/${patientId}`),
  upload: (patientId: string, file: File, type: string, name: string, investigationId?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    form.append('name', name);
    if (investigationId) form.append('investigationId', investigationId);
    return request<any>(`/attachments/patient/${patientId}`, { method: 'POST', body: form });
  },
  fetchFileBlobUrl: fetchAuthedBlobUrl,
};

// ===== Users (ملف الطبيب + إدارة الحسابات) =====
export const usersApi = {
  me: () => request<any>('/users/me'),
  updateMe: (data: any) => request<any>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<any>('/users/me/logo', { method: 'POST', body: form });
  },
  list: () => request<any[]>('/users'),
  /** قائمة الدكاترة بالصور والتخصصات — لشبكة اختيار الدكتور عند الريسبشن */
  listDoctors: () => request<any[]>('/users/doctors'),
  listDoctorsGrouped: () => request<{ specialty: string; doctors: any[] }[]>('/users/doctors/grouped'),
  getDoctorSchedule: (doctorId: string) => request<any[]>(`/users/doctors/${doctorId}/schedule`),
  replaceDoctorSchedule: (doctorId: string, entries: { dayOfWeek: number; startTime: string; endTime: string }[]) =>
    request<any[]>(`/users/doctors/${doctorId}/schedule`, { method: 'PUT', body: JSON.stringify({ entries }) }),
  getDoctorAvailability: (doctorId: string, date: string, time?: string) =>
    request<{ available: boolean }>(`/users/doctors/${doctorId}/availability?date=${encodeURIComponent(date)}${time ? `&time=${encodeURIComponent(time)}` : ''}`),
  register: (data: { fullName: string; email: string; password: string; role: 'reception' | 'doctor'; specialty?: string; phone?: string }) =>
    request<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  // إدارة الدكاترة للريسبشن
  listAllDoctors: () => request<any[]>('/users/doctors/manage'),
  createDoctor: (data: { fullName: string; email: string; password: string; specialty: string; phone?: string; clinicAddress?: string }) =>
    request<any>('/users/doctors/manage', { method: 'POST', body: JSON.stringify(data) }),
  updateDoctor: (id: string, data: { fullName?: string; specialty?: string; phone?: string; clinicAddress?: string; isActive?: boolean }) =>
    request<any>(`/users/doctors/manage/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ===== Prescription Images (الروشتة المرسومة بالـ Canvas) =====
export const prescriptionImagesApi = {
  listByPatient: (patientId: string) => request<any[]>(`/prescription-images/patient/${patientId}`),
  upload: (patientId: string, sections: { medications: Blob; instructions?: Blob | null; investigations?: Blob | null }) => {
    const form = new FormData();
    form.append('medications', sections.medications, 'medications.png');
    if (sections.instructions) form.append('instructions', sections.instructions, 'instructions.png');
    if (sections.investigations) form.append('investigations', sections.investigations, 'investigations.png');
    return request<any>(`/prescription-images/patient/${patientId}`, { method: 'POST', body: form });
  },
  fetchImageBlobUrl: fetchAuthedBlobUrl,
  getShareUrl: (id: string) => request<{ shareUrl: string }>(`/prescription-images/${id}/share`, { method: 'POST' }),
};

// ===== Queue (قائمة الانتظار) =====
export const queueApi = {
  list: () => request<any[]>('/queue'),
  /** doctorId بقى إلزامي — كل مريض لازم يتوجّه لدكتور بعينه وقت الاستقبال */
  checkIn: (patientId: string, doctorId: string, note?: string, billing?: CheckInBilling) =>
    request<any>('/queue', { method: 'POST', body: JSON.stringify({ patientId, doctorId, note, ...billing }) }),
  updateStatus: (id: string, status: string) =>
    request<any>(`/queue/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  /** التحقق من وجود فحص نشط للمريض مع الدكتور الحالي */
  hasActiveExamination: (patientId: string) =>
    request<{ hasActive: boolean }>(`/queue/check-active/${patientId}`),
};

// ===== Appointments =====
export type CheckInBilling = {
  serviceId?: string;
  paymentAmount?: string | number;
  paymentMethod?: string;
  paymentReferenceNumber?: string;
};

export const appointmentsApi = {
  list: (date?: string) => request<any[]>(`/appointments${date ? `?date=${date}` : ''}`),
  create: (data: any) => request<any>('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string) =>
    request<any>(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  checkin: (id: string, billing?: CheckInBilling) =>
    request<any>(`/appointments/${id}/checkin`, { method: 'POST', body: JSON.stringify(billing ?? {}) }),
  cancel: (id: string) =>
    request<any>(`/appointments/${id}/cancel`, { method: 'PATCH' }),
  reschedule: (id: string, newDate: string, newTime: string) =>
    request<any>(`/appointments/${id}/reschedule`, { method: 'POST', body: JSON.stringify({ newDate, newTime }) }),
};

// ===== Billing & Finance (reception-only APIs enforced by the backend) =====
export function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `finance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
const financeMutation = <T>(path: string, body: unknown, idempotencyKey?: string) =>
  request<T>(path, { method: 'POST', headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined, body: JSON.stringify(body) });
export const financeApi = {
  services: () => request<any[]>('/finance/services'),
  categories: () => request<any[]>('/finance/service-categories'),
  createCategory: (name: string) => request<any>('/finance/service-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  createService: (data: any) => request<any>('/finance/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: string, data: any) => request<any>(`/finance/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  invoices: (patientId?: string) => request<any[]>(`/finance/invoices${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`),
  createInvoice: (data: any) => request<any>('/finance/invoices', { method: 'POST', body: JSON.stringify(data) }),
  addInvoiceItem: (invoiceId: string, data: { serviceId: string; quantity?: number }, idempotencyKey?: string) =>
    financeMutation<any>(`/finance/invoices/${invoiceId}/items`, data, idempotencyKey),
  updateInvoiceDiscount: (invoiceId: string, data: any) => request<any>(`/finance/invoices/${invoiceId}/discount`, { method: 'PATCH', body: JSON.stringify(data) }),
  addPayment: (invoiceId: string, data: any, idempotencyKey?: string) => financeMutation<any>(`/finance/invoices/${invoiceId}/payments`, data, idempotencyKey),
  refund: (invoiceId: string, data: any, idempotencyKey?: string) => financeMutation<any>(`/finance/invoices/${invoiceId}/refunds`, data, idempotencyKey),
  cancelInvoice: (invoiceId: string) => request<any>(`/finance/invoices/${invoiceId}/cancel`, { method: 'POST' }),
  balance: (patientId: string) => request<{ balance: string }>(`/finance/patients/${patientId}/balance`),
  expenses: (from?: string, to?: string) => request<any[]>(`/finance/expenses?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}`),
  transactions: (from?: string, to?: string, type?: string) => request<any[]>(`/finance/transactions?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}${type && type !== 'all' ? `&type=${encodeURIComponent(type)}` : ''}`),
  expenseCategories: () => request<any[]>('/finance/expense-categories'),
  createExpenseCategory: (name: string) => request<any>('/finance/expense-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  createExpense: (data: any, idempotencyKey?: string) => financeMutation<any>('/finance/expenses', data, idempotencyKey),
  createCommissionRule: (data: any) => request<any>('/finance/commission-rules', { method: 'POST', body: JSON.stringify(data) }),
  dashboard: (from?: string, to?: string) => request<any>(`/finance/dashboard?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}`),
  cashierToday: () => request<any>('/finance/cashier/today'),
  closeCashier: (data: any) => request<any>('/finance/cashier/close', { method: 'POST', body: JSON.stringify(data) }),
  invoiceAudit: (invoiceId: string) => request<any[]>(`/finance/invoices/${invoiceId}/audit`),
};

export const UPLOADS_BASE_URL = (import.meta.env.VITE_SOCKET_URL || window.location.origin) as string;
