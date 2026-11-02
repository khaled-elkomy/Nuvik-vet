import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const customersAnimalsRouter = Router();
customersAnimalsRouter.use(requireAuth);

const customerWrite = requirePermission('customers.animals.manage');
const clinicalRead = requirePermission('clinical.records.read');
const catalogSetting = requirePermission('settings.manage');

function badRequest(res: import('express').Response, message: string) {
  return res.status(400).json({ error: message });
}

customersAnimalsRouter.get('/customers', async (req, res) => {
  if (!req.auth!.permissions.some((p) => ['customers.animals.manage', 'clinical.records.read'].includes(p))) {
    return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
  }
  const q = String(req.query.q ?? '').trim();
  const result = await pool.query(
    `SELECT id, name, phone, email, address, notes, active, created_at AS "createdAt"
       FROM customers
      WHERE clinic_id=$1 AND branch_id=$2 AND active=true
        AND ($3='' OR name ILIKE '%'||$3||'%' OR COALESCE(phone,'') ILIKE '%'||$3||'%')
      ORDER BY name LIMIT 100`,
    [req.auth!.clinicId, req.auth!.branchId, q],
  );
  res.json(result.rows);
});

customersAnimalsRouter.post('/customers', customerWrite, async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return badRequest(res, 'اسم العميل مطلوب');
  const result = await pool.query(
    `INSERT INTO customers (clinic_id,branch_id,name,phone,email,address,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id,name,phone,email,address,notes,active,created_at AS "createdAt"`,
    [req.auth!.clinicId, req.auth!.branchId, name, nullableText(req.body?.phone), nullableText(req.body?.email), nullableText(req.body?.address), nullableText(req.body?.notes)],
  );
  res.status(201).json(result.rows[0]);
});

customersAnimalsRouter.get('/customers/:customerId', async (req, res) => {
  if (!req.auth!.permissions.some((p) => ['customers.animals.manage', 'clinical.records.read'].includes(p))) {
    return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
  }
  const customer = await pool.query(
    `SELECT id,name,phone,email,address,notes,active,created_at AS "createdAt"
       FROM customers WHERE id=$1 AND clinic_id=$2 AND branch_id=$3`,
    [req.params.customerId, req.auth!.clinicId, req.auth!.branchId],
  );
  if (!customer.rows[0]) return res.status(404).json({ error: 'العميل غير موجود' });
  const animals = await pool.query(
    `SELECT a.id,a.name,a.species_id AS "speciesId",s.label AS species,
            a.breed_id AS "breedId",b.label AS breed,a.sex,a.date_of_birth AS "dateOfBirth",
            a.birth_date_estimated AS "birthDateEstimated",a.microchip,a.identifier,a.status
       FROM animal_owners ao JOIN animals a ON a.id=ao.animal_id AND a.clinic_id=ao.clinic_id AND a.branch_id=ao.branch_id
       JOIN species s ON s.id=a.species_id AND s.clinic_id=a.clinic_id AND s.branch_id=a.branch_id
       LEFT JOIN breeds b ON b.id=a.breed_id AND b.clinic_id=a.clinic_id AND b.branch_id=a.branch_id
      WHERE ao.customer_id=$1 AND ao.clinic_id=$2 AND ao.branch_id=$3 AND ao.valid_to IS NULL
      ORDER BY a.name`,
    [req.params.customerId, req.auth!.clinicId, req.auth!.branchId],
  );
  res.json({ ...customer.rows[0], animals: animals.rows });
});

customersAnimalsRouter.patch('/customers/:customerId', customerWrite, async (req, res) => {
  const name = req.body?.name === undefined ? undefined : String(req.body.name).trim();
  if (name !== undefined && !name) return badRequest(res, 'اسم العميل مطلوب');
  const result = await pool.query(
    `UPDATE customers SET name=COALESCE($4,name), phone=CASE WHEN $5 THEN $6 ELSE phone END,
       email=CASE WHEN $7 THEN $8 ELSE email END, address=CASE WHEN $9 THEN $10 ELSE address END,
       notes=CASE WHEN $11 THEN $12 ELSE notes END, updated_at=now()
     WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active=true
     RETURNING id,name,phone,email,address,notes,active,created_at AS "createdAt"`,
    [req.params.customerId, req.auth!.clinicId, req.auth!.branchId, name ?? null,
      req.body?.phone !== undefined, nullableText(req.body?.phone), req.body?.email !== undefined, nullableText(req.body?.email),
      req.body?.address !== undefined, nullableText(req.body?.address), req.body?.notes !== undefined, nullableText(req.body?.notes)],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'العميل غير موجود أو غير نشط' });
  res.json(result.rows[0]);
});

