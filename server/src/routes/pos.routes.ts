import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { httpError, lineTotalCents, moneyText, parseMoney, parseQuantity, quantityText } from '../lib/decimalMoney.js';

export const posRouter = Router();
posRouter.use(requireAuth);

const requireInvoiceRead = anyPermission('invoices.finalize', 'invoices.draft.manage', 'payments.receive');
const requireSale = requirePermission('invoices.finalize');
const requirePayments = requirePermission('payments.receive');

posRouter.get('/pos/shift', requirePayments, async (req, res) => {
  const shift = await pool.query(
    `SELECT id,status,currency,opened_at AS "openedAt",opening_cash::text AS "openingCash"
       FROM cashier_shifts WHERE clinic_id=$1 AND branch_id=$2 AND cashier_id=$3 AND status='open'`,
    [req.auth!.clinicId, req.auth!.branchId, req.auth!.userId],
  );
  res.json(shift.rows[0] ?? null);
});

posRouter.post('/pos/shifts/open', requirePayments, async (req, res) => {
  let openingCash: bigint;
  try { openingCash = parseMoney(req.body?.openingCash ?? '0'); }
  catch (error: any) { return res.status(error.status ?? 400).json({ error: error.message }); }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currency = await client.query(`SELECT default_currency FROM clinics WHERE id=$1`, [req.auth!.clinicId]);
    const created = await client.query(
      `INSERT INTO cashier_shifts (clinic_id,branch_id,cashier_id,currency,opening_cash)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,status,currency,opened_at AS "openedAt",opening_cash::text AS "openingCash"`,
      [req.auth!.clinicId, req.auth!.branchId, req.auth!.userId, currency.rows[0].default_currency, moneyText(openingCash)],
    );
    await client.query('COMMIT');
    res.status(201).json(created.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'لديك وردية مفتوحة بالفعل' });
    throw error;
  } finally { client.release(); }
});

posRouter.post('/pos/shifts/:shiftId/close', requirePayments, async (req, res) => {
  let counted: bigint;
  try { counted = parseMoney(req.body?.countedCash); }
  catch (error: any) { return res.status(error.status ?? 400).json({ error: error.message }); }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const shift = await client.query(`SELECT * FROM cashier_shifts WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND cashier_id=$4 AND status='open' FOR UPDATE`, [req.params.shiftId, req.auth!.clinicId, req.auth!.branchId, req.auth!.userId]);
    if (!shift.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الوردية المفتوحة غير موجودة' }); }
    const cash = await client.query(`SELECT COALESCE(sum(amount),0)::text AS total FROM payments WHERE clinic_id=$1 AND branch_id=$2 AND cashier_shift_id=$3 AND method='cash' AND status='captured'`, [req.auth!.clinicId, req.auth!.branchId, req.params.shiftId]);
    const expected = parseMoney(shift.rows[0].opening_cash) + parseMoney(cash.rows[0].total);
    const variance = counted - expected;
    const updated = await client.query(
      `UPDATE cashier_shifts SET status='closed',closed_at=now(),expected_cash=$1,counted_cash=$2,variance=$3,updated_at=now()
       WHERE id=$4 AND clinic_id=$5 AND branch_id=$6 RETURNING id,status,opening_cash::text AS "openingCash",expected_cash::text AS "expectedCash",counted_cash::text AS "countedCash",variance::text,closed_at AS "closedAt"`,
      [moneyText(expected), moneyText(counted), signedMoneyText(variance), req.params.shiftId, req.auth!.clinicId, req.auth!.branchId],
    );
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error: any) { await client.query('ROLLBACK'); if (error.status) return res.status(error.status).json({ error: error.message }); throw error; }
  finally { client.release(); }
});

