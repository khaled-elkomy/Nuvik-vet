import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { cairoTodayIso } from '../lib/doctorAvailability.js';
import { addCurrentPriceServiceToInvoice } from '../lib/billing.js';

export const financeRouter = Router();
financeRouter.use(requireAuth, requireRole('reception'));

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
const mapService = (row: any) => ({ id: row.id, name: row.name, code: row.code, categoryId: row.category_id, category: row.category_name, description: row.description, price: row.price, isActive: row.is_active });
const mapInvoice = (row: any) => ({ id: row.id, number: row.invoice_number, patientId: row.patient_id, patientName: row.patient_name, visitId: row.visit_id, doctorId: row.doctor_id, doctorName: row.doctor_name, date: String(row.invoice_date).slice(0, 10), dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null, subtotal: row.subtotal, discountType: row.discount_type, discountValue: row.discount_value, discountAmount: row.discount_amount, taxAmount: row.tax_amount, total: row.total, paidAmount: row.paid_amount, remainingAmount: row.remaining_amount, status: row.status, notes: row.notes, items: row.items ?? [], payments: row.payments ?? [] });

async function audit(client: any, entityType: string, entityId: string, action: string, userId: string, details: object = {}) {
  await client.query(`INSERT INTO financial_audit_logs (entity_type, entity_id, action, details, performed_by) VALUES ($1,$2,$3,$4,$5)`, [entityType, entityId, action, JSON.stringify(details), userId]);
}

/**
 * The client keeps this key while it retries a financial action. An advisory
 * transaction lock prevents two concurrent deliveries of the same key from
 * creating two payments, refunds, or invoice lines without adding a new table.
 */
function requestKey(req: any) {
  const value = req.get('Idempotency-Key');
  if (!value) return null;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw Object.assign(new Error('مفتاح العملية غير صالح'), { status: 400 });
  return value;
}
async function lockRequest(client: any, key: string | null) {
  if (key) await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [key]);
}
async function auditForKey(client: any, action: string, key: string | null) {
  if (!key) return null;
  const result = await client.query(`SELECT * FROM financial_audit_logs WHERE action=$1 AND details->>'idempotencyKey'=$2 ORDER BY created_at DESC LIMIT 1`, [action, key]);
  return result.rows[0] ?? null;
}

async function refreshInvoiceAmounts(client: any, invoiceId: string, userId: string) {
  const invoice = await client.query(`SELECT total, status FROM invoices WHERE id = $1 FOR UPDATE`, [invoiceId]);
  if (!invoice.rows[0]) throw Object.assign(new Error('الفاتورة غير موجودة'), { status: 404 });
  if (invoice.rows[0].status === 'cancelled') return invoice.rows[0];
  const paid = await client.query(`SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE invoice_id = $1`, [invoiceId]);
  const refunded = await client.query(`SELECT COALESCE(SUM(amount), 0) AS amount FROM refunds WHERE invoice_id = $1`, [invoiceId]);
  const net = money(paid.rows[0].amount) - money(refunded.rows[0].amount);
  const total = money(invoice.rows[0].total);
  const remaining = total - net;
  const status = net === 0n && total > 0n && money(refunded.rows[0].amount) > 0n ? 'refunded' : remaining === 0n ? 'paid' : net > 0n ? 'partially_paid' : 'issued';
  const result = await client.query(`UPDATE invoices SET paid_amount=$1, remaining_amount=$2, status=$3, updated_by=$4, updated_at=now() WHERE id=$5 RETURNING *`, [moneyText(net), moneyText(remaining), status, userId, invoiceId]);
  return result.rows[0];
}

