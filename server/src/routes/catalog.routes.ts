import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

const writeCatalog = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  if (req.auth!.permissions.some((p) => ['catalog.prices.manage', 'goods_receipts.post'].includes(p))) return next();
  return res.status(403).json({ error: 'لا تملك صلاحية تعديل الكتالوج' });
};

const pricePermission = requirePermission('catalog.prices.manage');
const receivePermission = requirePermission('goods_receipts.post');
const readCatalog = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
  if (req.auth!.permissions.some((p) => ['catalog.read', 'invoices.draft.manage', 'invoices.finalize'].includes(p))) return next();
  return res.status(403).json({ error: 'لا تملك صلاحية قراءة الكتالوج' });
};

catalogRouter.get('/products', readCatalog, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const result = await pool.query(
    `SELECT p.id,p.code,p.name,p.category,p.description,p.is_service AS "isService",p.track_lots AS "trackLots",
            p.default_unit_price::text AS "defaultUnitPrice",p.currency,p.active,
            COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'name',v.name,'unit',v.unit,'price',v.price::text,'cost',v.cost::text,'currency',v.currency,'active',v.active,'barcodes',COALESCE((SELECT jsonb_agg(pb.barcode ORDER BY pb.barcode) FROM product_barcodes pb WHERE pb.variant_id=v.id AND pb.clinic_id=p.clinic_id AND pb.branch_id=p.branch_id),'[]'::jsonb),'onHand',COALESCE((SELECT sum(sb.on_hand) FROM stock_balances sb WHERE sb.variant_id=v.id AND sb.clinic_id=p.clinic_id AND sb.branch_id=p.branch_id),0)::text)
              ORDER BY v.name) FILTER (WHERE v.id IS NOT NULL),'[]'::jsonb) AS variants
       FROM products p LEFT JOIN product_variants v ON v.product_id=p.id AND v.clinic_id=p.clinic_id AND v.branch_id=p.branch_id
      WHERE p.clinic_id=$1 AND p.branch_id=$2 AND p.active
        AND ($3='' OR p.name ILIKE '%'||$3||'%' OR p.code ILIKE '%'||$3||'%'
             OR EXISTS (SELECT 1 FROM product_barcodes pb WHERE pb.clinic_id=p.clinic_id AND pb.branch_id=p.branch_id AND lower(btrim(pb.barcode))=lower(btrim($3)) AND pb.variant_id=v.id))
      GROUP BY p.id ORDER BY p.name LIMIT 200`,
    [req.auth!.clinicId, req.auth!.branchId, q],
  );
  res.json(result.rows);
});

catalogRouter.get('/products/barcode/:barcode', readCatalog, async (req, res) => {
  const barcode = String(req.params.barcode ?? '').trim();
  if (!barcode) return res.status(400).json({ error: 'الباركود مطلوب' });
  const result = await pool.query(
    `SELECT p.id AS "productId",p.name AS "productName",p.code AS "productCode",p.is_service AS "isService",
            p.track_lots AS "trackLots",v.id AS "variantId",v.sku,v.name AS "variantName",v.unit,
            v.price::text AS price,v.currency,COALESCE(sum(sb.on_hand),0)::text AS "onHand"
       FROM product_barcodes pb JOIN product_variants v ON v.id=pb.variant_id AND v.clinic_id=pb.clinic_id AND v.branch_id=pb.branch_id
       JOIN products p ON p.id=v.product_id AND p.clinic_id=v.clinic_id AND p.branch_id=v.branch_id
       LEFT JOIN stock_balances sb ON sb.variant_id=v.id AND sb.clinic_id=v.clinic_id AND sb.branch_id=v.branch_id
      WHERE pb.clinic_id=$1 AND pb.branch_id=$2 AND p.active AND v.active
        AND lower(btrim(pb.barcode))=lower(btrim($3))
      GROUP BY p.id,v.id`,
    [req.auth!.clinicId, req.auth!.branchId, barcode],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'لم يتم العثور على منتج بهذا الباركود' });
  res.json(result.rows[0]);
});

