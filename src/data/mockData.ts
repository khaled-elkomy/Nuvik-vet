import type { Patient, Visit, Prescription, Attachment, Appointment, Doctor } from '../types';

export const currentDoctor: Doctor = {
  id: 'doc-1',
  name: 'د. أحمد فاروق',
  specialty: 'باطنة عامة',
  email: 'dr.ahmed@clinicpro.eg',
  phone: '01012345678',
  clinicName: 'عيادة النيل التخصصية',
};

const avatarPalette = ['#146C5E', '#2F8267', '#B8763A', '#5F726D', '#0F5A4E', '#4D9F83'];

function colorFor(i: number) {
  return avatarPalette[i % avatarPalette.length];
}

export const patients: Patient[] = [
  {
    id: 'p-1', fileNumber: 'PT-001284', fullName: 'أحمد محمد علي', birthDate: '1984-03-12', age: 42,
    gender: 'ذكر', phone: '01012345671', email: 'ahmed.ali@example.com', address: 'مدينة نصر، القاهرة',
    bloodType: 'O+', allergies: ['البنسلين'], chronicDiseases: ['ضغط الدم المرتفع'],
    emergencyContactName: 'منى علي', emergencyContactPhone: '01098765431',
    notes: 'يتابع ضغط الدم شهريًا', lastVisit: '2026-09-12', avatarColor: colorFor(0),
    createdAt: '2024-01-15',
  },
  {
    id: 'p-2', fileNumber: 'PT-001285', fullName: 'محمد محمود حسن', birthDate: '1990-07-22', age: 36,
    gender: 'ذكر', phone: '01123456782', email: 'm.mahmoud@example.com', address: 'الدقي، الجيزة',
    bloodType: 'A+', allergies: [], chronicDiseases: ['السكري النوع الثاني'],
    emergencyContactName: 'هبة حسن', emergencyContactPhone: '01187654322',
    notes: '', lastVisit: '2026-09-08', avatarColor: colorFor(1),
    createdAt: '2024-02-10',
  },
  {
    id: 'p-3', fileNumber: 'PT-001286', fullName: 'سارة أحمد إبراهيم', birthDate: '1995-11-05', age: 30,
    gender: 'أنثى', phone: '01234567893', email: 'sara.ibrahim@example.com', address: 'المعادي، القاهرة',
    bloodType: 'B+', allergies: ['حساسية الغبار'], chronicDiseases: [],
    emergencyContactName: 'إبراهيم أحمد', emergencyContactPhone: '01276543213',
    notes: 'حامل في الشهر الخامس', lastVisit: '2026-09-14', avatarColor: colorFor(2),
    createdAt: '2024-03-20',
  },
  {
    id: 'p-4', fileNumber: 'PT-001287', fullName: 'محمود خالد السيد', birthDate: '1978-01-30', age: 48,
    gender: 'ذكر', phone: '01098765434', email: 'mahmoud.k@example.com', address: 'شبرا، القاهرة',
    bloodType: 'AB-', allergies: [], chronicDiseases: ['الربو الشعبي'],
    emergencyContactName: 'خالد السيد', emergencyContactPhone: '01011122234',
    notes: '', lastVisit: '2026-09-01', avatarColor: colorFor(3),
    createdAt: '2023-11-02',
  },
  {
    id: 'p-5', fileNumber: 'PT-001288', fullName: 'نورهان محمد', birthDate: '2000-06-18', age: 26,
    gender: 'أنثى', phone: '01155667785', email: 'nourhan.m@example.com', address: 'الزمالك، القاهرة',
    bloodType: 'O-', allergies: ['المكسرات'], chronicDiseases: [],
    emergencyContactName: 'محمد سامي', emergencyContactPhone: '01144332215',
    notes: '', lastVisit: '2026-08-29', avatarColor: colorFor(4),
    createdAt: '2024-05-11',
  },
  {
    id: 'p-6', fileNumber: 'PT-001289', fullName: 'ياسمين طارق', birthDate: '1988-09-09', age: 38,
    gender: 'أنثى', phone: '01277889906', email: 'yasmin.tarek@example.com', address: 'مصر الجديدة، القاهرة',
    bloodType: 'A-', allergies: [], chronicDiseases: ['فقر الدم'],
    emergencyContactName: 'طارق فهمي', emergencyContactPhone: '01288990016',
    notes: '', lastVisit: '2026-06-14', avatarColor: colorFor(5),
    createdAt: '2023-08-19',
  },
  {
    id: 'p-7', fileNumber: 'PT-001290', fullName: 'خالد عبد الرحمن', birthDate: '1965-04-25', age: 61,
    gender: 'ذكر', phone: '01099887767', email: 'khaled.ar@example.com', address: 'حلوان، القاهرة',
    bloodType: 'B-', allergies: ['الأسبرين'], chronicDiseases: ['أمراض القلب', 'ضغط الدم المرتفع'],
    emergencyContactName: 'رانيا خالد', emergencyContactPhone: '01066554437',
    notes: 'متابعة دورية لجلطة سابقة', lastVisit: '2026-09-15', avatarColor: colorFor(0),
    createdAt: '2023-02-28',
  },
  {
    id: 'p-8', fileNumber: 'PT-001291', fullName: 'هدى إسماعيل', birthDate: '1972-12-02', age: 53,
    gender: 'أنثى', phone: '01211223348', email: 'hoda.esmail@example.com', address: 'العبور، القليوبية',
    bloodType: 'O+', allergies: [], chronicDiseases: ['السكري النوع الثاني', 'ضغط الدم المرتفع'],
    emergencyContactName: 'إسماعيل عادل', emergencyContactPhone: '01222113348',
    notes: '', lastVisit: '2026-09-10', avatarColor: colorFor(1),
    createdAt: '2022-10-05',
  },
  {
    id: 'p-9', fileNumber: 'PT-001292', fullName: 'عمر شريف', birthDate: '2010-02-14', age: 16,
    gender: 'ذكر', phone: '01033445569', email: '', address: 'التجمع الخامس، القاهرة',
    bloodType: 'A+', allergies: ['حساسية اللاكتوز'], chronicDiseases: [],
    emergencyContactName: 'شريف وجدي', emergencyContactPhone: '01044556679',
    notes: 'يراجع بصحبة ولي الأمر', lastVisit: '2026-09-05', avatarColor: colorFor(2),
    createdAt: '2024-07-01',
  },
  {
    id: 'p-10', fileNumber: 'PT-001293', fullName: 'منى عبد الله', birthDate: '1998-08-08', age: 28,
    gender: 'أنثى', phone: '01555667790', email: 'mona.abdallah@example.com', address: 'الشيخ زايد، الجيزة',
    bloodType: 'AB+', allergies: [], chronicDiseases: [],
    emergencyContactName: 'عبدالله سامي', emergencyContactPhone: '01566778801',
    notes: '', lastVisit: '2026-08-20', avatarColor: colorFor(3),
    createdAt: '2024-09-14',
  },
  {
    id: 'p-11', fileNumber: 'PT-001294', fullName: 'كريم منصور', birthDate: '1993-05-19', age: 33,
    gender: 'ذكر', phone: '01677889912', email: 'karim.mansour@example.com', address: 'فيصل، الجيزة',
    bloodType: 'O+', allergies: [], chronicDiseases: [],
    emergencyContactName: 'منصور فؤاد', emergencyContactPhone: '01688990023',
    notes: 'مراجعة أولى', lastVisit: '2026-09-16', avatarColor: colorFor(4),
    createdAt: '2026-09-01',
  },
  {
    id: 'p-12', fileNumber: 'PT-001295', fullName: 'إيمان صابر', birthDate: '1980-10-27', age: 45,
    gender: 'أنثى', phone: '01799001123', email: 'eman.saber@example.com', address: 'أكتوبر، الجيزة',
    bloodType: 'B+', allergies: ['اليود'], chronicDiseases: ['الغدة الدرقية'],
    emergencyContactName: 'صابر لطفي', emergencyContactPhone: '01711223345',
    notes: '', lastVisit: '2026-08-30', avatarColor: colorFor(5),
    createdAt: '2023-06-17',
  },
];