financeRouter.get('/services', async (_req, res) => {
  const result = await pool.query(`SELECT s.*, c.name AS category_name FROM services s LEFT JOIN service_categories c ON c.id=s.category_id ORDER BY s.is_active DESC, s.name`);
  res.json(result.rows.map(mapService));
});
financeRouter.get('/service-categories', async (_req, res) => {
  const result = await pool.query(`SELECT * FROM service_categories ORDER BY name`);
  res.json(result.rows.map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })));
});
financeRouter.post('/service-categories', async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
  const result = await pool.query(`INSERT INTO service_categories (name) VALUES ($1) RETURNING *`, [req.body.name.trim()]);
  res.status(201).json({ id: result.rows[0].id, name: result.rows[0].name, isActive: result.rows[0].is_active });
});
financeRouter.post('/services', async (req, res) => {
  const body = req.body;
  if (!body.name?.trim() || !body.code?.trim()) return res.status(400).json({ error: 'اسم الخدمة والكود مطلوبان' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO services (name,code,category_id,description,price,is_active,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [body.name.trim(), body.code.trim(), body.categoryId || null, body.description?.trim() || null, moneyText(money(body.price)), body.isActive !== false, req.user!.id]);
      await audit(client, 'service', result.rows[0].id, 'created', req.user!.id, { name: result.rows[0].name, code: result.rows[0].code, price: result.rows[0].price });
      await client.query('COMMIT'); res.status(201).json(mapService(result.rows[0]));
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  } catch (err: any) { if (err.code === '23505') return res.status(409).json({ error: 'كود الخدمة مستخدم بالفعل' }); throw err; }
});
financeRouter.patch('/services/:id', async (req, res) => {
  const body = req.body;
  const price = body.price === undefined ? null : moneyText(money(body.price));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT * FROM services WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!before.rows[0]) throw Object.assign(new Error('الخدمة غير موجودة'), { status: 404 });
    const result = await client.query(`UPDATE services SET name=COALESCE($1,name), code=COALESCE($2,code), category_id=COALESCE($3,category_id), description=COALESCE($4,description), price=COALESCE($5,price), is_active=COALESCE($6,is_active), updated_at=now() WHERE id=$7 RETURNING *`, [body.name?.trim(), body.code?.trim(), body.categoryId, body.description?.trim(), price, body.isActive, req.params.id]);
    await audit(client, 'service', req.params.id, result.rows[0].is_active ? 'updated' : 'archived', req.user!.id, { previous: { name: before.rows[0].name, code: before.rows[0].code, price: before.rows[0].price, isActive: before.rows[0].is_active }, next: { name: result.rows[0].name, code: result.rows[0].code, price: result.rows[0].price, isActive: result.rows[0].is_active } });
    await client.query('COMMIT'); res.json(mapService(result.rows[0]));
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
});

