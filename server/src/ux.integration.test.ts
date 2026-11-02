import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('Set TEST_DATABASE_URL to a fresh disposable database');
if (!/(^|[_-])(test|testing|disposable)([_-]|$)/.test(new URL(testDatabaseUrl).pathname.toLowerCase())) throw new Error('TEST_DATABASE_URL must identify a disposable database');
process.env.DATABASE_URL = testDatabaseUrl;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CHANGE_ME') throw new Error('Set a local non-placeholder JWT_SECRET');
const [{ pool }, { createApp }, { estimateBirthDate }] = await Promise.all([import('./db.js'), import('./app.js'), import('./lib/estimatedBirthDate.js')]);

test('demo UX: age estimate, permissions, user management, and shift scoping', async (t) => {
  const existing = await pool.query('SELECT 1 FROM clinics LIMIT 1');
  assert.equal(existing.rows.length, 0, 'test database must be fresh');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const clinic = (await pool.query(`INSERT INTO clinics (code,name) VALUES ($1,'UX Integration') RETURNING id,code`, [`UX-${suffix}`])).rows[0];
  const branch = (await pool.query(`INSERT INTO branches (clinic_id,code,name) VALUES ($1,'MAIN','Main') RETURNING id`, [clinic.id])).rows[0];
  const permissionCodes = ['users.manage','users.roles.manage','payments.receive','customers.animals.manage','settings.manage','catalog.prices.manage','catalog.read','invoices.finalize','invoices.draft.manage','clinical.records.read'];
  const permissionIds = new Map<string,string>();
  for (const code of permissionCodes) permissionIds.set(code, (await pool.query(`INSERT INTO permissions (code,description) VALUES ($1,$1) ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description RETURNING id`, [code])).rows[0].id);
  const roleIds = new Map<string,string>();
  for (const code of ['admin','vet','reception_cashier','store_keeper']) roleIds.set(code, (await pool.query(`INSERT INTO roles (clinic_id,code,name) VALUES ($1,$2,$2) RETURNING id`, [clinic.id,code])).rows[0].id);
  const grants: Record<string,string[]> = {
    admin: permissionCodes,
    vet: ['clinical.records.read'],
    reception_cashier: ['payments.receive','customers.animals.manage','invoices.finalize','invoices.draft.manage'],
    store_keeper: ['catalog.read'],
  };
  for (const [role, codes] of Object.entries(grants)) for (const code of codes) await pool.query(`INSERT INTO role_permissions (clinic_id,role_id,permission_id) VALUES ($1,$2,$3)`, [clinic.id,roleIds.get(role),permissionIds.get(code)]);
  const passwords = { admin: randomBytes(24).toString('hex'), cashier: randomBytes(24).toString('hex'), keeper: randomBytes(24).toString('hex') };
  const createUser = async (email: string, name: string, password: string, role: string) => {
    const user = (await pool.query(`INSERT INTO users (clinic_id,branch_id,normalized_email,password_hash,display_name) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [clinic.id,branch.id,email,await bcrypt.hash(password,4),name])).rows[0];
    await pool.query(`INSERT INTO user_roles (clinic_id,user_id,role_id,assigned_by) VALUES ($1,$2,$3,$2)`, [clinic.id,user.id,roleIds.get(role)]);
    return user.id as string;
  };
  const adminId = await createUser(`admin-${suffix.toLowerCase()}@nuvik.test`,'Admin',passwords.admin,'admin');
  const cashierId = await createUser(`cashier-${suffix.toLowerCase()}@nuvik.test`,'Cashier',passwords.cashier,'reception_cashier');
  const keeperId = await createUser(`keeper-${suffix.toLowerCase()}@nuvik.test`,'Keeper',passwords.keeper,'store_keeper');
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type':'application/json', ...options.headers } });
    return { response, body: await response.json().catch(() => null) };
  };
  const login = async (email: string, password: string) => call('/api/auth/login', { method:'POST', body:JSON.stringify({ email,password,clinicCode:clinic.code }) });
  try {
    const adminLogin = await login(`admin-${suffix.toLowerCase()}@nuvik.test`,passwords.admin);
    const cashierLogin = await login(`cashier-${suffix.toLowerCase()}@nuvik.test`,passwords.cashier);
    const keeperLogin = await login(`keeper-${suffix.toLowerCase()}@nuvik.test`,passwords.keeper);
    assert.equal(adminLogin.response.status,200); assert.equal(cashierLogin.response.status,200); assert.equal(keeperLogin.response.status,200);
    const adminHeaders = { Authorization:`Bearer ${adminLogin.body.token}` };
    const cashierHeaders = { Authorization:`Bearer ${cashierLogin.body.token}` };
    const keeperHeaders = { Authorization:`Bearer ${keeperLogin.body.token}` };

    await t.test('estimated birth date from age is persisted and marked estimated', async () => {
      const species = await call('/api/species',{ method:'POST',headers:adminHeaders,body:JSON.stringify({ code:`DOG-${suffix}`,label:'كلب' }) });
      assert.equal(species.response.status,201);
      const customer = await call('/api/customers',{ method:'POST',headers:adminHeaders,body:JSON.stringify({ name:'Owner' }) });
      assert.equal(customer.response.status,201);
      const created = await call('/api/animals',{ method:'POST',headers:adminHeaders,body:JSON.stringify({ name:'Rex',speciesId:species.body.id,ownerCustomerId:customer.body.id,ageYears:2,ageMonths:0 }) });
      assert.equal(created.response.status,201,created.body?.error);
      const profile = await call(`/api/animals/${created.body.id}`,{ headers:adminHeaders });
      assert.equal(profile.body.birthDateEstimated,true);
      const actual = new Date(`${String(profile.body.dateOfBirth).slice(0,10)}T00:00:00Z`).getTime();
      const expected = new Date(`${estimateBirthDate(2,0)}T00:00:00Z`).getTime();
      assert.ok(Math.abs(actual-expected) <= 86_400_000, 'estimated date should be within one day of two years ago');
      assert.equal(profile.body.owners[0].isPrimary,true);
    });

    await t.test('permissions union role grants; cashier role stays restricted', async () => {
      await pool.query(`INSERT INTO user_roles (clinic_id,user_id,role_id,assigned_by) VALUES ($1,$2,$3,$2)`, [clinic.id,adminId,roleIds.get('vet')]);
      const me = await call('/api/auth/me',{ headers:adminHeaders });
      assert.ok(me.body.user.permissions.includes('users.manage'));
      assert.ok(me.body.user.permissions.includes('clinical.records.read'));
      assert.equal(me.body.user.permissions.length, permissionCodes.length);
      assert.equal((await call('/api/users',{ headers:adminHeaders })).response.status,200);
      assert.equal((await call('/api/customers',{ headers:adminHeaders })).response.status,200);
      assert.equal((await call('/api/users',{ headers:cashierHeaders })).response.status,403);
      assert.equal((await call('/api/invoices',{ headers:cashierHeaders })).response.status,200);
      assert.equal((await call('/api/products',{ method:'POST',headers:cashierHeaders,body:JSON.stringify({ code:'BLOCKED',name:'blocked',variants:[] }) })).response.status,403);
    });

    await t.test('cannot remove the clinic last admin role', async () => {
      const result = await call(`/api/users/${adminId}/roles/admin`,{ method:'DELETE',headers:adminHeaders });
      assert.equal(result.response.status,409);
      assert.match(result.body.error,/المدير الأخير/);
    });

    await t.test('role removal takes effect on the next API request', async () => {
      assert.equal((await call('/api/products',{ headers:keeperHeaders })).response.status,200);
      const removed = await call(`/api/users/${keeperId}/roles/store_keeper`,{ method:'DELETE',headers:adminHeaders });
      assert.equal(removed.response.status,204);
      assert.equal((await call('/api/products',{ headers:keeperHeaders })).response.status,403);
    });

    await t.test('cashier lists only own shifts; admin lists all shifts', async () => {
      assert.equal((await call('/api/pos/shifts/open',{ method:'POST',headers:adminHeaders,body:JSON.stringify({ openingCash:'20.00' }) })).response.status,201);
      assert.equal((await call('/api/pos/shifts/open',{ method:'POST',headers:cashierHeaders,body:JSON.stringify({ openingCash:'10.00' }) })).response.status,201);
      const cashierRows = await call('/api/pos/shifts',{ headers:cashierHeaders });
      const adminRows = await call('/api/pos/shifts',{ headers:adminHeaders });
      assert.equal(cashierRows.response.status,200); assert.equal(cashierRows.body.length,1); assert.equal(cashierRows.body[0].cashierId,cashierId);
      assert.equal(adminRows.response.status,200); assert.equal(adminRows.body.length,2);
    });

    await t.test('display name edit and reactivation are audited', async () => {
      assert.equal((await call(`/api/users/${cashierId}/deactivate`,{ method:'PATCH',headers:adminHeaders })).response.status,204);
      const updated = await call(`/api/users/${cashierId}`,{ method:'PATCH',headers:adminHeaders,body:JSON.stringify({ displayName:'Reactivated cashier',active:true }) });
      assert.equal(updated.response.status,200);
      assert.equal(updated.body.displayName,'Reactivated cashier');
      assert.equal(updated.body.active,true);
      const events = await pool.query(`SELECT event_type FROM audit_events WHERE clinic_id=$1 AND entity_id=$2 AND event_type IN ('users.account.deactivated','users.account.reactivated') ORDER BY event_at`, [clinic.id,cashierId]);
      assert.equal(events.rows.length,2);
    });

    await t.test('password reset accepts new password and rejects old password', async () => {
      const replacement = randomBytes(32).toString('hex');
      const result = await call(`/api/users/${cashierId}/password-reset`,{ method:'POST',headers:adminHeaders,body:JSON.stringify({ password:replacement }) });
      assert.equal(result.response.status,204);
      assert.equal((await login(`cashier-${suffix.toLowerCase()}@nuvik.test`,passwords.cashier)).response.status,401);
      assert.equal((await login(`cashier-${suffix.toLowerCase()}@nuvik.test`,replacement)).response.status,200);
      const audit = await pool.query(`SELECT event_type,safe_summary FROM audit_events WHERE clinic_id=$1 AND entity_id=$2 AND event_type='users.password.reset'`, [clinic.id,cashierId]);
      assert.equal(audit.rows.length,1);
      assert.equal(audit.rows[0].safe_summary,'Staff password reset');
    });
  } finally {
    await new Promise<void>((resolve,reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