export const visits: Visit[] = [
  { id: 'v-1', patientId: 'p-1', date: '2026-09-12', type: 'متابعة', doctor: 'د. أحمد فاروق', chiefComplaint: 'صداع خفيف', diagnosis: 'ضغط الدم مستقر', notes: 'ضغط الدم مستقر ضمن الحدود الطبيعية، الاستمرار على نفس العلاج', vitals: { bloodPressure: '130/85', heartRate: '78', temperature: '36.8', weight: '84', height: '176' }, medications: 'أملوديبين 5mg مرة يوميًا', followUpDate: '2026-10-12' },
  { id: 'v-2', patientId: 'p-1', date: '2026-08-10', type: 'كشف أولي', doctor: 'د. أحمد فاروق', chiefComplaint: 'دوخة وصداع', diagnosis: 'ارتفاع ضغط الدم', notes: 'بدء علاج خافض للضغط ومتابعة بعد شهر', vitals: { bloodPressure: '150/95', heartRate: '82', temperature: '37.0', weight: '85', height: '176' }, medications: 'أملوديبين 5mg', followUpDate: '2026-09-12' },
  { id: 'v-3', patientId: 'p-2', date: '2026-09-08', type: 'متابعة', doctor: 'د. أحمد فاروق', chiefComplaint: 'فحص دوري للسكر', diagnosis: 'السكري منضبط', notes: 'نسبة السكر التراكمي 6.8%، الاستمرار على النظام الحالي', vitals: { bloodPressure: '120/80', heartRate: '74', temperature: '36.7', weight: '92', height: '180' }, medications: 'ميتفورمين 1000mg مرتين يوميًا', followUpDate: '2026-12-08' },
  { id: 'v-4', patientId: 'p-3', date: '2026-09-14', type: 'متابعة حمل', doctor: 'د. أحمد فاروق', chiefComplaint: 'متابعة الشهر الخامس', diagnosis: 'حمل طبيعي', notes: 'نمو الجنين طبيعي، تم صرف فيتامينات', vitals: { bloodPressure: '110/70', heartRate: '88', temperature: '36.6', weight: '68', height: '165' }, medications: 'حمض الفوليك + فيتامين د', followUpDate: '2026-10-14' },
  { id: 'v-5', patientId: 'p-4', date: '2026-09-01', type: 'كشف طارئ', doctor: 'د. أحمد فاروق', chiefComplaint: 'ضيق تنفس', diagnosis: 'نوبة ربو خفيفة', notes: 'تم إعطاء بخاخ موسع للشعب، تحسن الحالة', vitals: { bloodPressure: '125/82', heartRate: '95', temperature: '37.1', weight: '79', height: '172' }, medications: 'بخاخ سالبوتامول عند اللزوم', followUpDate: '2026-09-20' },
  { id: 'v-6', patientId: 'p-7', date: '2026-09-15', type: 'متابعة', doctor: 'د. أحمد فاروق', chiefComplaint: 'متابعة القلب', diagnosis: 'استقرار الحالة القلبية', notes: 'تخطيط القلب طبيعي، الاستمرار على مميعات الدم', vitals: { bloodPressure: '135/88', heartRate: '70', temperature: '36.9', weight: '81', height: '170' }, medications: 'أسبرين 75mg، أتورفاستاتين 20mg', followUpDate: '2026-10-15' },
  { id: 'v-7', patientId: 'p-8', date: '2026-09-10', type: 'متابعة', doctor: 'د. أحمد فاروق', chiefComplaint: 'فحص دوري', diagnosis: 'السكري والضغط منضبطان', notes: 'تحاليل الدم ضمن المعدل المستهدف', vitals: { bloodPressure: '128/84', heartRate: '76', temperature: '36.8', weight: '77', height: '160' }, medications: 'ميتفورمين + لوسارتان', followUpDate: '2026-12-10' },
  { id: 'v-8', patientId: 'p-11', date: '2026-09-16', type: 'كشف أولي', doctor: 'د. أحمد فاروق', chiefComplaint: 'ألم في المعدة', diagnosis: 'التهاب بسيط في المعدة', notes: 'وصف مضاد للحموضة مع نظام غذائي خفيف', vitals: { bloodPressure: '118/76', heartRate: '72', temperature: '36.7', weight: '75', height: '178' }, medications: 'أوميبرازول 20mg', followUpDate: '2026-09-30' },
];