catalogRouter.get('/products/:productId', readCatalog, async (req, res) => {
  const result = await pool.query(
    `SELECT p.id,p.code,p.name,p.category,p.description,p.is_service AS "isService",p.track_lots AS "trackLots",p.default_unit_price::text AS "defaultUnitPrice",p.currency,p.active
       FROM products p WHERE p.id=$1 AND p.clinic_id=$2 AND p.branch_id=$3`,
    [req.params.productId, req.auth!.clinicId, req.auth!.branchId],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'المنتج غير موجود' });
  const variants = await pool.query(`SELECT v.id,v.sku,v.name,v.unit,v.price::text AS price,v.cost::text AS cost,v.currency,v.active,COALESCE((SELECT jsonb_agg(barcode ORDER BY barcode) FROM product_barcodes WHERE variant_id=v.id AND clinic_id=v.clinic_id AND branch_id=v.branch_id),'[]'::jsonb) AS barcodes,COALESCE((SELECT sum(on_hand) FROM stock_balances WHERE variant_id=v.id AND clinic_id=v.clinic_id AND branch_id=v.branch_id),0)::text AS "onHand" FROM product_variants v WHERE v.product_id=$1 AND v.clinic_id=$2 AND v.branch_id=$3 ORDER BY v.name`, [req.params.productId, req.auth!.clinicId, req.auth!.branchId]);
  res.json({ ...result.rows[0], variants: variants.rows });
});

catalogRouter.post('/products', writeCatalog, async (req, res) => {
  const code = String(req.body?.code ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  const isService = Boolean(req.body?.isService);
  const trackLots = Boolean(req.body?.trackLots);
  const variants = Array.isArray(req.body?.variants) ? req.body.variants : [];
  if (!code || !name) return res.status(400).json({ error: 'رمز المنتج واسمه مطلوبان' });
  if (isService && (trackLots || variants.length)) return res.status(400).json({ error: 'الخدمة لا تحمل مخزونًا أو متغيرات مخزنية' });
  if (!isService && variants.length === 0) return res.status(400).json({ error: 'أضف متغيرًا واحدًا على الأقل للمنتج المخزني' });
  const canSetPrice = req.auth!.permissions.includes('catalog.prices.manage');
  if (!canSetPrice && (isService || req.body?.defaultUnitPrice !== undefined || variants.some((v: any) => v.price !== undefined || v.cost !== undefined))) return res.status(403).json({ error: 'تحديد الأسعار والتكاليف متاح للمدير فقط' });
  if (req.body?.defaultUnitPrice !== undefined && !isMoney(req.body.defaultUnitPrice)) return res.status(400).json({ error: 'السعر غير صالح' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const clinic = await client.query(`SELECT default_currency FROM clinics WHERE id=$1`, [req.auth!.clinicId]);
    if (!clinic.rows[0]) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'العيادة غير متاحة' }); }
    const currency = clinic.rows[0].default_currency as string;
    const product = await client.query(
      `INSERT INTO products (clinic_id,branch_id,code,name,category,description,is_service,track_lots,default_unit_price,currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id,code,name,category,description,is_service AS "isService",track_lots AS "trackLots",default_unit_price::text AS "defaultUnitPrice",currency`,
      [req.auth!.clinicId, req.auth!.branchId, code, name, nullable(req.body?.category), nullable(req.body?.description), isService, trackLots, req.body?.defaultUnitPrice == null ? null : moneyText(req.body.defaultUnitPrice), currency],
    );
    const createdVariants = [];
    for (const v of variants) createdVariants.push(await insertVariant(client, req.auth!.clinicId, req.auth!.branchId, product.rows[0].id, currency, v));
    await client.query('COMMIT');
    res.status(201).json({ ...product.rows[0], variants: createdVariants });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'رمز المنتج أو المتغير أو الباركود مستخدم بالفعل' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  } finally { client.release(); }
});

catalogRouter.patch('/products/:productId', writeCatalog, async (req, res) => {
  if (req.body?.defaultUnitPrice !== undefined && !req.auth!.permissions.includes('catalog.prices.manage')) return res.status(403).json({ error: 'تعديل الأسعار متاح للمدير فقط' });
  if (req.body?.defaultUnitPrice !== undefined && req.body.defaultUnitPrice !== null && !isMoney(req.body.defaultUnitPrice)) return res.status(400).json({ error: 'السعر غير صالح' });
  const result = await pool.query(
    `UPDATE products SET name=COALESCE($4,name),category=CASE WHEN $5 THEN $6 ELSE category END,
       description=CASE WHEN $7 THEN $8 ELSE description END,track_lots=COALESCE($9,track_lots),
       default_unit_price=CASE WHEN $10 THEN $11::numeric ELSE default_unit_price END,updated_at=now()
     WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active
     RETURNING id,code,name,category,description,is_service AS "isService",track_lots AS "trackLots",default_unit_price::text AS "defaultUnitPrice",currency`,
    [req.params.productId, req.auth!.clinicId, req.auth!.branchId, optionalText(req.body?.name), req.body?.category !== undefined, nullable(req.body?.category), req.body?.description !== undefined, nullable(req.body?.description), req.body?.trackLots ?? null, req.body?.defaultUnitPrice !== undefined, req.body?.defaultUnitPrice == null ? null : moneyText(req.body.defaultUnitPrice)],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'المنتج غير موجود أو غير نشط' });
  res.json(result.rows[0]);
});

