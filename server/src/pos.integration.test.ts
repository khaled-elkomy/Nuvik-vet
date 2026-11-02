import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('Set TEST_DATABASE_URL to a fresh disposable database');
if (!/(^|[_-])(test|testing|disposable)([_-]|$)/.test(new URL(testDatabaseUrl).pathname.toLowerCase())) throw new Error('TEST_DATABASE_URL must identify a disposable database');
process.env.DATABASE_URL = testDatabaseUrl;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CHANGE_ME') throw new Error('Set a local non-placeholder JWT_SECRET');
const [{ pool }, { runBootstrap }, { createApp }] = await Promise.all([import('./db.js'), import('./bootstrap.js'), import('./app.js')]);

test('Phase 2 POS, receivables, and cashier shifts integration', async (t) => {
  const existing = await pool.query('SELECT 1 FROM clinics LIMIT 1');
  assert.equal(existing.rows.length, 0, 'test database must be fresh');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const clinicCode = `TEST-${suffix}`;
  const adminEmail = `pos-admin-${suffix.toLowerCase()}@nuvik.test`;
  await runBootstrap(['--clinic-code', clinicCode, '--clinic-name', 'POS Integration', '--branch-code', 'MAIN', '--branch-name', 'Main', '--admin-email', adminEmail, '--admin-name', 'POS Admin']);
  const credential = await readFile(path.resolve(process.cwd(), '..', '.local', 'bootstrap-credentials.txt'), 'utf8');
  const adminPassword = credential.match(/^Admin password: (.+)$/m)?.[1];
  assert.ok(adminPassword);
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
    return { response, body: await response.json().catch(() => null) };
  };
  const login = (email: string, password: string, clinic = clinicCode) => call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, clinicCode: clinic }) });
  try {
    const adminLogin = await login(adminEmail, adminPassword);
    assert.equal(adminLogin.response.status, 200);
    const adminHeaders = { Authorization: `Bearer ${adminLogin.body.token}` };
    const customer = await call('/api/customers', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'POS customer', phone: '01112345678' }) });
    assert.equal(customer.response.status, 201);
    const product = await call('/api/products', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `SALE-${suffix}`, name: 'Demo food', variants: [{ sku: `SKU-${suffix}`, name: 'Bag', unit: 'bag', price: '10.00', barcodes: [`SALE${suffix}`] }] }) });
    assert.equal(product.response.status, 201);
    const variantId = product.body.variants[0].id as string;
    await call(`/api/products/${variantId}/opening-stock`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ quantity: '100.000' }) }).then((r) => assert.equal(r.response.status, 201));
    const inventory = async () => (await pool.query(`SELECT COALESCE(sum(on_hand),0)::text AS value FROM stock_balances WHERE clinic_id=$1 AND branch_id=$2 AND variant_id=$3`, [adminLogin.body.user.clinicId, adminLogin.body.user.branchId, variantId])).rows[0].value as string;
    const sale = (body: any, key: string, headers: Record<string,string> = adminHeaders) => call('/api/pos/sales', { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body: JSON.stringify(body) });
    const simpleSale = (quantity = '1.000', customerId: string | null = customer.body.id, payments: any[] = []) => ({ customerId, lines: [{ variantId, quantity }], payments });

    await t.test('cash payment without an open shift is rejected', async () => {
      const result = await sale(simpleSale('1.000', customer.body.id, [{ method: 'cash', amount: '10.00' }]), `no-shift-${suffix}`);
      assert.equal(result.response.status, 409);
      assert.equal(await inventory(), '100.000');
    });

    await t.test('unpaid sale without customer and overpayment are rejected', async () => {
      assert.equal((await sale(simpleSale('1.000', null, []), `no-customer-${suffix}`)).response.status, 400);
      assert.equal((await sale(simpleSale('1.000', customer.body.id, [{ method: 'card', amount: '10.01' }]), `overpay-${suffix}`)).response.status, 400);
    });

    const opened = await call('/api/pos/shifts/open', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ openingCash: '50.00' }) });
    assert.equal(opened.response.status, 201);

    await t.test('sale deducts stock once; same idempotency key replays and payload mismatch rejects', async () => {
      const body = simpleSale('1.000', customer.body.id, [{ method: 'cash', amount: '4.00' }]);
      const key = `sale-${suffix}`;
      const first = await sale(body, key);
      assert.equal(first.response.status, 201);
      assert.equal(first.body.status, 'open');
      const replay = await sale(body, key);
      assert.equal(replay.response.status, 200);
      assert.equal(replay.body.idempotentReplay, true);
      assert.equal(replay.body.id, first.body.id);
      assert.equal((await sale(simpleSale('2.000', customer.body.id, [{ method: 'cash', amount: '4.00' }]), key)).response.status, 409);
      assert.equal(await inventory(), '99.000');
      const count = await pool.query(`SELECT count(*)::int AS value FROM stock_movements WHERE clinic_id=$1 AND source_type='pos_sale' AND source_id=$2`, [adminLogin.body.user.clinicId, first.body.id]);
      assert.equal(count.rows[0].value, 1);
    });

    await t.test('negative-stock setting allows with warning and blocks when disabled', async () => {
      const allowed = await sale(simpleSale('100.000'), `negative-allowed-${suffix}`);
      assert.equal(allowed.response.status, 201);
      assert.ok(allowed.body.stockWarnings.length > 0);
      assert.equal(await inventory(), '-1.000');
      await pool.query(`UPDATE clinics SET settings=jsonb_set(settings,'{allow_negative_stock}','false'::jsonb) WHERE id=$1`, [adminLogin.body.user.clinicId]);
      const blocked = await sale(simpleSale('1.000'), `negative-blocked-${suffix}`);
      assert.equal(blocked.response.status, 409);
      assert.equal(await inventory(), '-1.000');
      await pool.query(`UPDATE clinics SET settings=jsonb_set(settings,'{allow_negative_stock}','true'::jsonb) WHERE id=$1`, [adminLogin.body.user.clinicId]);
    });

    await t.test('service sale creates no stock movement', async () => {
      const service = await call('/api/products', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `SERVICE-${suffix}`, name: 'Consultation', isService: true, defaultUnitPrice: '3.00', variants: [] }) });
      assert.equal(service.response.status, 201);
      const before = await pool.query(`SELECT count(*)::int AS value FROM stock_movements WHERE clinic_id=$1`, [adminLogin.body.user.clinicId]);
      const result = await sale({ customerId: null, lines: [{ serviceProductId: service.body.id, quantity: '1.000' }], payments: [{ method: 'wallet', amount: '3.00' }] }, `service-${suffix}`);
      assert.equal(result.response.status, 201);
      assert.equal(result.body.status, 'paid');
      const after = await pool.query(`SELECT count(*)::int AS value FROM stock_movements WHERE clinic_id=$1`, [adminLogin.body.user.clinicId]);
      assert.equal(after.rows[0].value, before.rows[0].value);
    });

    await t.test('receive payment allocates FIFO and rejects overpayment', async () => {
      const fifoCustomer = await call('/api/customers', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'FIFO customer' }) });
      const first = await sale(simpleSale('1.000', fifoCustomer.body.id), `fifo-first-${suffix}`);
      const second = await sale(simpleSale('1.000', fifoCustomer.body.id), `fifo-second-${suffix}`);
      assert.equal(first.response.status, 201, first.body?.error); assert.equal(second.response.status, 201, second.body?.error);
      const result = await call(`/api/customers/${fifoCustomer.body.id}/receive-payment`, { method: 'POST', headers: { ...adminHeaders, 'Idempotency-Key': `fifo-payment-${suffix}` }, body: JSON.stringify({ amount: '15.00', method: 'card' }) });
      assert.equal(result.response.status, 201);
      assert.deepEqual(result.body.allocations.map((a: any) => [a.invoiceId,a.amount]), [[first.body.id,'10.00'],[second.body.id,'5.00']]);
      const invoices = await call('/api/invoices', { headers: adminHeaders });
      const firstRow = invoices.body.find((i: any) => i.id === first.body.id);
      const secondRow = invoices.body.find((i: any) => i.id === second.body.id);
      assert.equal(firstRow.status, 'paid'); assert.equal(secondRow.status, 'open'); assert.equal(secondRow.remainingAmount, '5.00');
      const over = await call(`/api/customers/${fifoCustomer.body.id}/receive-payment`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ amount: '5.01', method: 'card' }) });
      assert.equal(over.response.status, 400);
      const balance = await call(`/api/customers/${fifoCustomer.body.id}/balance`, { headers: adminHeaders });
      assert.equal(balance.body.balance, '5.00');
    });

    await t.test('clinic isolation and permission denial prevent product sales', async () => {
      const otherClinic = await pool.query(`INSERT INTO clinics (code,name) VALUES ($1,'Isolated clinic') RETURNING id`, [`OTHER-${suffix}`]);
      const otherBranch = await pool.query(`INSERT INTO branches (clinic_id,code,name) VALUES ($1,'MAIN','Other') RETURNING id`, [otherClinic.rows[0].id]);
      const role = await pool.query(`INSERT INTO roles (clinic_id,code,name) VALUES ($1,'reception_cashier','Other cashier') RETURNING id`, [otherClinic.rows[0].id]);
      const password = randomBytes(24).toString('hex');
      const otherUser = await pool.query(`INSERT INTO users (clinic_id,branch_id,normalized_email,password_hash,display_name) VALUES ($1,$2,$3,$4,'Other cashier') RETURNING id`, [otherClinic.rows[0].id, otherBranch.rows[0].id, `cashier-${suffix.toLowerCase()}@nuvik.test`, await bcrypt.hash(password, 4)]);
      await pool.query(`INSERT INTO role_permissions (clinic_id,role_id,permission_id) SELECT $1,$2,id FROM permissions WHERE code IN ('catalog.read','invoices.finalize')`, [otherClinic.rows[0].id, role.rows[0].id]);
      await pool.query(`INSERT INTO user_roles (clinic_id,user_id,role_id,assigned_by) VALUES ($1,$2,$3,$2)`, [otherClinic.rows[0].id, otherUser.rows[0].id, role.rows[0].id]);
      const otherLogin = await login(`cashier-${suffix.toLowerCase()}@nuvik.test`, password, `OTHER-${suffix}`);
      assert.equal(otherLogin.response.status, 200);
      const headers = { Authorization: `Bearer ${otherLogin.body.token}` };
      const visible = await call(`/api/products?q=${encodeURIComponent(`SALE-${suffix}`)}`, { headers });
      assert.equal(visible.response.status, 200); assert.equal(visible.body.length, 0);
      const foreignSale = await sale(simpleSale('1.000', null, []), `foreign-${suffix}`, headers);
      assert.equal(foreignSale.response.status, 404);
      const limitedEmail = `limited-${suffix.toLowerCase()}@nuvik.test`;
      const created = await call('/api/users', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ displayName: 'Limited', email: limitedEmail, password }) });
      assert.equal(created.response.status, 201);
      const limited = await login(limitedEmail, password);
      assert.equal(limited.response.status, 200);
      assert.equal((await sale(simpleSale(), `denied-${suffix}`, { Authorization: `Bearer ${limited.body.token}` })).response.status, 403);
    });

    await t.test('shift expected cash equals opening float plus cash payments', async () => {
      const closed = await call(`/api/pos/shifts/${opened.body.id}/close`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ countedCash: '54.00' }) });
      assert.equal(closed.response.status, 200);
      assert.equal(closed.body.expectedCash, '54.00');
      assert.equal(closed.body.variance, '0.00');
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