export const prescriptions: Prescription[] = [
  { id: 'rx-1', patientId: 'p-1', visitId: 'v-1', date: '2026-09-12', diagnosis: 'ارتفاع ضغط الدم', medications: [{ name: 'أملوديبين', dosage: '5mg مرة يوميًا', duration: '30 يوم' }, { name: 'أسبرين', dosage: '75mg مرة يوميًا', duration: '30 يوم' }] },
  { id: 'rx-2', patientId: 'p-1', visitId: 'v-2', date: '2026-08-10', diagnosis: 'ارتفاع ضغط الدم', medications: [{ name: 'أملوديبين', dosage: '5mg مرة يوميًا', duration: '30 يوم' }] },
  { id: 'rx-3', patientId: 'p-2', visitId: 'v-3', date: '2026-09-08', diagnosis: 'السكري النوع الثاني', medications: [{ name: 'ميتفورمين', dosage: '1000mg مرتين يوميًا', duration: '90 يوم' }] },
  { id: 'rx-4', patientId: 'p-3', visitId: 'v-4', date: '2026-09-14', diagnosis: 'متابعة حمل', medications: [{ name: 'حمض الفوليك', dosage: '5mg مرة يوميًا', duration: '30 يوم' }, { name: 'فيتامين د', dosage: '1000 وحدة يوميًا', duration: '30 يوم' }] },
  { id: 'rx-5', patientId: 'p-7', visitId: 'v-6', date: '2026-09-15', diagnosis: 'متابعة قلبية', medications: [{ name: 'أسبرين', dosage: '75mg يوميًا', duration: '30 يوم' }, { name: 'أتورفاستاتين', dosage: '20mg مساءً', duration: '30 يوم' }] },
];