catalogRouter.patch('/products/:productId/deactivate', writeCatalog, async (req, res) => {
  const result = await pool.query(`UPDATE products SET active=false,updated_at=now() WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active RETURNING id`, [req.params.productId, req.auth!.clinicId, req.auth!.branchId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'المنتج غير موجود أو غير نشط' });
  await pool.query(`UPDATE product_variants SET active=false,updated_at=now() WHERE product_id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [req.params.productId, req.auth!.clinicId, req.auth!.branchId]);
  res.status(204).end();
});

catalogRouter.post('/products/:productId/variants', writeCatalog, async (req, res) => {
  if (req.body?.price !== undefined && !req.auth!.permissions.includes('catalog.prices.manage')) return res.status(403).json({ error: 'تعديل الأسعار متاح للمدير فقط' });
  const product = await pool.query(`SELECT id,is_service,currency FROM products WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [req.params.productId, req.auth!.clinicId, req.auth!.branchId]);
  if (!product.rows[0]) return res.status(404).json({ error: 'المنتج غير موجود' });
  if (product.rows[0].is_service) return res.status(400).json({ error: 'لا يمكن إضافة متغير مخزني لخدمة' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await insertVariant(client, req.auth!.clinicId, req.auth!.branchId, product.rows[0].id, product.rows[0].currency, req.body);
    await client.query('COMMIT');
    res.status(201).json(result);
  } catch (error: any) { await client.query('ROLLBACK'); if (error.code === '23505' || error.status === 409) return res.status(409).json({ error: 'رمز المتغير أو الباركود مستخدم بالفعل' }); throw error; }
  finally { client.release(); }
});

catalogRouter.patch('/variants/:variantId', writeCatalog, async (req, res) => {
  if ((req.body?.price !== undefined || req.body?.cost !== undefined) && !req.auth!.permissions.includes('catalog.prices.manage')) return res.status(403).json({ error: 'تعديل الأسعار متاح للمدير فقط' });
  for (const field of ['price','cost']) if (req.body?.[field] !== undefined && !isMoney(req.body[field])) return res.status(400).json({ error: 'السعر غير صالح' });
  const row = await pool.query(`UPDATE product_variants SET sku=COALESCE($4,sku),name=COALESCE($5,name),unit=COALESCE($6,unit),price=CASE WHEN $7 THEN $8::numeric ELSE price END,cost=CASE WHEN $9 THEN $10::numeric ELSE cost END,updated_at=now() WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active RETURNING id,sku,name,unit,price::text AS price,cost::text AS cost,currency`, [req.params.variantId, req.auth!.clinicId, req.auth!.branchId, optionalText(req.body?.sku), optionalText(req.body?.name), optionalText(req.body?.unit), req.body?.price !== undefined, req.body?.price == null ? null : moneyText(req.body.price), req.body?.cost !== undefined, req.body?.cost == null ? null : moneyText(req.body.cost)]);
  if (!row.rows[0]) return res.status(404).json({ error: 'المتغير غير موجود أو غير نشط' });
  res.json(row.rows[0]);
});

catalogRouter.patch('/variants/:variantId/deactivate', writeCatalog, async (req, res) => {
  const row = await pool.query(`UPDATE product_variants SET active=false,updated_at=now() WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active RETURNING id`, [req.params.variantId, req.auth!.clinicId, req.auth!.branchId]);
  if (!row.rows[0]) return res.status(404).json({ error: 'المتغير غير موجود أو غير نشط' });
  res.status(204).end();
});

catalogRouter.post('/variants/:variantId/barcodes', writeCatalog, async (req, res) => {
  const barcode = String(req.body?.barcode ?? '').trim();
  if (!barcode) return res.status(400).json({ error: 'الباركود مطلوب' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const variant = await client.query(`SELECT id FROM product_variants WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active FOR UPDATE`, [req.params.variantId, req.auth!.clinicId, req.auth!.branchId]);
    if (!variant.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'المتغير غير موجود' }); }
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`${req.auth!.clinicId}:barcode:${barcode.toLowerCase()}`]);
    const existing = await client.query(`SELECT 1 FROM product_barcodes WHERE clinic_id=$1 AND branch_id=$2 AND lower(btrim(barcode))=lower(btrim($3))`, [req.auth!.clinicId, req.auth!.branchId, barcode]);
    if (existing.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'الباركود مستخدم بالفعل' }); }
    const created = await client.query(`INSERT INTO product_barcodes (clinic_id,branch_id,variant_id,barcode) VALUES ($1,$2,$3,$4) RETURNING id,barcode`, [req.auth!.clinicId, req.auth!.branchId, req.params.variantId, barcode]);
    await client.query('COMMIT');
    res.status(201).json(created.rows[0]);
  } catch (error: any) { await client.query('ROLLBACK'); if (error.code === '23505') return res.status(409).json({ error: 'الباركود مستخدم بالفعل' }); throw error; }
  finally { client.release(); }
});

