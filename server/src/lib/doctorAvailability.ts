import { pool } from '../db.js';

export type WeeklyScheduleEntry = {
  id: string;
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export class DoctorUnavailableError extends Error {
  constructor(message = 'الدكتور غير متاح في التاريخ والوقت المحددين') {
    super(message);
    this.name = 'DoctorUnavailableError';
  }
}

function mapSchedule(row: any): WeeklyScheduleEntry {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    dayOfWeek: Number(row.day_of_week),
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
  };
}

/** Uses the Cairo calendar rather than the server/container timezone. */
export function cairoTodayIso() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function dayOfWeekForIsoDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new DoctorUnavailableError('تاريخ الموعد غير صحيح');
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) {
    throw new DoctorUnavailableError('تاريخ الموعد غير صحيح');
  }
  return parsed.getUTCDay();
}

export function isValidTime(time: string) {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time);
}

export async function getDoctorWeeklySchedule(doctorId: string) {
  const result = await pool.query(
    `SELECT id, doctor_id, day_of_week, start_time, end_time
       FROM doctor_weekly_schedules
      WHERE doctor_id = $1
      ORDER BY day_of_week, start_time`,
    [doctorId],
  );
  return result.rows.map(mapSchedule);
}

export async function isDoctorAvailableOn(doctorId: string, date: string, time?: string) {
  const dayOfWeek = dayOfWeekForIsoDate(date);
  if (time && !isValidTime(time)) throw new DoctorUnavailableError('وقت الموعد غير صحيح');
  const result = await pool.query(
    `SELECT 1
       FROM doctor_weekly_schedules
      WHERE doctor_id = $1
        AND day_of_week = $2
        AND ($3::time IS NULL OR (start_time <= $3::time AND end_time > $3::time))
      LIMIT 1`,
    [doctorId, dayOfWeek, time ?? null],
  );
  return result.rows.length > 0;
}

export async function isDoctorAvailableToday(doctorId: string) {
  return isDoctorAvailableOn(doctorId, cairoTodayIso());
}

export async function assertDoctorAvailableForAppointment(doctorId: string, date: string, time: string) {
  if (!await isDoctorAvailableOn(doctorId, date, time)) {
    throw new DoctorUnavailableError();
  }
}

export async function assertDoctorAvailableToday(doctorId: string) {
  if (!await isDoctorAvailableToday(doctorId)) {
    throw new DoctorUnavailableError('الدكتور غير متاح اليوم حسب جدول عمله');
  }
}