posRouter.get('/invoices', requireInvoiceRead, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const result = await pool.query(
    `SELECT i.id,i.invoice_number AS "invoiceNumber",i.status,i.currency,i.total::text,
            COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0)::text AS "paidAmount",
            (i.total-COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0))::text AS "remainingAmount",
            i.customer_id AS "customerId",c.name AS "customerName",i.finalized_at AS "finalizedAt"
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id AND c.clinic_id=i.clinic_id AND c.branch_id=i.branch_id
      WHERE i.clinic_id=$1 AND i.branch_id=$2 AND i.finalized_at IS NOT NULL
        AND ($3='' OR i.invoice_number ILIKE '%'||$3||'%' OR c.name ILIKE '%'||$3||'%')
      ORDER BY i.finalized_at DESC,i.id LIMIT 100`,
    [req.auth!.clinicId, req.auth!.branchId, q],
  );
  res.json(result.rows);
});

posRouter.get('/invoices/:invoiceId', requireInvoiceRead, async (req, res) => {
  const invoice = await pool.query(
    `SELECT i.id,i.invoice_number AS "invoiceNumber",i.status,i.currency,i.subtotal::text,i.discount_total::text AS "discountTotal",i.tax_total::text AS "taxTotal",i.total::text,i.customer_id AS "customerId",c.name AS "customerName",i.finalized_at AS "finalizedAt",
            COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0)::text AS "paidAmount",
            (i.total-COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0))::text AS "remainingAmount"
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id AND c.clinic_id=i.clinic_id AND c.branch_id=i.branch_id
      WHERE i.id=$1 AND i.clinic_id=$2 AND i.branch_id=$3 AND i.finalized_at IS NOT NULL`,
    [req.params.invoiceId, req.auth!.clinicId, req.auth!.branchId],
  );
  if (!invoice.rows[0]) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  const [lines, payments] = await Promise.all([
    pool.query(`SELECT id,description,quantity::text,unit_price::text AS "unitPrice",line_total::text AS "lineTotal",variant_id AS "variantId",service_product_id AS "serviceProductId",lot_id AS "lotId" FROM invoice_lines WHERE invoice_id=$1 AND clinic_id=$2 AND branch_id=$3 ORDER BY created_at,id`, [req.params.invoiceId, req.auth!.clinicId, req.auth!.branchId]),
    pool.query(`SELECT p.id,p.amount::text,p.method,p.captured_at AS "capturedAt",pa.amount::text AS "allocatedAmount" FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id AND p.clinic_id=pa.clinic_id AND p.branch_id=pa.branch_id WHERE pa.invoice_id=$1 AND pa.clinic_id=$2 AND pa.branch_id=$3 ORDER BY p.captured_at,p.id`, [req.params.invoiceId, req.auth!.clinicId, req.auth!.branchId]),
  ]);
  res.json({ ...invoice.rows[0], lines: lines.rows, payments: payments.rows });
});

