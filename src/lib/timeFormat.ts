/**
 * Display-only utility: converts a 24-hour time string (e.g. "13:00", "09:30")
 * to 12-hour AM/PM format (e.g. "1:00 PM", "9:30 AM").
 *
 * This is purely for UI display — it does NOT affect stored values,
 * API payloads, scheduling logic, or any backend behaviour.
 */
export function formatTime12(time: string): string {
  if (!time) return '';
  const trimmed = time.trim();
  if (trimmed.includes('AM') || trimmed.includes('PM')) {
    return trimmed;
  }
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  let hour = Number(parts[0]);
  if (isNaN(hour)) return trimmed;
  const minute = (parts[1] || '00').slice(0, 2).padStart(2, '0');
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${minute} ${period}`;
}
