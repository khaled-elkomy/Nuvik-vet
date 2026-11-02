export function estimateBirthDate(years: number, months: number, today = new Date()): string {
  if (!Number.isInteger(years) || !Number.isInteger(months) || years < 0 || months < 0 || months > 11 || years * 12 + months < 1 || years > 40) {
    throw new Error('العمر التقريبي غير صالح');
  }
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - (years * 12 + months));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(today.getUTCDate(), lastDay));
  return date.toISOString().slice(0, 10);
}