posRouter.post('/pos/sales', requireSale, async (req, res) => {
  const key = String(req.header('Idempotency-Key') ?? '').trim();
  if (!key || key.length > 160) return res.status(400).json({ error: 'ترويسة Idempotency-Key مطلوبة' });
  let request: NormalizedSale;
  try { request = normalizeSale(req.body); }
  catch (error: any) { return res.status(error.status ?? 400).json({ error: error.message }); }
  if (request.lines.length === 0) return res.status(400).json({ error: 'أضف صنفًا واحدًا على الأقل' });
  if (request.payments.reduce((sum, p) => sum + p.amount, 0n) > MAX_CENTS) return res.status(400).json({ error: 'إجمالي الدفعات أكبر من الحد المسموح' });
  const requestHash = hashSale(request);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`${req.auth!.clinicId}:sale:${key}`]);
    const existing = await client.query(`SELECT id,branch_id,request_hash FROM invoices WHERE clinic_id=$1 AND idempotency_key=$2`, [req.auth!.clinicId, key]);
    if (existing.rows[0]) {
      if (existing.rows[0].branch_id !== req.auth!.branchId) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'مفتاح التكرار مستخدم في فرع آخر' }); }
      if (existing.rows[0].request_hash !== requestHash) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'تم استخدام مفتاح التكرار لطلب بيع مختلف' }); }
      const detail = await invoiceDetail(client, existing.rows[0].id, req.auth!.clinicId, req.auth!.branchId);
      await client.query('COMMIT');
      return res.json({ ...detail, idempotentReplay: true, stockWarnings: [] });
    }

    const clinicResult = await client.query(`SELECT default_currency,settings FROM clinics WHERE id=$1`, [req.auth!.clinicId]);
    if (!clinicResult.rows[0]) throw httpError(403, 'العيادة غير متاحة');
    const currency = clinicResult.rows[0].default_currency as string;
    const allowNegative = clinicResult.rows[0].settings?.allow_negative_stock === true;
    if (request.customerId) {
      const customer = await client.query(`SELECT id FROM customers WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [request.customerId, req.auth!.clinicId, req.auth!.branchId]);
      if (!customer.rows[0]) throw httpError(400, 'العميل غير صالح');
    }

    const locationId = await defaultLocation(client, req.auth!.clinicId, req.auth!.branchId);
    const resolved: ResolvedLine[] = [];
    for (const line of request.lines) {
      if (line.variantId) {
        const result = await client.query(
          `SELECT v.id,v.name AS variant_name,v.price::text,v.currency,p.name AS product_name,p.track_lots,p.is_service,p.active
             FROM product_variants v JOIN products p ON p.id=v.product_id AND p.clinic_id=v.clinic_id AND p.branch_id=v.branch_id
            WHERE v.id=$1 AND v.clinic_id=$2 AND v.branch_id=$3 AND v.active AND p.active`,
          [line.variantId, req.auth!.clinicId, req.auth!.branchId],
        );
        if (!result.rows[0] || result.rows[0].is_service) throw httpError(404, 'أحد متغيرات المنتج غير متاح');
        const row = result.rows[0];
        if (row.currency !== currency) throw httpError(400, 'عملة المنتج لا تطابق عملة العيادة');
        if (row.track_lots && !line.lotId) throw httpError(400, `اختر تشغيلة للمنتج ${row.product_name}`);
        if (!row.track_lots && line.lotId) throw httpError(400, 'هذا المنتج لا يستخدم التشغيلات');
        let lotId: string | null = null;
        if (line.lotId) {
          const lot = await client.query(`SELECT id FROM inventory_lots WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND variant_id=$4 AND location_id=$5 AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE)`, [line.lotId, req.auth!.clinicId, req.auth!.branchId, line.variantId, locationId]);
          if (!lot.rows[0]) throw httpError(400, 'التشغيلة المختارة غير متاحة لهذا المنتج');
          lotId = lot.rows[0].id;
        }
        if (line.unitPrice !== null && !req.auth!.permissions.includes('catalog.prices.manage')) throw httpError(403, 'تغيير سعر البيع متاح للمدير فقط');
        const price = line.unitPrice ?? parseMoney(row.price);
        resolved.push({ ...line, lotId, description: `${row.product_name} — ${row.variant_name}`, unitPrice: price, currency, locationId, variantId: row.id, serviceProductId: null, trackLots: Boolean(row.track_lots), total: lineTotalCents(line.quantity, price) });
      } else {
        const result = await client.query(`SELECT id,name,default_unit_price::text AS price,currency FROM products WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active AND is_service`, [line.serviceProductId, req.auth!.clinicId, req.auth!.branchId]);
        if (!result.rows[0]) throw httpError(404, 'الخدمة غير متاحة');
        if (result.rows[0].currency !== currency) throw httpError(400, 'عملة الخدمة لا تطابق عملة العيادة');
        if (line.unitPrice !== null && !req.auth!.permissions.includes('catalog.prices.manage')) throw httpError(403, 'تغيير سعر البيع متاح للمدير فقط');
        const price = line.unitPrice ?? parseMoney(result.rows[0].price ?? '0.00');
        resolved.push({ ...line, lotId: null, description: result.rows[0].name, unitPrice: price, currency, locationId: null, variantId: null, serviceProductId: result.rows[0].id, trackLots: false, total: lineTotalCents(line.quantity, price) });
      }
    }

    const subtotal = resolved.reduce((sum, line) => sum + line.total, 0n);
    if (subtotal > MAX_CENTS) throw httpError(400, 'إجمالي الفاتورة أكبر من الحد المسموح');
    const paid = request.payments.reduce((sum, payment) => sum + payment.amount, 0n);
    if (paid > subtotal) throw httpError(400, 'إجمالي الدفع لا يمكن أن يتجاوز إجمالي الفاتورة');
    if (paid < subtotal && !request.customerId) throw httpError(400, 'يجب تحديد عميل للمبيعات الآجلة أو غير مكتملة الدفع');

    const cashShift = request.payments.some((p) => p.method === 'cash') ? await openShift(client, req.auth!.clinicId, req.auth!.branchId, req.auth!.userId) : null;
    if (request.payments.some((p) => p.method === 'cash') && !cashShift) throw httpError(409, 'افتح وردية الصندوق قبل استلام النقدية');

    const stockWarnings: Array<{ variantId: string; available: string; requested: string }> = [];
    const stockNeeds = new Map<string, { variantId: string; lotId: string | null; quantity: bigint }>();
    for (const line of resolved.filter((l) => l.variantId)) {
      const keyPart = `${line.variantId}:${line.lotId ?? ''}`;
      const old = stockNeeds.get(keyPart);
      stockNeeds.set(keyPart, { variantId: line.variantId!, lotId: line.lotId, quantity: (old?.quantity ?? 0n) + line.quantity });
    }
    const orderedNeeds = [...stockNeeds.values()].sort((a, b) => `${a.variantId}:${a.lotId ?? ''}`.localeCompare(`${b.variantId}:${b.lotId ?? ''}`));
    const lockedStocks = new Map<string, bigint>();
    for (const need of orderedNeeds) {
      if (need.lotId) {
        await client.query(`INSERT INTO stock_balances (clinic_id,branch_id,location_id,variant_id,lot_id,on_hand) VALUES ($1,$2,$3,$4,$5,0) ON CONFLICT (clinic_id,branch_id,location_id,variant_id,lot_id) WHERE lot_id IS NOT NULL DO NOTHING`, [req.auth!.clinicId, req.auth!.branchId, locationId, need.variantId, need.lotId]);
      } else {
        await client.query(`INSERT INTO stock_balances (clinic_id,branch_id,location_id,variant_id,lot_id,on_hand) VALUES ($1,$2,$3,$4,NULL,0) ON CONFLICT (clinic_id,branch_id,location_id,variant_id) WHERE lot_id IS NULL DO NOTHING`, [req.auth!.clinicId, req.auth!.branchId, locationId, need.variantId]);
      }
      const balance = await client.query(`SELECT on_hand::text FROM stock_balances WHERE clinic_id=$1 AND branch_id=$2 AND location_id=$3 AND variant_id=$4 AND lot_id IS NOT DISTINCT FROM $5::uuid FOR UPDATE`, [req.auth!.clinicId, req.auth!.branchId, locationId, need.variantId, need.lotId]);
      const available = parseQuantityPositive(balance.rows[0]?.on_hand ?? '0');
      lockedStocks.set(`${need.variantId}:${need.lotId ?? ''}`, available);
      if (available < need.quantity) {
        if (!allowNegative) throw httpError(409, 'الرصيد غير كافٍ لإتمام البيع');
        stockWarnings.push({ variantId: need.variantId, available: signedQuantityText(available), requested: quantityText(need.quantity) });
      }
    }

    const numberRow = await client.query(`UPDATE clinics SET invoice_number_counter=invoice_number_counter+1,updated_at=now() WHERE id=$1 RETURNING invoice_number_counter-1 AS number`, [req.auth!.clinicId]);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(numberRow.rows[0].number).padStart(6, '0')}`;
    const invoice = await client.query(
      `INSERT INTO invoices (clinic_id,branch_id,customer_id,invoice_number,status,currency,subtotal,total,idempotency_key,request_hash,created_by,finalized_at)
       VALUES ($1,$2,$3,NULL,'draft',$4,$5,$5,$6,$7,$8,NULL) RETURNING id`,
      [req.auth!.clinicId, req.auth!.branchId, request.customerId, currency, moneyText(subtotal), key, requestHash, req.auth!.userId],
    );
    const invoiceId = invoice.rows[0].id as string;
    const createdLines: Array<{ id: string; line: ResolvedLine }> = [];
    for (const line of resolved) {
      const created = await client.query(
        `INSERT INTO invoice_lines (clinic_id,branch_id,invoice_id,source_type,source_id,source_line_id,variant_id,service_product_id,location_id,lot_id,description,quantity,unit_price,line_total,currency)
         VALUES ($1,$2,$3,'pos_sale',$3,gen_random_uuid(),$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [req.auth!.clinicId, req.auth!.branchId, invoiceId, line.variantId, line.serviceProductId, line.locationId, line.lotId, line.description, quantityText(line.quantity), moneyText(line.unitPrice), moneyText(line.total), currency],
      );
      createdLines.push({ id: created.rows[0].id, line });
    }
    const initialStatus = paid === subtotal ? 'paid' : 'open';
    await client.query(`UPDATE invoices SET invoice_number=$1,status=$2,finalized_at=now(),updated_at=now() WHERE id=$3 AND clinic_id=$4 AND branch_id=$5`, [invoiceNumber, initialStatus, invoiceId, req.auth!.clinicId, req.auth!.branchId]);

    for (const created of createdLines) {
      if (!created.line.variantId) continue;
      await client.query(
        `INSERT INTO stock_movements (clinic_id,branch_id,variant_id,location_id,lot_id,movement_type,quantity_delta,source_type,source_id,source_line_id,actor_id)
         VALUES ($1,$2,$3,$4,$5,'sale',$6,'pos_sale',$7,$8,$9)`,
        [req.auth!.clinicId, req.auth!.branchId, created.line.variantId, created.line.locationId, created.line.lotId, `-${quantityText(created.line.quantity)}`, invoiceId, created.id, req.auth!.userId],
      );
    }
    for (const payment of request.payments) {
      const inserted = await client.query(
        `INSERT INTO payments (clinic_id,branch_id,customer_id,cashier_shift_id,received_by,amount,currency,method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [req.auth!.clinicId, req.auth!.branchId, request.customerId, payment.method === 'cash' ? cashShift!.id : null, req.auth!.userId, moneyText(payment.amount), currency, payment.method],
      );
      await client.query(`INSERT INTO payment_allocations (clinic_id,branch_id,payment_id,invoice_id,amount,currency) VALUES ($1,$2,$3,$4,$5,$6)`, [req.auth!.clinicId, req.auth!.branchId, inserted.rows[0].id, invoiceId, moneyText(payment.amount), currency]);
    }
    await client.query(`INSERT INTO audit_events (clinic_id,branch_id,actor_id,event_type,entity_type,entity_id,safe_summary) VALUES ($1,$2,$3,'sale.finalized','invoice',$4,'POS sale finalized')`, [req.auth!.clinicId, req.auth!.branchId, req.auth!.userId, invoiceId]);
    const detail = await invoiceDetail(client, invoiceId, req.auth!.clinicId, req.auth!.branchId);
    await client.query('COMMIT');
    res.status(201).json({ ...detail, idempotentReplay: false, stockWarnings });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'تعارض في رقم الفاتورة أو مفتاح التكرار' });
    if (error.code === '23503' || error.code === '23514') return res.status(400).json({ error: 'بيانات البيع لا تتوافق مع قواعد المخزون أو الفاتورة' });
    throw error;
  } finally { client.release(); }
});

