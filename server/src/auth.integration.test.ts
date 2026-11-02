import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('Set TEST_DATABASE_URL to a dedicated disposable database migrated with V001 and V002');
const testDatabaseName = new URL(testDatabaseUrl).pathname.toLowerCase();
if (!/(^|[_-])(test|testing|disposable)([_-]|$)/.test(testDatabaseName)) {
  throw new Error('TEST_DATABASE_URL database name must clearly identify a disposable test database');
}
process.env.DATABASE_URL = testDatabaseUrl;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CHANGE_ME') throw new Error('Set JWT_SECRET in the ignored local server environment');

const [{ pool }, { runBootstrap }, { createApp }, { requireAuth }] = await Promise.all([
  import('./db.js'), import('./bootstrap.js'), import('./app.js'), import('./middleware/auth.js'),
]);

test('bootstrap and Nuvik authentication integration', async (t) => {
  const existing = await pool.query('SELECT 1 FROM clinics LIMIT 1');
  assert.equal(existing.rows.length, 0, 'TEST_DATABASE_URL must refer to an empty throwaway database');

  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const adminEmail = `admin-${suffix}@nuvik.test`;
  const clinicCode = `TEST-${suffix}`;
  const bootstrapArgs = [
    '--clinic-code', clinicCode,
    '--clinic-name', 'Nuvik integration test',
    '--branch-code', 'MAIN',
    '--branch-name', 'Main branch',
    '--admin-email', adminEmail,
    '--admin-name', 'Test administrator',
  ];
  await runBootstrap(bootstrapArgs);
  await assert.rejects(() => runBootstrap(bootstrapArgs), /a clinic already exists/i);

  const credentialsPath = path.resolve(process.cwd(), '..', '.local', 'bootstrap-credentials.txt');
  const credentials = await readFile(credentialsPath, 'utf8');
  const adminPassword = credentials.match(/^Admin password: (.+)$/m)?.[1];
  assert.ok(adminPassword, 'bootstrap credentials file must contain the generated password');

  const app = createApp();
  app.all('/api/test/context', requireAuth, (req, res) => res.json(req.auth));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (route: string, options: RequestInit = {}) => {
    const response = await fetch(`${base}${route}`, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
    return { response, body: await response.json().catch(() => null) };
  };
  const login = (email: string, password: string, requestedClinicCode = clinicCode) => call('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password, clinicCode: requestedClinicCode }),
  });

  try {
    await t.test('admin login succeeds and wrong password fails', async () => {
      const good = await login(adminEmail, adminPassword!);
      assert.equal(good.response.status, 200);
      assert.ok(good.body.token);
      assert.ok(good.body.user.permissions.includes('users.manage'));
      const bad = await login(adminEmail, randomBytes(32).toString('hex'));
      assert.equal(bad.response.status, 401);
    });

    const adminLogin = await login(adminEmail, adminPassword!);
    const token = adminLogin.body.token as string;
    const authHeaders = { Authorization: `Bearer ${token}` };

    await t.test('token supplies tenant context even when request attempts to override it', async () => {
      const clinic = await pool.query(`SELECT id FROM clinics WHERE code=$1`, [clinicCode]);
      const branch = await pool.query(`SELECT id FROM branches WHERE clinic_id=$1 LIMIT 1`, [clinic.rows[0].id]);
      const otherClinic = await pool.query(`INSERT INTO clinics (code,name) VALUES ($1,'Other test clinic') RETURNING id`, [`OTHER-${suffix}`]);
      const otherBranch = await pool.query(`INSERT INTO branches (clinic_id,code,name) VALUES ($1,'OTHER','Other') RETURNING id`, [otherClinic.rows[0].id]);
      const context = await call(`/api/test/context?clinicId=${otherClinic.rows[0].id}`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ clinicId: otherClinic.rows[0].id, branchId: otherBranch.rows[0].id }),
      });
      assert.equal(context.response.status, 200);
      assert.equal(context.body.clinicId, clinic.rows[0].id);
      assert.equal(context.body.branchId, branch.rows[0].id);
      const users = await call('/api/users', { headers: authHeaders });
      assert.equal(users.response.status, 200);
      assert.ok(users.body.every((user: any) => user.id === adminLogin.body.user.id));
    });

    await t.test('permission middleware denies a user without users.manage', async () => {
      const email = `staff-${suffix}@nuvik.test`;
      const password = randomBytes(32).toString('hex');
      const created = await call('/api/users', { method: 'POST', headers: authHeaders, body: JSON.stringify({ displayName: 'Unassigned staff', email, password }) });
      assert.equal(created.response.status, 201);
      const staffLogin = await login(email, password);
      assert.equal(staffLogin.response.status, 200);
      const denied = await call('/api/users', { headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
      assert.equal(denied.response.status, 403);
    });

    await t.test('inactive and locked accounts are rejected', async () => {
      const inactiveEmail = `inactive-${suffix}@nuvik.test`;
      const inactivePassword = randomBytes(32).toString('hex');
      const inactive = await call('/api/users', { method: 'POST', headers: authHeaders, body: JSON.stringify({ displayName: 'Inactive user', email: inactiveEmail, password: inactivePassword }) });
      assert.equal(inactive.response.status, 201);
      await call(`/api/users/${inactive.body.id}/deactivate`, { method: 'PATCH', headers: authHeaders });
      assert.equal((await login(inactiveEmail, inactivePassword)).response.status, 401);

      const lockedEmail = `locked-${suffix}@nuvik.test`;
      const lockedPassword = randomBytes(32).toString('hex');
      const locked = await call('/api/users', { method: 'POST', headers: authHeaders, body: JSON.stringify({ displayName: 'Locked user', email: lockedEmail, password: lockedPassword }) });
      assert.equal(locked.response.status, 201);
      await pool.query(`UPDATE users SET locked_at=now() WHERE id=$1`, [locked.body.id]);
      assert.equal((await login(lockedEmail, lockedPassword)).response.status, 401);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
