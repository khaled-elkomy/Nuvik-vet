import type { PoolClient } from 'pg';
import { cairoTodayIso } from './doctorAvailability.js';

const money = (value: unknown) => {
  const text = String(value ?? '0').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw Object.assign(new Error('قيمة مالية غير صحيحة'), { status: 400 });
  const [whole, decimal = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt((decimal + '00').slice(0, 2));
};

const moneyText = (cents: bigint) => {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

async function refreshInvoiceAmounts(client: PoolClient, invoiceId: string, userId: string) {
  const invoice = await client.query(`SELECT total, status FROM invoices WHERE id=$1 FOR UPDATE`, [invoiceId]);
  if (!invoice.rows[0]) throw Object.assign(new Error('الفاتورة غير موجودة'), { status: 404 });
  const payments = await client.query(`SELECT COALESCE(SUM(amount),0) amount FROM payments WHERE invoice_id=$1`, [invoiceId]);
  const refunds = await client.query(`SELECT COALESCE(SUM(amount),0) amount FROM refunds WHERE invoice_id=$1`, [invoiceId]);
  const paid = money(payments.rows[0].amount) - money(refunds.rows[0].amount);
  const total = money(invoice.rows[0].total);
  const remaining = total - paid;
  const status = remaining === 0n ? 'paid' : paid > 0n ? 'partially_paid' : 'issued';
  const updated = await client.query(
    `UPDATE invoices SET paid_amount=$1, remaining_amount=$2, status=$3, updated_by=$4, updated_at=now() WHERE id=$5 RETURNING *`,
    [moneyText(paid), moneyText(remaining), status, userId, invoiceId],
  );
  return updated.rows[0];
}

export async function createConfirmedServiceInvoice(
  client: PoolClient,
  input: { patientId: string; doctorId: string | null; serviceId: string; createdBy: string; sourceKey: string; eventLabel?: string; payment?: { amount: unknown; method: string; referenceNumber?: string } },
) {
  // Callers hold the appointment/queue event inside their transaction. The audit source key
  // makes an event retry idempotent without inventing a second invoice relationship column.
  const existing = await client.query(
    `SELECT i.* FROM invoices i JOIN financial_audit_logs a ON a.entity_id=i.id
     WHERE a.entity_type='invoice' AND a.details->>'sourceKey'=$1 LIMIT 1`,
    [input.sourceKey],
  );
  if (existing.rows[0]) return { invoice: existing.rows[0], created: false };

  const serviceResult = await client.query(`SELECT * FROM services WHERE id=$1 AND is_active=true`, [input.serviceId]);
  const service = serviceResult.rows[0];
  if (!service) throw Object.assign(new Error('الخدمة المحددة غير موجودة أو غير نشطة'), { status: 400 });
  const patient = await client.query(`SELECT id FROM patients WHERE id=$1`, [input.patientId]);
  if (!patient.rows[0]) throw Object.assign(new Error('المريض غير موجود'), { status: 404 });

  const sequence = await client.query(`SELECT nextval('invoice_number_sequence') value`);
  const price = money(service.price);
  const invoiceNumber = `INV-${cairoTodayIso().slice(0, 4)}-${String(sequence.rows[0].value).padStart(6, '0')}`;
  const invoiceResult = await client.query(
    `INSERT INTO invoices (invoice_number,patient_id,doctor_id,invoice_date,subtotal,discount_value,discount_amount,tax_amount,total,paid_amount,remaining_amount,status,notes,created_by,updated_by)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,0,0,0,$4,0,$4,'issued',$5,$6,$6) RETURNING *`,
    [invoiceNumber, input.patientId, input.doctorId, moneyText(price), `${input.eventLabel ?? 'فاتورة خدمة مؤكدة'} (${input.sourceKey})`, input.createdBy],
  );
  const invoice = invoiceResult.rows[0];
  await client.query(
    `INSERT INTO invoice_items (invoice_id,service_id,service_name,service_code,quantity,unit_price,line_total)
     VALUES ($1,$2,$3,$4,1,$5,$5)`,
    [invoice.id, service.id, service.name, service.code, moneyText(price)],
  );
  await client.query(
    `INSERT INTO financial_audit_logs (entity_type,entity_id,action,details,performed_by)
     VALUES ('invoice',$1,'confirmed_service_invoice_created',$2,$3)`,
    [invoice.id, JSON.stringify({ sourceKey: input.sourceKey, serviceId: service.id, price: moneyText(price) }), input.createdBy],
  );

  if (input.payment?.amount !== undefined && String(input.payment.amount).trim() !== '') {
    const amount = money(input.payment.amount);
    // صفر يعني أن الحضور مؤكد لكن لم يُحصّل شيء بعد؛ لا ينشئ سجل دفعة.
    if (amount === 0n) return { invoice, created: true };
    if (!input.payment.method) throw Object.assign(new Error('طريقة الدفع مطلوبة عند تسجيل دفعة'), { status: 400 });
    if (amount > price) throw Object.assign(new Error('قيمة الدفعة لا تتجاوز قيمة الخدمة'), { status: 400 });
    await client.query(
      `INSERT INTO payments (invoice_id,amount,payment_method,reference_number,received_by) VALUES ($1,$2,$3,$4,$5)`,
      [invoice.id, moneyText(amount), input.payment.method, input.payment.referenceNumber || null, input.createdBy],
    );
    return { invoice: await refreshInvoiceAmounts(client, invoice.id, input.createdBy), created: true };
  }
  return { invoice, created: true };
}

export async function addCurrentPriceServiceToInvoice(client: PoolClient, invoiceId: string, serviceId: string, quantity: unknown, userId: string) {
  const invoiceResult = await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [invoiceId]);
  const invoice = invoiceResult.rows[0];
  // A paid/refunded/cancelled invoice is immutable. A later billable service must
  // be charged on a new event invoice rather than silently reopening this one.
  if (!invoice || !['issued', 'partially_paid'].includes(invoice.status)) {
    throw Object.assign(new Error('لا يمكن إضافة خدمة إلى فاتورة مدفوعة أو ملغاة أو مستردة'), { status: 400 });
  }
  const serviceResult = await client.query(`SELECT * FROM services WHERE id=$1 AND is_active=true`, [serviceId]);
  const service = serviceResult.rows[0];
  if (!service) throw Object.assign(new Error('الخدمة غير موجودة أو غير نشطة'), { status: 400 });
  const count = Number(quantity ?? 1);
  if (!Number.isInteger(count) || count < 1) throw Object.assign(new Error('كمية الخدمة غير صحيحة'), { status: 400 });
  const line = money(service.price) * BigInt(count);
  await client.query(`INSERT INTO invoice_items (invoice_id,service_id,service_name,service_code,quantity,unit_price,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [invoiceId, service.id, service.name, service.code, count, moneyText(money(service.price)), moneyText(line)]);
  const subtotal = money(invoice.subtotal) + line;
  const discount = invoice.discount_type === 'percentage'
    ? subtotal * money(invoice.discount_value) / 10000n
    : money(invoice.discount_amount);
  const total = subtotal - discount + money(invoice.tax_amount);
  await client.query(`UPDATE invoices SET subtotal=$1,discount_amount=$2,total=$3,remaining_amount=$4,updated_by=$5,updated_at=now() WHERE id=$6`, [moneyText(subtotal), moneyText(discount), moneyText(total), moneyText(total - money(invoice.paid_amount)), userId, invoiceId]);
  await client.query(`INSERT INTO financial_audit_logs (entity_type,entity_id,action,details,performed_by) VALUES ('invoice',$1,'service_added',$2,$3)`, [invoiceId, JSON.stringify({ serviceId, quantity: count, unitPrice: moneyText(money(service.price)) }), userId]);
  return refreshInvoiceAmounts(client, invoiceId, userId);
}