posRouter.get('/customers/:customerId/balance', requireInvoiceRead, async (req, res) => {
  const customer = await pool.query(`SELECT id FROM customers WHERE id=$1 AND clinic_id=$2 AND branch_id=$3`, [req.params.customerId, req.auth!.clinicId, req.auth!.branchId]);
  if (!customer.rows[0]) return res.status(404).json({ error: 'العميل غير موجود' });
  const result = await pool.query(
    `SELECT COALESCE(sum(i.total-COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0)),0)::text AS balance
       FROM invoices i WHERE i.clinic_id=$1 AND i.branch_id=$2 AND i.customer_id=$3 AND i.status='open'`,
    [req.auth!.clinicId, req.auth!.branchId, req.params.customerId],
  );
  const currency = await pool.query(`SELECT default_currency FROM clinics WHERE id=$1`, [req.auth!.clinicId]);
  res.json({ customerId: req.params.customerId, balance: result.rows[0].balance, currency: currency.rows[0].default_currency });
});

posRouter.get('/customers/:customerId/open-invoices', requireInvoiceRead, async (req, res) => {
  const result = await pool.query(
    `SELECT i.id,i.invoice_number AS "invoiceNumber",i.currency,i.total::text,
            COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0)::text AS "paidAmount",
            (i.total-COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0))::text AS "remainingAmount",
            i.finalized_at AS "finalizedAt"
       FROM invoices i WHERE i.clinic_id=$1 AND i.branch_id=$2 AND i.customer_id=$3 AND i.status='open'
      ORDER BY i.finalized_at,i.id`,
    [req.auth!.clinicId, req.auth!.branchId, req.params.customerId],
  );
  res.json(result.rows);
});