/** خدمات إضافية مؤكدة أثناء الزيارة تُضاف لنفس الفاتورة مع تثبيت سعر الخدمة وقت الإضافة. */
financeRouter.post('/invoices/:id/items', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const key = requestKey(req); await lockRequest(client, key);
    const replay = await auditForKey(client, 'service_add_request_recorded', key);
    if (replay) {
      const existing = await client.query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
      if (!existing.rows[0]) throw Object.assign(new Error('الفاتورة غير موجودة'), { status: 404 });
      await client.query('COMMIT'); return res.json(mapInvoice({ ...existing.rows[0], items: [] }));
    }
    const invoice = await addCurrentPriceServiceToInvoice(client, req.params.id, req.body.serviceId, req.body.quantity, req.user!.id);
    if (key) await audit(client, 'invoice', req.params.id, 'service_add_request_recorded', req.user!.id, { idempotencyKey: key, source: 'finance' });
    await client.query('COMMIT');
    res.status(201).json(mapInvoice({ ...invoice, items: [] }));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

financeRouter.get('/invoices', async (req, res) => {
  const params: any[] = []; const clauses: string[] = [];
  if (req.query.patientId) { params.push(String(req.query.patientId)); clauses.push(`i.patient_id=$${params.length}`); }
  if (req.query.status) { params.push(String(req.query.status)); clauses.push(`i.status=$${params.length}`); }
  const result = await pool.query(`SELECT i.*, p.full_name patient_name, u.full_name doctor_name,
    COALESCE((SELECT json_agg(json_build_object('id',ii.id,'serviceName',ii.service_name,'quantity',ii.quantity,'unitPrice',ii.unit_price,'lineTotal',ii.line_total)) FROM invoice_items ii WHERE ii.invoice_id=i.id),'[]') items
    ,COALESCE((SELECT json_agg(json_build_object('id',pm.id,'amount',pm.amount,'method',pm.payment_method,'referenceNumber',pm.reference_number,'at',pm.payment_at) ORDER BY pm.payment_at DESC) FROM payments pm WHERE pm.invoice_id=i.id),'[]') payments
    FROM invoices i JOIN patients p ON p.id=i.patient_id LEFT JOIN users u ON u.id=i.doctor_id ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY i.created_at DESC`, params);
  res.json(result.rows.map(mapInvoice));
});
financeRouter.post('/invoices', async (req, res) => {
  const body = req.body;
  if (!body.patientId || !Array.isArray(body.items) || body.items.length === 0) return res.status(400).json({ error: 'المريض وبند خدمة واحد على الأقل مطلوبان' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const patient = await client.query(`SELECT id FROM patients WHERE id=$1`, [body.patientId]);
    if (!patient.rows[0]) throw Object.assign(new Error('المريض غير موجود'), { status: 404 });
    let doctorId = body.doctorId || null;
    if (body.visitId) { const visit = await client.query(`SELECT patient_id, doctor_id FROM visits WHERE id=$1`, [body.visitId]); if (!visit.rows[0] || visit.rows[0].patient_id !== body.patientId) throw Object.assign(new Error('الزيارة غير صالحة للمريض'), { status: 400 }); doctorId = visit.rows[0].doctor_id; }
    if (doctorId) { const doctor = await client.query(`SELECT id FROM users WHERE id=$1 AND role='doctor'`, [doctorId]); if (!doctor.rows[0]) throw Object.assign(new Error('الدكتور غير صالح'), { status: 400 }); }
    const sequence = await client.query(`SELECT nextval('invoice_number_sequence') AS value`);
    const number = `INV-${cairoTodayIso().slice(0, 4)}-${String(sequence.rows[0].value).padStart(6, '0')}`;
    const items: any[] = []; let subtotal = 0n;
    for (const item of body.items) {
      const service = await client.query(`SELECT * FROM services WHERE id=$1 AND is_active=true`, [item.serviceId]);
      if (!service.rows[0]) throw Object.assign(new Error('خدمة غير موجودة أو غير نشطة'), { status: 400 });
      const quantity = Number(item.quantity ?? 1); if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('كمية الخدمة غير صحيحة'), { status: 400 });
      const unit = money(service.rows[0].price); const line = unit * BigInt(quantity); subtotal += line;
      items.push({ service: service.rows[0], quantity, unit, line });
    }
    const discountType = body.discountType === 'percentage' ? 'percentage' : body.discountType === 'fixed' ? 'fixed' : null;
    const discountValue = discountType ? money(body.discountValue ?? 0) : 0n;
    const discount = discountType === 'percentage' ? subtotal * discountValue / 10000n : discountValue;
    if (discount > subtotal) throw Object.assign(new Error('الخصم أكبر من إجمالي الفاتورة'), { status: 400 });
    const tax = money(body.taxAmount ?? 0); const total = subtotal - discount + tax;
    const invoice = await client.query(`INSERT INTO invoices (invoice_number,patient_id,visit_id,doctor_id,invoice_date,due_date,subtotal,discount_type,discount_value,discount_amount,discount_reason,tax_amount,total,paid_amount,remaining_amount,status,notes,created_by,updated_by) VALUES ($1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,0,$13,'issued',$14,$15,$15) RETURNING *`, [number, body.patientId, body.visitId || null, doctorId, body.invoiceDate || null, body.dueDate || null, moneyText(subtotal), discountType, moneyText(discountValue), moneyText(discount), body.discountReason || null, moneyText(tax), moneyText(total), body.notes || null, req.user!.id]);
    for (const item of items) {
      const inserted = await client.query(`INSERT INTO invoice_items (invoice_id,service_id,service_name,service_code,quantity,unit_price,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [invoice.rows[0].id, item.service.id, item.service.name, item.service.code, item.quantity, moneyText(item.unit), moneyText(item.line)]);
      if (doctorId) { const rule = await client.query(`SELECT * FROM commission_rules WHERE doctor_id=$1 AND is_active=true AND (service_id=$2 OR service_id IS NULL) ORDER BY service_id NULLS LAST LIMIT 1`, [doctorId, item.service.id]); if (rule.rows[0]) { const amount = rule.rows[0].rule_type === 'percentage' ? item.line * money(rule.rows[0].value) / 10000n : money(rule.rows[0].value) * BigInt(item.quantity); await client.query(`INSERT INTO doctor_commissions (invoice_item_id,doctor_id,amount,rule_id) VALUES ($1,$2,$3,$4)`, [inserted.rows[0].id, doctorId, moneyText(amount), rule.rows[0].id]); } }
    }
    await audit(client, 'invoice', invoice.rows[0].id, 'created', req.user!.id, { number }); await client.query('COMMIT'); res.status(201).json(mapInvoice({ ...invoice.rows[0], patient_name: '', doctor_name: '', items: [] }));
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
});
financeRouter.post('/invoices/:id/payments', async (req, res) => {
  if (!req.body.paymentMethod || req.body.amount === undefined) return res.status(400).json({ error: 'قيمة الدفع وطريقة الدفع مطلوبان' });
  const client = await pool.connect(); try {
    await client.query('BEGIN');
    const key = requestKey(req); await lockRequest(client, key);
    const replay = await auditForKey(client, 'payment_created', key);
    if (replay) {
      const payment = await client.query(`SELECT * FROM payments WHERE id=$1`, [replay.entity_id]);
      const invoice = await client.query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
      if (!payment.rows[0] || !invoice.rows[0]) throw Object.assign(new Error('تعذّر استرجاع الدفعة السابقة'), { status: 409 });
      await client.query('COMMIT'); return res.json({ payment: payment.rows[0], invoice: mapInvoice({ ...invoice.rows[0], items: [] }), replayed: true });
    }
    const invoice = await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!invoice.rows[0] || !['issued', 'partially_paid'].includes(invoice.rows[0].status)) throw Object.assign(new Error('لا يمكن الدفع لهذه الفاتورة'), { status: 400 });
    const amount = money(req.body.amount);
    if (amount <= 0n || amount > money(invoice.rows[0].remaining_amount)) throw Object.assign(new Error('قيمة الدفع يجب أن تكون أكبر من صفر ولا تتجاوز المتبقي'), { status: 400 });
    const payment = await client.query(`INSERT INTO payments (invoice_id,amount,payment_method,reference_number,notes,received_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [req.params.id, moneyText(amount), req.body.paymentMethod, req.body.referenceNumber || null, req.body.notes || null, req.user!.id]);
    const updated = await refreshInvoiceAmounts(client, req.params.id, req.user!.id);
    await audit(client, 'payment', payment.rows[0].id, 'payment_created', req.user!.id, { invoiceId: req.params.id, amount: payment.rows[0].amount, method: payment.rows[0].payment_method, referenceNumber: payment.rows[0].reference_number, idempotencyKey: key });
    await client.query('COMMIT'); res.status(201).json({ payment: payment.rows[0], invoice: mapInvoice({ ...updated, items: [] }) });
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
});
financeRouter.patch('/invoices/:id/discount', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invoice = await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!invoice.rows[0] || invoice.rows[0].status === 'cancelled') throw Object.assign(new Error('الفاتورة غير قابلة للتعديل'), { status: 400 });
    if (money(invoice.rows[0].paid_amount) > 0n) throw Object.assign(new Error('لا يمكن تعديل خصم فاتورة لها دفعات'), { status: 400 });
    const type = req.body.discountType === 'percentage' ? 'percentage' : req.body.discountType === 'fixed' ? 'fixed' : null;
    const value = type ? money(req.body.discountValue ?? 0) : 0n;
    const subtotal = money(invoice.rows[0].subtotal);
    const discount = type === 'percentage' ? subtotal * value / 10000n : value;
    if (discount > subtotal) throw Object.assign(new Error('الخصم أكبر من الإجمالي الفرعي'), { status: 400 });
    const total = subtotal - discount + money(invoice.rows[0].tax_amount);
    const updated = await client.query(`UPDATE invoices SET discount_type=$1,discount_value=$2,discount_amount=$3,discount_reason=$4,total=$5,remaining_amount=$5,updated_by=$6,updated_at=now() WHERE id=$7 RETURNING *`, [type, moneyText(value), moneyText(discount), req.body.reason || null, moneyText(total), req.user!.id, req.params.id]);
    await audit(client, 'invoice', req.params.id, 'discount_changed', req.user!.id, { previous: { type: invoice.rows[0].discount_type, value: invoice.rows[0].discount_value, amount: invoice.rows[0].discount_amount }, next: { type, value: moneyText(value), amount: moneyText(discount) }, reason: req.body.reason || null });
    await client.query('COMMIT'); res.json(mapInvoice({ ...updated.rows[0], items: [] }));
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
});
financeRouter.post('/invoices/:id/refunds', async (req, res) => {
  if (!req.body.reason || req.body.amount === undefined || !req.body.paymentId) return res.status(400).json({ error: 'قيمة الاسترداد والسبب والدفعة الأصلية مطلوبة' });
  const client = await pool.connect(); try {
    await client.query('BEGIN');
    const key = requestKey(req); await lockRequest(client, key);
    const replay = await auditForKey(client, 'refund_created', key);
    if (replay) { const refund = await client.query(`SELECT * FROM refunds WHERE id=$1`, [replay.entity_id]); const invoice = await client.query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]); await client.query('COMMIT'); return res.json({ refund: refund.rows[0], invoice: mapInvoice({ ...invoice.rows[0], items: [] }), replayed: true }); }
    const invoice = await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!invoice.rows[0] || invoice.rows[0].status === 'cancelled') throw Object.assign(new Error('لا يمكن الاسترداد لهذه الفاتورة'), { status: 400 });
    const payment = await client.query(`SELECT amount FROM payments WHERE id=$1 AND invoice_id=$2 FOR UPDATE`, [req.body.paymentId, req.params.id]); if (!payment.rows[0]) throw Object.assign(new Error('الدفعة الأصلية غير موجودة لهذه الفاتورة'), { status: 400 });
    const refunded = await client.query(`SELECT COALESCE(SUM(amount),0) amount FROM refunds WHERE payment_id=$1`, [req.body.paymentId]); const amount = money(req.body.amount); if (amount <= 0n || amount > money(payment.rows[0].amount) - money(refunded.rows[0].amount)) throw Object.assign(new Error('قيمة الاسترداد يجب أن تكون أكبر من صفر ولا تتجاوز صافي الدفعة'), { status: 400 });
    const refund = await client.query(`INSERT INTO refunds (invoice_id,payment_id,amount,reason,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [req.params.id, req.body.paymentId, moneyText(amount), req.body.reason, req.user!.id]); const updated = await refreshInvoiceAmounts(client, req.params.id, req.user!.id);
    await audit(client, 'refund', refund.rows[0].id, 'refund_created', req.user!.id, { invoiceId: req.params.id, paymentId: req.body.paymentId, amount: refund.rows[0].amount, reason: refund.rows[0].reason, idempotencyKey: key }); await client.query('COMMIT'); res.status(201).json({ refund: refund.rows[0], invoice: mapInvoice({ ...updated, items: [] }) });
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
});
financeRouter.post('/invoices/:id/cancel', async (req, res) => { const client = await pool.connect(); try { await client.query('BEGIN'); const payments = await client.query(`SELECT COALESCE(SUM(amount),0) amount FROM payments WHERE invoice_id=$1`, [req.params.id]); if (money(payments.rows[0].amount) > 0n) throw Object.assign(new Error('لا يمكن إلغاء فاتورة بها مدفوعات؛ استخدم الاسترداد'), { status: 400 }); const result = await client.query(`UPDATE invoices SET status='cancelled', remaining_amount=0, updated_by=$1, updated_at=now() WHERE id=$2 AND status <> 'cancelled' RETURNING *`, [req.user!.id, req.params.id]); if (!result.rows[0]) throw Object.assign(new Error('الفاتورة غير موجودة'), { status: 404 }); await audit(client, 'invoice', req.params.id, 'cancelled', req.user!.id); await client.query('COMMIT'); res.json(mapInvoice({ ...result.rows[0], items: [] })); } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); } });

financeRouter.get('/patients/:patientId/balance', async (req, res) => { const result = await pool.query(`SELECT COALESCE(SUM(remaining_amount) FILTER (WHERE status NOT IN ('cancelled','refunded')),0) balance FROM invoices WHERE patient_id=$1`, [req.params.patientId]); res.json({ patientId: req.params.patientId, balance: result.rows[0].balance }); });
financeRouter.get('/expenses', async (req, res) => {
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const params: string[] = []; const clauses: string[] = [];
  if (from) { params.push(from); clauses.push(`e.expense_date >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`e.expense_date <= $${params.length}`); }
  const result = await pool.query(`SELECT e.*, c.name category_name, u.full_name created_by_name FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id JOIN users u ON u.id=e.created_by ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY e.expense_date DESC, e.created_at DESC`, params);
  res.json(result.rows);
});
// A compact, immutable-facing activity feed. It deliberately reads the source
// records rather than introducing a second ledger table beside the existing
// payment/refund/expense records and their audit entries.
financeRouter.get('/transactions', async (req, res) => {
  const from = String(req.query.from || cairoTodayIso());
  const to = String(req.query.to || from);
  const type = req.query.type ? String(req.query.type) : null;
  if (type && !['payment', 'refund', 'expense'].includes(type)) return res.status(400).json({ error: 'نوع الحركة غير صحيح' });
  const result = await pool.query(`
    SELECT * FROM (
      SELECT p.id, 'payment' AS type, p.amount, p.payment_method, p.payment_at AS happened_at, p.notes, i.invoice_number AS reference, u.full_name AS created_by
      FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN users u ON u.id=p.received_by
      WHERE p.payment_at::date BETWEEN $1 AND $2
      UNION ALL
      SELECT r.id, 'refund' AS type, -r.amount AS amount, p.payment_method, r.created_at AS happened_at, r.reason AS notes, i.invoice_number AS reference, u.full_name AS created_by
      FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id JOIN users u ON u.id=r.created_by
      WHERE r.created_at::date BETWEEN $1 AND $2
      UNION ALL
      SELECT e.id, 'expense' AS type, -e.amount AS amount, e.payment_method, e.expense_date::timestamp AS happened_at, e.description AS notes, NULL AS reference, u.full_name AS created_by
      FROM expenses e JOIN users u ON u.id=e.created_by
      WHERE e.expense_date BETWEEN $1 AND $2
    ) activity ${type ? 'WHERE type=$3' : ''} ORDER BY happened_at DESC`, type ? [from, to, type] : [from, to]);
  res.json(result.rows);
});
financeRouter.get('/expense-categories', async (_req, res) => { const result = await pool.query(`SELECT id,name,is_active FROM expense_categories ORDER BY name`); res.json(result.rows); });
financeRouter.post('/expense-categories', async (req, res) => { if (!req.body.name?.trim()) return res.status(400).json({ error: 'اسم الفئة مطلوب' }); const result = await pool.query(`INSERT INTO expense_categories (name) VALUES ($1) RETURNING id,name,is_active`, [req.body.name.trim()]); res.status(201).json(result.rows[0]); });
financeRouter.post('/expenses', async (req, res) => {
  const body = req.body;
  if (!body.description?.trim() || body.amount === undefined || !body.paymentMethod) return res.status(400).json({ error: 'الوصف والقيمة وطريقة الدفع مطلوبة' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const key = requestKey(req); await lockRequest(client, key);
    const replay = await auditForKey(client, 'expense_created', key);
    if (replay) { const expense = await client.query(`SELECT * FROM expenses WHERE id=$1`, [replay.entity_id]); await client.query('COMMIT'); return res.json({ ...expense.rows[0], replayed: true }); }
    const result = await client.query(`INSERT INTO expenses (category_id,amount,expense_date,payment_method,description,notes,created_by,updated_by) VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6,$7,$7) RETURNING *`, [body.categoryId || null, moneyText(money(body.amount)), body.expenseDate || null, body.paymentMethod, body.description.trim(), body.notes || null, req.user!.id]);
    await audit(client, 'expense', result.rows[0].id, 'expense_created', req.user!.id, { amount: result.rows[0].amount, method: result.rows[0].payment_method, description: result.rows[0].description, idempotencyKey: key });
    await client.query('COMMIT'); res.status(201).json(result.rows[0]);
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
});
financeRouter.post('/commission-rules', async (req, res) => { const body = req.body; if (!body.doctorId || !['percentage','fixed'].includes(body.ruleType)) return res.status(400).json({ error: 'بيانات قاعدة العمولة غير صحيحة' }); const result = await pool.query(`INSERT INTO commission_rules (doctor_id,service_id,rule_type,value,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [body.doctorId, body.serviceId || null, body.ruleType, moneyText(money(body.value)), req.user!.id]); res.status(201).json(result.rows[0]); });
financeRouter.get('/dashboard', async (req, res) => {
  const from = String(req.query.from || cairoTodayIso());
  const to = String(req.query.to || from);
  const summary = await pool.query(`SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'),0) revenue, COALESCE(SUM(remaining_amount) FILTER (WHERE status NOT IN ('cancelled','refunded')),0) outstanding, COUNT(*) FILTER (WHERE status <> 'cancelled') invoices FROM invoices WHERE invoice_date BETWEEN $1 AND $2`, [from, to]);
  const collections = await pool.query(`SELECT COALESCE(SUM(amount),0) amount FROM (
    SELECT amount FROM payments WHERE payment_at::date BETWEEN $1 AND $2
    UNION ALL
    SELECT -r.amount FROM refunds r WHERE r.created_at::date BETWEEN $1 AND $2
  ) transactions`, [from, to]);
  const expenses = await pool.query(`SELECT COALESCE(SUM(amount),0) amount FROM expenses WHERE expense_date BETWEEN $1 AND $2`, [from, to]);
  const commissions = await pool.query(`SELECT COALESCE(SUM(dc.amount),0) amount FROM doctor_commissions dc JOIN invoice_items ii ON ii.id=dc.invoice_item_id JOIN invoices i ON i.id=ii.invoice_id WHERE i.invoice_date BETWEEN $1 AND $2 AND i.status <> 'cancelled'`, [from, to]);
  const methods = await pool.query(`SELECT payment_method, SUM(amount) amount FROM (
    SELECT payment_method, amount FROM payments WHERE payment_at::date BETWEEN $1 AND $2
    UNION ALL
    SELECT p.payment_method, -r.amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.created_at::date BETWEEN $1 AND $2
  ) transactions GROUP BY payment_method ORDER BY amount DESC`, [from, to]);
  const doctors = await pool.query(`SELECT u.full_name doctor_name, COALESCE(SUM(i.total) FILTER (WHERE i.status <> 'cancelled'),0) revenue, COALESCE(SUM(dc.amount),0) commission FROM users u LEFT JOIN invoices i ON i.doctor_id=u.id AND i.invoice_date BETWEEN $1 AND $2 LEFT JOIN invoice_items ii ON ii.invoice_id=i.id LEFT JOIN doctor_commissions dc ON dc.invoice_item_id=ii.id WHERE u.role='doctor' GROUP BY u.id,u.full_name ORDER BY revenue DESC`, [from, to]);
  const services = await pool.query(`SELECT ii.service_name, COALESCE(SUM(ii.line_total),0) amount FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.invoice_date BETWEEN $1 AND $2 AND i.status <> 'cancelled' GROUP BY ii.service_name ORDER BY amount DESC`, [from, to]);
  res.json({ from, to, ...summary.rows[0], collected: collections.rows[0].amount, expenses: expenses.rows[0].amount, commissions: commissions.rows[0].amount, netOperatingResult: moneyText(money(collections.rows[0].amount) - money(expenses.rows[0].amount) - money(commissions.rows[0].amount)), byPaymentMethod: methods.rows, byDoctor: doctors.rows, byService: services.rows });
});
async function cashPosition(client: any, date: string) {
  const payments = await client.query(`SELECT COALESCE(SUM(amount),0) amount FROM payments WHERE payment_method='cash' AND payment_at::date=$1`, [date]);
  const refunds = await client.query(`SELECT COALESCE(SUM(r.amount),0) amount FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.payment_method='cash' AND r.created_at::date=$1`, [date]);
  const expenses = await client.query(`SELECT COALESCE(SUM(amount),0) amount FROM expenses WHERE payment_method='cash' AND expense_date=$1`, [date]);
  const nonCash = await client.query(`SELECT COALESCE(SUM(amount),0) amount FROM payments WHERE payment_method <> 'cash' AND payment_at::date=$1`, [date]);
  return { cashCollected: payments.rows[0].amount, nonCashCollected: nonCash.rows[0].amount, cashRefunds: refunds.rows[0].amount, cashExpenses: expenses.rows[0].amount, expectedClosingCash: moneyText(money(payments.rows[0].amount) - money(refunds.rows[0].amount) - money(expenses.rows[0].amount)) };
}
financeRouter.get('/cashier/today', async (_req, res) => { const client = await pool.connect(); try { res.json(await cashPosition(client, cairoTodayIso())); } finally { client.release(); } });
financeRouter.post('/cashier/close', async (req,res) => {
  if (req.body.actualCash === undefined) return res.status(400).json({ error: 'النقد الفعلي مطلوب' });
  const today = cairoTodayIso(); const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM cashier_closings WHERE closing_date=$1 FOR UPDATE`, [today]);
    if (existing.rows[0]) throw Object.assign(new Error('تم إغلاق صندوق اليوم بالفعل؛ لا يمكن استبدال الإغلاق'), { status: 409 });
    const position = await cashPosition(client, today); const opening = money(req.body.openingCash ?? 0); const expected = money(position.expectedClosingCash) + opening;
    const result = await client.query(`INSERT INTO cashier_closings (closing_date,opening_cash,expected_cash,actual_cash,notes,closed_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [today, moneyText(opening), moneyText(expected), moneyText(money(req.body.actualCash)), req.body.notes || null, req.user!.id]);
    await audit(client, 'cashier_closing', result.rows[0].id, 'cashier_closed', req.user!.id, { date: today, openingCash: result.rows[0].opening_cash, expectedCash: result.rows[0].expected_cash, actualCash: result.rows[0].actual_cash, variance: moneyText(money(result.rows[0].actual_cash) - money(result.rows[0].expected_cash)) });
    await client.query('COMMIT'); res.status(201).json(result.rows[0]);
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
});

financeRouter.get('/invoices/:id/audit', async (req, res) => {
  const result = await pool.query(`SELECT a.action,a.details,a.created_at,u.full_name performed_by FROM financial_audit_logs a JOIN users u ON u.id=a.performed_by WHERE (a.entity_type='invoice' AND a.entity_id=$1::uuid) OR (a.entity_type IN ('payment','refund') AND a.details->>'invoiceId'=$2::text) ORDER BY a.created_at DESC`, [req.params.id, req.params.id]);
  res.json(result.rows.map((row) => ({ action: row.action, details: row.details, at: row.created_at, performedBy: row.performed_by })));
});