customersAnimalsRouter.patch('/customers/:customerId/deactivate', customerWrite, async (req, res) => {
  const result = await pool.query(
    `UPDATE customers SET active=false,updated_at=now() WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active=true RETURNING id`,
    [req.params.customerId, req.auth!.clinicId, req.auth!.branchId],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'العميل غير موجود أو غير نشط' });
  res.status(204).end();
});

customersAnimalsRouter.get('/species', async (req, res) => {
  if (!req.auth!.permissions.some((p) => ['customers.animals.manage', 'clinical.records.read'].includes(p))) return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
  const rows = await pool.query(`SELECT id,code,label FROM species WHERE clinic_id=$1 AND branch_id=$2 AND active ORDER BY label`, [req.auth!.clinicId, req.auth!.branchId]);
  res.json(rows.rows);
});

customersAnimalsRouter.post('/species', catalogSetting, async (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const label = String(req.body?.label ?? '').trim();
  if (!code || !label) return badRequest(res, 'رمز النوع واسمه مطلوبان');
  try {
    const row = await pool.query(`INSERT INTO species (clinic_id,branch_id,code,label) VALUES ($1,$2,$3,$4) RETURNING id,code,label`, [req.auth!.clinicId, req.auth!.branchId, code, label]);
    res.status(201).json(row.rows[0]);
  } catch (error: any) { if (error.code === '23505') return res.status(409).json({ error: 'رمز النوع مستخدم بالفعل' }); throw error; }
});

customersAnimalsRouter.patch('/species/:id', catalogSetting, async (req, res) => {
  const code = req.body?.code === undefined ? null : String(req.body.code).trim().toUpperCase();
  const label = req.body?.label === undefined ? null : String(req.body.label).trim();
  if (code === '' || label === '') return badRequest(res, 'البيانات غير صحيحة');
  try {
    const row = await pool.query(`UPDATE species SET code=COALESCE($4,code),label=COALESCE($5,label),updated_at=now() WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active RETURNING id,code,label`, [req.params.id, req.auth!.clinicId, req.auth!.branchId, code, label]);
    if (!row.rows[0]) return res.status(404).json({ error: 'النوع غير موجود' });
    res.json(row.rows[0]);
  } catch (error: any) { if (error.code === '23505') return res.status(409).json({ error: 'رمز النوع مستخدم بالفعل' }); throw error; }
});

customersAnimalsRouter.get('/species/:speciesId/breeds', async (req, res) => {
  if (!req.auth!.permissions.some((p) => ['customers.animals.manage', 'clinical.records.read'].includes(p))) return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
  const rows = await pool.query(`SELECT id,code,label,species_id AS "speciesId" FROM breeds WHERE clinic_id=$1 AND branch_id=$2 AND species_id=$3 AND active ORDER BY label`, [req.auth!.clinicId, req.auth!.branchId, req.params.speciesId]);
  res.json(rows.rows);
});