posRouter.post('/customers/:customerId/receive-payment', requirePayments, async (req, res) => {
  let amount: bigint;
  try { amount = parseMoney(req.body?.amount); }
  catch (error: any) { return res.status(error.status ?? 400).json({ error: error.message }); }
  const method = String(req.body?.method ?? '');
  if (!['cash', 'card', 'wallet', 'other'].includes(method)) return res.status(400).json({ error: 'طريقة الدفع غير صالحة' });
  const key = String(req.header('Idempotency-Key') ?? '').trim() || null;
  if (key && key.length > 160) return res.status(400).json({ error: 'مفتاح التكرار أطول من الحد المسموح' });
  const requestHash = createHash('sha256').update(JSON.stringify({ customerId: req.params.customerId, amount: moneyText(amount), method })).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (key) await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`${req.auth!.clinicId}:payment:${key}`]);
    if (key) {
      const existing = await client.query(`SELECT id,branch_id,request_hash FROM payments WHERE clinic_id=$1 AND idempotency_key=$2`, [req.auth!.clinicId, key]);
      if (existing.rows[0]) {
        if (existing.rows[0].branch_id !== req.auth!.branchId) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'مفتاح التكرار مستخدم في فرع آخر' }); }
        if (existing.rows[0].request_hash !== requestHash) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'تم استخدام مفتاح التكرار لدفعة مختلفة' }); }
        const allocations = await client.query(`SELECT pa.invoice_id AS "invoiceId",i.invoice_number AS "invoiceNumber",pa.amount::text FROM payment_allocations pa JOIN invoices i ON i.id=pa.invoice_id AND i.clinic_id=pa.clinic_id AND i.branch_id=pa.branch_id WHERE pa.payment_id=$1 AND pa.clinic_id=$2 AND pa.branch_id=$3 ORDER BY i.finalized_at`, [existing.rows[0].id, req.auth!.clinicId, req.auth!.branchId]);
        await client.query('COMMIT');
        return res.json({ paymentId: existing.rows[0].id, allocations: allocations.rows, idempotentReplay: true });
      }
    }
    const customer = await client.query(`SELECT id FROM customers WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [req.params.customerId, req.auth!.clinicId, req.auth!.branchId]);
    if (!customer.rows[0]) throw httpError(404, 'العميل غير موجود');
    const invoices = await client.query(
      `SELECT i.id,i.invoice_number,i.total::text,
              COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0)::text AS paid,
              i.currency
         FROM invoices i WHERE i.clinic_id=$1 AND i.branch_id=$2 AND i.customer_id=$3 AND i.status='open'
        ORDER BY i.finalized_at,i.id FOR UPDATE`,
      [req.auth!.clinicId, req.auth!.branchId, req.params.customerId],
    );
    const allocations = invoices.rows.map((row) => ({ ...row, outstanding: parseMoney(row.total) - parseMoney(row.paid) })).filter((row) => row.outstanding > 0n);
    const outstandingTotal = allocations.reduce((sum, row) => sum + row.outstanding, 0n);
    if (amount > outstandingTotal) throw httpError(400, 'المبلغ أكبر من الرصيد المستحق على العميل');
    if (amount <= 0n) throw httpError(400, 'المبلغ يجب أن يكون أكبر من صفر');
    const currencyResult = await client.query(`SELECT default_currency FROM clinics WHERE id=$1`, [req.auth!.clinicId]);
    const currency = currencyResult.rows[0].default_currency as string;
    if (allocations.some((invoice) => invoice.currency !== currency)) throw httpError(400, 'عملة الفواتير لا تطابق عملة العيادة');
    const shift = method === 'cash' ? await openShift(client, req.auth!.clinicId, req.auth!.branchId, req.auth!.userId) : null;
    if (method === 'cash' && !shift) throw httpError(409, 'افتح وردية الصندوق قبل استلام النقدية');
    const payment = await client.query(
      `INSERT INTO payments (clinic_id,branch_id,customer_id,cashier_shift_id,received_by,amount,currency,method,idempotency_key,request_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.auth!.clinicId, req.auth!.branchId, req.params.customerId, shift?.id ?? null, req.auth!.userId, moneyText(amount), currency, method, key, requestHash],
    );
    let remaining = amount;
    const createdAllocations = [];
    for (const invoice of allocations) {
      if (remaining === 0n) break;
      const allocated = remaining < invoice.outstanding ? remaining : invoice.outstanding;
      await client.query(`INSERT INTO payment_allocations (clinic_id,branch_id,payment_id,invoice_id,amount,currency) VALUES ($1,$2,$3,$4,$5,$6)`, [req.auth!.clinicId, req.auth!.branchId, payment.rows[0].id, invoice.id, moneyText(allocated), currency]);
      createdAllocations.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, amount: moneyText(allocated) });
      remaining -= allocated;
    }
    await client.query(`INSERT INTO audit_events (clinic_id,branch_id,actor_id,event_type,entity_type,entity_id,safe_summary) VALUES ($1,$2,$3,'payment.received','payment',$4,'Customer payment received')`, [req.auth!.clinicId, req.auth!.branchId, req.auth!.userId, payment.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ paymentId: payment.rows[0].id, allocations: createdAllocations, idempotentReplay: false });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'تعارض في مفتاح تكرار الدفعة' });
    if (error.code === '23503' || error.code === '23514') return res.status(400).json({ error: 'بيانات الدفعة لا تتوافق مع قواعد الفواتير' });
    throw error;
  } finally { client.release(); }
});