export const attachments: Attachment[] = [
  { id: 'a-1', patientId: 'p-1', name: 'تحليل دهون شامل', type: 'تحليل دم', date: '2026-09-10' },
  { id: 'a-2', patientId: 'p-1', name: 'أشعة على الصدر', type: 'أشعة', date: '2026-08-09' },
  { id: 'a-3', patientId: 'p-2', name: 'السكر التراكمي HbA1c', type: 'تحليل دم', date: '2026-09-07' },
  { id: 'a-4', patientId: 'p-3', name: 'سونار متابعة حمل', type: 'أشعة', date: '2026-09-13' },
  { id: 'a-5', patientId: 'p-7', name: 'تقرير أشعة مقطعية للقلب', type: 'تقرير طبي', date: '2026-06-02' },
  { id: 'a-6', patientId: 'p-8', name: 'وظائف كلى وكبد', type: 'تحليل دم', date: '2026-09-09' },
];

const today = '2026-09-17';
export const appointments: Appointment[] = [
  { id: 'ap-1', patientId: 'p-1', patientName: 'أحمد محمد علي', date: today, time: '09:00', type: 'متابعة', status: 'مؤكد' },
  { id: 'ap-2', patientId: 'p-5', patientName: 'نورهان محمد', date: today, time: '09:30', type: 'كشف أولي', status: 'حضر' },
  { id: 'ap-3', patientId: 'p-9', patientName: 'عمر شريف', date: today, time: '10:15', type: 'كشف دوري', status: 'مؤكد' },
  { id: 'ap-4', patientId: 'p-4', patientName: 'محمود خالد السيد', date: today, time: '11:00', type: 'متابعة ربو', status: 'مكتمل' },
  { id: 'ap-5', patientId: 'p-10', patientName: 'منى عبد الله', date: today, time: '11:45', type: 'كشف أولي', status: 'مكتمل' },
  { id: 'ap-6', patientId: 'p-6', patientName: 'ياسمين طارق', date: today, time: '12:30', type: 'متابعة فقر دم', status: 'ملغي' },
  { id: 'ap-7', patientId: 'p-12', patientName: 'إيمان صابر', date: today, time: '13:15', type: 'متابعة غدة درقية', status: 'حضر' },
  { id: 'ap-8', patientId: 'p-2', patientName: 'محمد محمود حسن', date: '2026-09-18', time: '09:00', type: 'متابعة سكر', status: 'مؤكد' },
  { id: 'ap-9', patientId: 'p-7', patientName: 'خالد عبد الرحمن', date: '2026-09-18', time: '10:00', type: 'متابعة قلب', status: 'مؤكد' },
  { id: 'ap-10', patientId: 'p-8', patientName: 'هدى إسماعيل', date: '2026-09-18', time: '10:45', type: 'متابعة دورية', status: 'مؤكد' },
  { id: 'ap-11', patientId: 'p-3', patientName: 'سارة أحمد إبراهيم', date: '2026-09-19', time: '09:30', type: 'متابعة حمل', status: 'حضر' },
  { id: 'ap-12', patientId: 'p-11', patientName: 'كريم منصور', date: '2026-09-20', time: '12:00', type: 'متابعة معدة', status: 'مؤكد' },
];