catalogRouter.patch('/barcodes/:barcodeId', writeCatalog, async (req, res) => {
  const barcode = String(req.body?.barcode ?? '').trim();
  if (!barcode) return res.status(400).json({ error: 'الباركود مطلوب' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT id FROM product_barcodes WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 FOR UPDATE`, [req.params.barcodeId, req.auth!.clinicId, req.auth!.branchId]);
    if (!current.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الباركود غير موجود' }); }
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`${req.auth!.clinicId}:barcode:${barcode.toLowerCase()}`]);
    const duplicate = await client.query(`SELECT 1 FROM product_barcodes WHERE clinic_id=$1 AND branch_id=$2 AND id<>$3 AND lower(btrim(barcode))=lower(btrim($4))`, [req.auth!.clinicId, req.auth!.branchId, req.params.barcodeId, barcode]);
    if (duplicate.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'الباركود مستخدم بالفعل' }); }
    const updated = await client.query(`UPDATE product_barcodes SET barcode=$4 WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 RETURNING id,barcode`, [req.params.barcodeId, req.auth!.clinicId, req.auth!.branchId, barcode]);
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error: any) { await client.query('ROLLBACK'); if (error.code === '23505') return res.status(409).json({ error: 'الباركود مستخدم بالفعل' }); throw error; }
  finally { client.release(); }
});

catalogRouter.delete('/barcodes/:barcodeId', writeCatalog, async (req, res) => {
  const result = await pool.query(`DELETE FROM product_barcodes WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 RETURNING id`, [req.params.barcodeId, req.auth!.clinicId, req.auth!.branchId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'الباركود غير موجود' });
  res.status(204).end();
});

catalogRouter.post('/products/:variantId/opening-stock', receivePermission, async (req, res) => {
  if (!isQuantity(req.body?.quantity) || decimalMilli(req.body.quantity) <= 0n) return res.status(400).json({ error: 'كمية المخزون يجب أن تكون موجبة وبحد أقصى ثلاث خانات عشرية' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const variant = await client.query(`SELECT v.id,v.product_id,p.track_lots,p.is_service FROM product_variants v JOIN products p ON p.id=v.product_id AND p.clinic_id=v.clinic_id AND p.branch_id=v.branch_id WHERE v.id=$1 AND v.clinic_id=$2 AND v.branch_id=$3 AND v.active AND p.active FOR UPDATE`, [req.params.variantId, req.auth!.clinicId, req.auth!.branchId]);
    if (!variant.rows[0] || variant.rows[0].is_service) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'المتغير المخزني غير موجود' }); }
    let location = await client.query(`SELECT id FROM inventory_locations WHERE clinic_id=$1 AND branch_id=$2 AND active ORDER BY created_at,id LIMIT 1 FOR UPDATE`, [req.auth!.clinicId, req.auth!.branchId]);
    if (!location.rows[0]) location = await client.query(`INSERT INTO inventory_locations (clinic_id,branch_id,code,name) VALUES ($1,$2,'main','المخزن الرئيسي') ON CONFLICT (clinic_id,branch_id,code) DO UPDATE SET active=true RETURNING id`, [req.auth!.clinicId, req.auth!.branchId]);
    let lotId: string | null = null;
    if (variant.rows[0].track_lots) {
      const lotNumber = String(req.body?.lotNumber ?? '').trim();
      if (!lotNumber) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'رقم التشغيلة مطلوب لهذا المنتج' }); }
      const lot = await client.query(`INSERT INTO inventory_lots (clinic_id,branch_id,variant_id,location_id,lot_number,expiry_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [req.auth!.clinicId, req.auth!.branchId, req.params.variantId, location.rows[0].id, lotNumber, nullable(req.body?.expiryDate)]);
      lotId = lot.rows[0].id;
    }
    const movement = await client.query(
      `INSERT INTO stock_movements (clinic_id,branch_id,variant_id,location_id,lot_id,movement_type,quantity_delta,source_type,source_id,source_line_id,actor_id)
       VALUES ($1,$2,$3,$4,$5,'goods_receipt',$6,'opening_stock',$7,$3,$8) RETURNING id,quantity_delta::text AS quantity`,
      [req.auth!.clinicId, req.auth!.branchId, req.params.variantId, location.rows[0].id, lotId, quantityText(req.body.quantity), randomUUID(), req.auth!.userId],
    );
    const balance = await client.query(`SELECT on_hand::text AS "onHand" FROM stock_balances WHERE clinic_id=$1 AND branch_id=$2 AND location_id=$3 AND variant_id=$4 AND lot_id IS NOT DISTINCT FROM $5::uuid`, [req.auth!.clinicId, req.auth!.branchId, location.rows[0].id, req.params.variantId, lotId]);
    await client.query('COMMIT');
    res.status(201).json({ movementId: movement.rows[0].id, quantity: movement.rows[0].quantity, onHand: balance.rows[0]?.onHand ?? '0.000', locationId: location.rows[0].id, lotId });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'الباركود أو التشغيلة موجودة بالفعل' });
    throw error;
  } finally { client.release(); }
});