type NormalizedSale = { customerId: string | null; lines: Array<{ variantId: string | null; serviceProductId: string | null; lotId: string | null; quantity: bigint; unitPrice: bigint | null }>; payments: Array<{ method: 'cash' | 'card' | 'wallet' | 'other'; amount: bigint }> };
type ResolvedLine = NormalizedSale['lines'][number] & { description: string; unitPrice: bigint; currency: string; locationId: string | null; trackLots: boolean; total: bigint };
const MAX_CENTS = 99_999_999_999_999n;

function normalizeSale(body: any): NormalizedSale {
  if (!Array.isArray(body?.lines)) throw httpError(400, 'بنود البيع مطلوبة');
  const lines = body.lines.map((line: any) => {
    const variantId = line?.variantId ? String(line.variantId) : null;
    const serviceProductId = line?.serviceProductId ? String(line.serviceProductId) : null;
    if (Boolean(variantId) === Boolean(serviceProductId)) throw httpError(400, 'يجب اختيار متغير مخزني أو خدمة لكل بند');
    const quantity = parseQuantity(line.quantity);
    const unitPrice = line.unitPrice === undefined || line.unitPrice === null || line.unitPrice === '' ? null : parseMoney(line.unitPrice);
    return { variantId, serviceProductId, lotId: line.lotId ? String(line.lotId) : null, quantity, unitPrice };
  });
  const payments = (Array.isArray(body?.payments) ? body.payments : []).map((payment: any) => {
    const method = String(payment?.method ?? '');
    if (!['cash', 'card', 'wallet', 'other'].includes(method)) throw httpError(400, 'طريقة الدفع غير صالحة');
    const amount = parseMoney(payment.amount);
    if (amount <= 0n) throw httpError(400, 'كل دفعة يجب أن تكون أكبر من صفر');
    return { method: method as 'cash' | 'card' | 'wallet' | 'other', amount };
  });
  return { customerId: body?.customerId ? String(body.customerId) : null, lines, payments };
}

