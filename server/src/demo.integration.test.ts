import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('Set TEST_DATABASE_URL to a disposable migrated database');
if (!/(^|[_-])(test|testing|disposable)([_-]|$)/.test(new URL(testDatabaseUrl).pathname.toLowerCase())) throw new Error('TEST_DATABASE_URL must identify a disposable test database');
process.env.DATABASE_URL = testDatabaseUrl;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CHANGE_ME') throw new Error('Set a local non-placeholder JWT_SECRET');

const [{ pool }, { runBootstrap }, { createApp }] = await Promise.all([
  import('./db.js'), import('./bootstrap.js'), import('./app.js'),
]);

test('Phase 1 customers, animals, and catalog integration', async (t) => {
  const existing = await pool.query('SELECT 1 FROM clinics LIMIT 1');
  assert.equal(existing.rows.length, 0, 'test database must be fresh');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const clinicCode = `TEST-${suffix}`;
  const adminEmail = `admin-${suffix.toLowerCase()}@nuvik.test`;
  const args = ['--clinic-code', clinicCode, '--clinic-name', 'Nuvik Phase 1 Test', '--branch-code', 'MAIN', '--branch-name', 'Main', '--admin-email', adminEmail, '--admin-name', 'Test Admin'];
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
    return { response, body: await response.json().catch(() => null) };
  };
  const login = (email: string, password: string, clinic = clinicCode) => call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, clinicCode: clinic }) });

  try {
    await runBootstrap(args);
    const credentialText = await readFile(path.resolve(process.cwd(), '..', '.local', 'bootstrap-credentials.txt'), 'utf8');
    const adminPassword = credentialText.match(/^Admin password: (.+)$/m)?.[1];
    assert.ok(adminPassword);
    const adminLogin = await login(adminEmail, adminPassword);
    assert.equal(adminLogin.response.status, 200);
    const adminHeaders = { Authorization: `Bearer ${adminLogin.body.token}` };

    await t.test('animal creation creates exactly one primary owner', async () => {
      const species = await call('/api/species', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `DOG-${suffix}`, label: 'كلب اختبار' }) });
      assert.equal(species.response.status, 201);
      const otherSpecies = await call('/api/species', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `CAT-${suffix}`, label: 'قط اختبار' }) });
      assert.equal(otherSpecies.response.status, 201);
      const breed = await call(`/api/species/${species.body.id}/breeds`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `MIX-${suffix}`, label: 'مختلط' }) });
      assert.equal(breed.response.status, 201);
      const foreignBreed = await call(`/api/species/${otherSpecies.body.id}/breeds`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `OTHER-${suffix}`, label: 'سلالة أخرى' }) });
      const customer = await call('/api/customers', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'عميل اختبار', phone: '01000000000' }) });
      assert.equal(customer.response.status, 201);
      const invalidAnimal = await call('/api/animals', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'Rex', speciesId: species.body.id, breedId: foreignBreed.body.id, ownerCustomerId: customer.body.id }) });
      assert.equal(invalidAnimal.response.status, 400);
      const created = await call('/api/animals', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'Rex', speciesId: species.body.id, breedId: breed.body.id, ownerCustomerId: customer.body.id }) });
      assert.equal(created.response.status, 201);
      const owners = await pool.query(`SELECT id FROM animal_owners WHERE clinic_id=$1 AND branch_id=$2 AND animal_id=$3 AND is_primary AND valid_to IS NULL`, [adminLogin.body.user.clinicId, adminLogin.body.user.branchId, created.body.id]);
      assert.equal(owners.rows.length, 1);
      Object.assign((globalThis as any), { phase1CustomerId: customer.body.id, phase1AnimalId: created.body.id, phase1SpeciesId: species.body.id });
    });

    let productId = '';
    let variantId = '';
    await t.test('barcode uniqueness and exact lookup identify the correct variant', async () => {
      const product = await call('/api/products', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `FOOD-${suffix}`, name: 'طعام اختبار', variants: [{ sku: `FOOD-${suffix}-1`, name: 'عبوة كبيرة', unit: 'عبوة', price: '125.50', barcodes: [`  AbC-${suffix}  `] }] }) });
      assert.equal(product.response.status, 201);
      productId = product.body.id; variantId = product.body.variants[0].id;
      const duplicate = await call('/api/products', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `DUP-${suffix}`, name: 'منتج مكرر', variants: [{ sku: `DUP-${suffix}-1`, name: 'نسخة', unit: 'قطعة', price: '1.00', barcodes: [`abc-${suffix}`] }] }) });
      assert.equal(duplicate.response.status, 409);
      const found = await call(`/api/products/barcode/${encodeURIComponent(`abc-${suffix}`)}`, { headers: adminHeaders });
      assert.equal(found.response.status, 200);
      assert.equal(found.body.variantId, variantId);
      assert.equal(found.body.productId, productId);
    });

    await t.test('opening stock writes one immutable movement and matching balance', async () => {
      const before = await pool.query(`SELECT count(*)::int AS count FROM stock_movements WHERE clinic_id=$1 AND source_type='opening_stock'`, [adminLogin.body.user.clinicId]);
      const result = await call(`/api/products/${variantId}/opening-stock`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ quantity: '5.250' }) });
      assert.equal(result.response.status, 201);
      assert.equal(result.body.onHand, '5.250');
      const after = await pool.query(`SELECT count(*)::int AS count FROM stock_movements WHERE clinic_id=$1 AND source_type='opening_stock'`, [adminLogin.body.user.clinicId]);
      assert.equal(after.rows[0].count, before.rows[0].count + 1);
      const balance = await pool.query(`SELECT on_hand::text AS value FROM stock_balances WHERE clinic_id=$1 AND branch_id=$2 AND variant_id=$3`, [adminLogin.body.user.clinicId, adminLogin.body.user.branchId, variantId]);
      assert.equal(balance.rows[0].value, '5.250');
    });

    await t.test('clinic and permission boundaries hide records and reject writes', async () => {
      const customerId = (globalThis as any).phase1CustomerId as string;
      const password = randomBytes(24).toString('hex');
      const otherClinic = await pool.query(`INSERT INTO clinics (code,name) VALUES ($1,'Other clinic') RETURNING id`, [`OTHER-${suffix}`]);
      const otherBranch = await pool.query(`INSERT INTO branches (clinic_id,code,name) VALUES ($1,'MAIN','Other branch') RETURNING id`, [otherClinic.rows[0].id]);
      const otherRole = await pool.query(`INSERT INTO roles (clinic_id,code,name) VALUES ($1,'admin','Other admin') RETURNING id`, [otherClinic.rows[0].id]);
      const otherUser = await pool.query(`INSERT INTO users (clinic_id,branch_id,normalized_email,password_hash,display_name) VALUES ($1,$2,$3,$4,'Other admin') RETURNING id`, [otherClinic.rows[0].id, otherBranch.rows[0].id, `other-${suffix.toLowerCase()}@nuvik.test`, await bcrypt.hash(password, 4)]);
      await pool.query(`INSERT INTO role_permissions (clinic_id,role_id,permission_id) SELECT $1,$2,id FROM permissions WHERE code IN ('customers.animals.manage','catalog.read')`, [otherClinic.rows[0].id, otherRole.rows[0].id]);
      await pool.query(`INSERT INTO user_roles (clinic_id,user_id,role_id,assigned_by) VALUES ($1,$2,$3,$2)`, [otherClinic.rows[0].id, otherUser.rows[0].id, otherRole.rows[0].id]);
      const otherLogin = await login(`other-${suffix.toLowerCase()}@nuvik.test`, password, `OTHER-${suffix}`);
      assert.equal(otherLogin.response.status, 200);
      const headers = { Authorization: `Bearer ${otherLogin.body.token}` };
      assert.equal((await call(`/api/customers/${customerId}`, { headers })).response.status, 404);
      assert.equal((await call(`/api/customers/${customerId}`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'Attempt' }) })).response.status, 404);
      assert.equal((await call(`/api/products/barcode/${encodeURIComponent(`abc-${suffix}`)}`, { headers })).response.status, 404);
      const noPermissionEmail = `limited-${suffix.toLowerCase()}@nuvik.test`;
      const created = await call('/api/users', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ displayName: 'Limited user', email: noPermissionEmail, password }) });
      assert.equal(created.response.status, 201);
      const limitedLogin = await login(noPermissionEmail, password);
      assert.equal(limitedLogin.response.status, 200);
      assert.equal((await call('/api/customers', { headers: { Authorization: `Bearer ${limitedLogin.body.token}` } })).response.status, 403);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
    delete (globalThis as any).phase1CustomerId;
    delete (globalThis as any).phase1AnimalId;
    delete (globalThis as any).phase1SpeciesId;
  }
});