async function insertVariant(client: Pick<typeof pool, 'query'> | import('pg').PoolClient, clinicId: string, branchId: string, productId: string, currency: string, v: any) {
  const sku = String(v?.sku ?? '').trim();
  const name = String(v?.name ?? '').trim();
  const unit = String(v?.unit ?? 'قطعة').trim();
  const price = v?.price ?? '0.00';
  const cost = v?.cost ?? '0.00';
  if (!sku || !name || !unit || !isMoney(price) || !isMoney(cost)) throw Object.assign(new Error('بيانات المتغير والسعر مطلوبة'), { status: 400 });
  const barcodes = Array.isArray(v?.barcodes) ? v.barcodes.map((b: unknown) => String(b).trim()).filter(Boolean) : [];
  const normalized = barcodes.map((b: string) => b.toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw Object.assign(new Error('الباركود مكرر في الطلب'), { status: 409 });
  for (const barcode of normalized) await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`${clinicId}:barcode:${barcode}`]);
  const existing = await client.query(`SELECT 1 FROM product_barcodes WHERE clinic_id=$1 AND branch_id=$2 AND lower(btrim(barcode))=ANY($3::text[]) LIMIT 1`, [clinicId, branchId, normalized]);
  if (existing.rows[0]) throw Object.assign(new Error('الباركود مستخدم بالفعل'), { status: 409 });
  const created = await client.query(`INSERT INTO product_variants (clinic_id,branch_id,product_id,sku,name,unit,price,cost,currency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,sku,name,unit,price::text AS price,cost::text AS cost,currency`, [clinicId, branchId, productId, sku, name, unit, moneyText(price), moneyText(cost), currency]);
  for (const barcode of barcodes) await client.query(`INSERT INTO product_barcodes (clinic_id,branch_id,variant_id,barcode) VALUES ($1,$2,$3,$4)`, [clinicId, branchId, created.rows[0].id, barcode]);
  return { ...created.rows[0], barcodes };
}

function nullable(value: unknown): string | null { const s = String(value ?? '').trim(); return s || null; }
function optionalText(value: unknown): string | null { return value === undefined ? null : String(value).trim(); }
function isMoney(value: unknown): boolean { return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(String(value ?? '').trim()); }
function moneyText(value: unknown): string { const text = String(value ?? '0').trim(); if (!isMoney(text)) throw Object.assign(new Error('قيمة مالية غير صحيحة'), { status: 400 }); const [whole, frac = ''] = text.split('.'); return `${whole}.${frac.padEnd(2, '0')}`; }
function isQuantity(value: unknown): boolean { return /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(String(value ?? '').trim()); }
function decimalMilli(value: unknown): bigint { if (!isQuantity(value)) return -1n; const [whole, fraction = ''] = String(value).trim().split('.'); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')); }
function quantityText(value: unknown): string { const milli = decimalMilli(value); if (milli < 0n) throw Object.assign(new Error('كمية غير صحيحة'), { status: 400 }); return `${milli / 1000n}.${String(milli % 1000n).padStart(3, '0')}`; }