function hashSale(sale: NormalizedSale): string {
  const canonical = { customerId: sale.customerId, lines: sale.lines.map((l) => ({ variantId: l.variantId, serviceProductId: l.serviceProductId, lotId: l.lotId, quantity: l.quantity.toString(), unitPrice: l.unitPrice?.toString() ?? null })), payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount.toString() })) };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function parseQuantityPositive(value: unknown): bigint {
  const text = String(value ?? '0');
  if (!/^-?(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(text)) throw httpError(500, 'رصيد مخزون غير صالح');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const amount = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return negative ? -amount : amount;
}

function signedMoneyText(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function signedQuantityText(milli: bigint): string {
  const sign = milli < 0n ? '-' : '';
  const absolute = milli < 0n ? -milli : milli;
  return `${sign}${absolute / 1000n}.${String(absolute % 1000n).padStart(3, '0')}`;
}

async function defaultLocation(client: PoolClient, clinicId: string, branchId: string): Promise<string> {
  const found = await client.query(`SELECT id FROM inventory_locations WHERE clinic_id=$1 AND branch_id=$2 AND active ORDER BY created_at,id LIMIT 1`, [clinicId, branchId]);
  if (found.rows[0]) return found.rows[0].id;
  const created = await client.query(`INSERT INTO inventory_locations (clinic_id,branch_id,code,name) VALUES ($1,$2,'main','المخزن الرئيسي') ON CONFLICT (clinic_id,branch_id,code) DO UPDATE SET active=true RETURNING id`, [clinicId, branchId]);
  return created.rows[0].id;
}

async function openShift(client: PoolClient, clinicId: string, branchId: string, cashierId: string) {
  const result = await client.query(`SELECT id FROM cashier_shifts WHERE clinic_id=$1 AND branch_id=$2 AND cashier_id=$3 AND status='open' FOR UPDATE`, [clinicId, branchId, cashierId]);
  return result.rows[0] ?? null;
}

async function invoiceDetail(client: PoolClient, invoiceId: string, clinicId: string, branchId: string) {
  const invoice = await client.query(
    `SELECT i.id,i.invoice_number AS "invoiceNumber",i.status,i.currency,i.subtotal::text,i.total::text,i.customer_id AS "customerId",c.name AS "customerName",i.finalized_at AS "finalizedAt",
            COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0)::text AS "paidAmount",
            (i.total-COALESCE((SELECT sum(pa.amount) FROM payment_allocations pa WHERE pa.invoice_id=i.id AND pa.clinic_id=i.clinic_id),0))::text AS "remainingAmount"
       FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id AND c.clinic_id=i.clinic_id AND c.branch_id=i.branch_id
      WHERE i.id=$1 AND i.clinic_id=$2 AND i.branch_id=$3 AND i.finalized_at IS NOT NULL`,
    [invoiceId, clinicId, branchId],
  );
  const lines = await client.query(`SELECT id,description,quantity::text,unit_price::text AS "unitPrice",line_total::text AS "lineTotal",variant_id AS "variantId",service_product_id AS "serviceProductId",lot_id AS "lotId" FROM invoice_lines WHERE invoice_id=$1 AND clinic_id=$2 AND branch_id=$3 ORDER BY created_at,id`, [invoiceId, clinicId, branchId]);
  return { ...invoice.rows[0], lines: lines.rows };
}

function anyPermission(...codes: string[]) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (req.auth?.permissions.some((permission) => codes.includes(permission))) return next();
    return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
  };
}
