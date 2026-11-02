/** Derives a patient's age from their ISO date of birth without timezone shifts. */
export function ageFromBirthDate(birthDate?: string, today = new Date()): number {
  if (!birthDate) return 0;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const age = today.getFullYear() - year - (today.getMonth() < month || (today.getMonth() === month && today.getDate() < day) ? 1 : 0);
  return Math.max(0, age);
}