customersAnimalsRouter.post('/species/:speciesId/breeds', catalogSetting, async (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const label = String(req.body?.label ?? '').trim();
  if (!code || !label) return badRequest(res, 'رمز السلالة واسمها مطلوبان');
  const species = await pool.query(`SELECT id FROM species WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [req.params.speciesId, req.auth!.clinicId, req.auth!.branchId]);
  if (!species.rows[0]) return res.status(404).json({ error: 'النوع غير موجود' });
  try {
    const row = await pool.query(`INSERT INTO breeds (clinic_id,branch_id,species_id,code,label) VALUES ($1,$2,$3,$4,$5) RETURNING id,code,label,species_id AS "speciesId"`, [req.auth!.clinicId, req.auth!.branchId, req.params.speciesId, code, label]);
    res.status(201).json(row.rows[0]);
  } catch (error: any) { if (error.code === '23505') return res.status(409).json({ error: 'رمز السلالة مستخدم بالفعل' }); throw error; }
});

customersAnimalsRouter.patch('/breeds/:id', catalogSetting, async (req, res) => {
  const code = req.body?.code === undefined ? null : String(req.body.code).trim().toUpperCase();
  const label = req.body?.label === undefined ? null : String(req.body.label).trim();
  if (code === '' || label === '') return badRequest(res, 'البيانات غير صحيحة');
  try {
    const row = await pool.query(`UPDATE breeds SET code=COALESCE($4,code),label=COALESCE($5,label),updated_at=now() WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active RETURNING id,code,label,species_id AS "speciesId"`, [req.params.id, req.auth!.clinicId, req.auth!.branchId, code, label]);
    if (!row.rows[0]) return res.status(404).json({ error: 'السلالة غير موجودة' });
    res.json(row.rows[0]);
  } catch (error: any) { if (error.code === '23505') return res.status(409).json({ error: 'رمز السلالة مستخدم بالفعل' }); throw error; }
});

customersAnimalsRouter.get('/animals', async (req, res) => {
  if (!req.auth!.permissions.some((p) => ['customers.animals.manage', 'clinical.records.read'].includes(p))) return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
  const customerId = String(req.query.customerId ?? '');
  const q = String(req.query.q ?? '').trim();
  const rows = await pool.query(
    `SELECT a.id,a.name,a.species_id AS "speciesId",s.label AS species,a.breed_id AS "breedId",b.label AS breed,
            a.sex,a.date_of_birth AS "dateOfBirth",a.microchip,a.identifier,a.status,
            c.id AS "primaryOwnerId",c.name AS "primaryOwner"
       FROM animals a JOIN species s ON s.id=a.species_id AND s.clinic_id=a.clinic_id AND s.branch_id=a.branch_id
       LEFT JOIN breeds b ON b.id=a.breed_id AND b.clinic_id=a.clinic_id AND b.branch_id=a.branch_id
       JOIN animal_owners ao ON ao.animal_id=a.id AND ao.clinic_id=a.clinic_id AND ao.branch_id=a.branch_id AND ao.is_primary AND ao.valid_to IS NULL
       JOIN customers c ON c.id=ao.customer_id AND c.clinic_id=ao.clinic_id AND c.branch_id=ao.branch_id
      WHERE a.clinic_id=$1 AND a.branch_id=$2 AND a.status='active'
        AND ($3='' OR c.id=$3::uuid) AND ($4='' OR a.name ILIKE '%'||$4||'%' OR a.microchip ILIKE '%'||$4||'%')
      ORDER BY a.name LIMIT 100`,
    [req.auth!.clinicId, req.auth!.branchId, customerId, q],
  );
  res.json(rows.rows);
});

customersAnimalsRouter.post('/animals', customerWrite, async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const speciesId = String(req.body?.speciesId ?? '');
  const customerId = String(req.body?.ownerCustomerId ?? '');
  if (!name || !speciesId || !customerId) return badRequest(res, 'اسم الحيوان والنوع والمالك الأساسي مطلوبة');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const species = await client.query(`SELECT id FROM species WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [speciesId, req.auth!.clinicId, req.auth!.branchId]);
    const owner = await client.query(`SELECT id FROM customers WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [customerId, req.auth!.clinicId, req.auth!.branchId]);
    if (!species.rows[0] || !owner.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'النوع أو العميل غير صالح' }); }
    const breedId = nullableText(req.body?.breedId);
    if (breedId) {
      const breed = await client.query(`SELECT id FROM breeds WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND species_id=$4 AND active`, [breedId, req.auth!.clinicId, req.auth!.branchId, speciesId]);
      if (!breed.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'السلالة لا تتبع النوع المحدد' }); }
    }
    const animal = await client.query(
      `INSERT INTO animals (clinic_id,branch_id,name,species_id,breed_id,date_of_birth,birth_date_estimated,sex,microchip,identifier,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id,name,species_id AS "speciesId",breed_id AS "breedId",date_of_birth AS "dateOfBirth",sex,microchip,identifier,status`,
      [req.auth!.clinicId, req.auth!.branchId, name, speciesId, breedId, nullableText(req.body?.dateOfBirth), Boolean(req.body?.birthDateEstimated), nullableText(req.body?.sex), nullableText(req.body?.microchip), nullableText(req.body?.identifier), nullableText(req.body?.notes)],
    );
    await client.query(`INSERT INTO animal_owners (clinic_id,branch_id,animal_id,customer_id,is_primary) VALUES ($1,$2,$3,$4,true)`, [req.auth!.clinicId, req.auth!.branchId, animal.rows[0].id, customerId]);
    await client.query('COMMIT');
    res.status(201).json({ ...animal.rows[0], ownerCustomerId: customerId });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'رقم الشريحة أو المعرف مستخدم بالفعل' });
    throw error;
  } finally { client.release(); }
});

customersAnimalsRouter.get('/animals/:animalId', async (req, res) => {
  if (!req.auth!.permissions.some((p) => ['customers.animals.manage', 'clinical.records.read'].includes(p))) return res.status(403).json({ error: 'لا تملك صلاحية الوصول لهذا الإجراء' });
  const animal = await pool.query(
    `SELECT a.id,a.name,a.species_id AS "speciesId",s.label AS species,a.breed_id AS "breedId",b.label AS breed,
            a.date_of_birth AS "dateOfBirth",a.birth_date_estimated AS "birthDateEstimated",a.sex,a.microchip,a.identifier,a.status,a.notes
       FROM animals a JOIN species s ON s.id=a.species_id AND s.clinic_id=a.clinic_id AND s.branch_id=a.branch_id
       LEFT JOIN breeds b ON b.id=a.breed_id AND b.clinic_id=a.clinic_id AND b.branch_id=a.branch_id
      WHERE a.id=$1 AND a.clinic_id=$2 AND a.branch_id=$3`,
    [req.params.animalId, req.auth!.clinicId, req.auth!.branchId],
  );
  if (!animal.rows[0]) return res.status(404).json({ error: 'الحيوان غير موجود' });
  const owners = await pool.query(
    `SELECT c.id AS "customerId",c.name,c.phone,ao.is_primary AS "isPrimary",ao.valid_from AS "validFrom",ao.valid_to AS "validTo"
       FROM animal_owners ao JOIN customers c ON c.id=ao.customer_id AND c.clinic_id=ao.clinic_id AND c.branch_id=ao.branch_id
      WHERE ao.animal_id=$1 AND ao.clinic_id=$2 AND ao.branch_id=$3 ORDER BY ao.valid_to NULLS FIRST,ao.is_primary DESC,ao.valid_from DESC`,
    [req.params.animalId, req.auth!.clinicId, req.auth!.branchId],
  );
  res.json({ ...animal.rows[0], owners: owners.rows, clinicalHistory: [] });
});

customersAnimalsRouter.patch('/animals/:animalId', customerWrite, async (req, res) => {
  const name = req.body?.name === undefined ? null : String(req.body.name).trim();
  if (name === '') return badRequest(res, 'اسم الحيوان مطلوب');
  const current = await pool.query(`SELECT species_id,breed_id FROM animals WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND status='active'`, [req.params.animalId, req.auth!.clinicId, req.auth!.branchId]);
  if (!current.rows[0]) return res.status(404).json({ error: 'الحيوان غير موجود أو غير نشط' });
  const speciesId = String(req.body?.speciesId ?? current.rows[0].species_id);
  const species = await pool.query(`SELECT id FROM species WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND active`, [speciesId, req.auth!.clinicId, req.auth!.branchId]);
  if (!species.rows[0]) return badRequest(res, 'النوع غير صالح');
  const breedId = req.body?.breedId === undefined ? current.rows[0].breed_id : nullableText(req.body.breedId);
  if (breedId) {
    const breed = await pool.query(`SELECT id FROM breeds WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND species_id=$4 AND active`, [breedId, req.auth!.clinicId, req.auth!.branchId, speciesId]);
    if (!breed.rows[0]) return badRequest(res, 'السلالة لا تتبع النوع المحدد');
  }
  try {
  const result = await pool.query(
    `UPDATE animals SET name=COALESCE($4,name),species_id=COALESCE($5,species_id),breed_id=CASE WHEN $6 THEN $7 ELSE breed_id END,
       date_of_birth=CASE WHEN $8 THEN $9::date ELSE date_of_birth END,sex=CASE WHEN $10 THEN $11 ELSE sex END,
       microchip=CASE WHEN $12 THEN $13 ELSE microchip END,identifier=CASE WHEN $14 THEN $15 ELSE identifier END,
       notes=CASE WHEN $16 THEN $17 ELSE notes END,updated_at=now()
     WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND status='active'
     RETURNING id,name,species_id AS "speciesId",breed_id AS "breedId",date_of_birth AS "dateOfBirth",sex,microchip,identifier,status,notes`,
    [req.params.animalId, req.auth!.clinicId, req.auth!.branchId, name, req.body?.speciesId ?? null,
      req.body?.breedId !== undefined, breedId,
      req.body?.sex !== undefined, nullableText(req.body?.sex), req.body?.microchip !== undefined, nullableText(req.body?.microchip),
      req.body?.identifier !== undefined, nullableText(req.body?.identifier), req.body?.notes !== undefined, nullableText(req.body?.notes)],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'الحيوان غير موجود أو غير نشط' });
  res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'رقم الشريحة أو المعرف مستخدم بالفعل' });
    throw error;
  }
});

customersAnimalsRouter.patch('/animals/:animalId/deactivate', customerWrite, async (req, res) => {
  const result = await pool.query(`UPDATE animals SET status='inactive',updated_at=now() WHERE id=$1 AND clinic_id=$2 AND branch_id=$3 AND status='active' RETURNING id`, [req.params.animalId, req.auth!.clinicId, req.auth!.branchId]);
  if (!result.rows[0]) return res.status(404).json({ error: 'الحيوان غير موجود أو غير نشط' });
  res.status(204).end();
});

function nullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}
