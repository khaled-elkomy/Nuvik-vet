const MAX_MONEY_CENTS = 99_999_999_999_999n;
const MAX_QUANTITY_MILLI = 99_999_999_999_999n;

/** Parse a fixed-scale decimal string without passing through IEEE-754 arithmetic. */
export function parseMoney(value: unknown): bigint {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) throw httpError(400, 'قيمة مالية غير صحيحة');
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > MAX_MONEY_CENTS) throw httpError(400, 'قيمة مالية أكبر من الحد المسموح');
  return cents;
}

export function moneyText(cents: bigint): string {
  if (cents < 0n || cents > MAX_MONEY_CENTS) throw httpError(400, 'قيمة مالية أكبر من الحد المسموح');
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function parseQuantity(value: unknown): bigint {
  const text = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(text)) throw httpError(400, 'كمية غير صحيحة');
  const [whole, fraction = ''] = text.split('.');
  const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (milli <= 0n || milli > MAX_QUANTITY_MILLI) throw httpError(400, 'الكمية يجب أن تكون موجبة وضمن الحد المسموح');
  return milli;
}

export function quantityText(milli: bigint): string {
  if (milli < 0n || milli > MAX_QUANTITY_MILLI) throw httpError(400, 'كمية أكبر من الحد المسموح');
  return `${milli / 1000n}.${String(milli % 1000n).padStart(3, '0')}`;
}

export function lineTotalCents(quantityMilli: bigint, priceCents: bigint): bigint {
  return (quantityMilli * priceCents + 500n) / 1000n;
}

export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
