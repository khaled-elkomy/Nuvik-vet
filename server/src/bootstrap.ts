import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const PERMISSIONS: Record<string, string> = {
  'users.manage': 'Create, list, and deactivate clinic users',
  'users.roles.manage': 'Assign clinic roles to users',
  'settings.manage': 'Change clinic and branch settings',
  'catalog.prices.manage': 'Change catalog prices',
  'boarding.units.manage': 'Manage boarding units',
  'boarding.rates.manage': 'Manage boarding rates',
  'financial.documents.void': 'Void finalized financial documents',
  'financial.documents.reverse': 'Reverse finalized financial documents',
  'clinical.records.read': 'Read clinical records',
  'clinical.records.write': 'Write clinical records',
  'prescriptions.manage': 'Manage prescriptions',
  'vaccinations.record': 'Record vaccinations',
  'appointments.read': 'Read appointments',
  'boarding.care.record': 'Record boarding care',
  'hospitalization.manage': 'Manage hospitalization',
  'customers.animals.manage': 'Manage customers and animals',
  'appointments.manage': 'Manage appointments',
  'queue.manage': 'Manage walk-in queue',
  'invoices.draft.manage': 'Create and edit invoice drafts',
  'invoices.finalize': 'Finalize invoices',
  'payments.receive': 'Receive customer payments',
  'boarding.reservations.manage': 'Manage boarding reservations',
  'boarding.checkin_checkout': 'Check boarding reservations in and out',
  'vaccinations.due.read': 'Read vaccination due list',
  'catalog.read': 'Read product catalog',
  'inventory.read': 'Read inventory',
  'goods_receipts.post': 'Post goods receipts',
  'stock.count': 'Record stock counts',
  'stock.adjust': 'Post stock adjustments',
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: Object.keys(PERMISSIONS),
  vet: ['clinical.records.read', 'clinical.records.write', 'prescriptions.manage', 'vaccinations.record', 'appointments.read', 'boarding.care.record', 'hospitalization.manage'],
  reception_cashier: ['customers.animals.manage', 'appointments.manage', 'queue.manage', 'invoices.draft.manage', 'invoices.finalize', 'payments.receive', 'boarding.reservations.manage', 'boarding.checkin_checkout', 'vaccinations.due.read'],
  store_keeper: ['catalog.read', 'inventory.read', 'goods_receipts.post', 'stock.count', 'stock.adjust'],
};

const ROLE_NAMES: Record<string, string> = {
  admin: 'Administrator', vet: 'Veterinarian', reception_cashier: 'Reception and cashier', store_keeper: 'Store keeper',
};

function optionsFromArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
      parsed[key] = args[i + 1] ?? '';
      i++;
    }
  }
  return {
    clinicCode: parsed.clinicCode ?? process.env.BOOTSTRAP_CLINIC_CODE ?? '',
    clinicName: parsed.clinicName ?? process.env.BOOTSTRAP_CLINIC_NAME ?? '',
    branchCode: parsed.branchCode ?? process.env.BOOTSTRAP_BRANCH_CODE ?? '',
    branchName: parsed.branchName ?? process.env.BOOTSTRAP_BRANCH_NAME ?? '',
    adminEmail: (parsed.adminEmail ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase(),
    adminName: parsed.adminName ?? process.env.BOOTSTRAP_ADMIN_NAME ?? '',
  };
}

export async function runBootstrap(args = process.argv.slice(2)) {
  const input = optionsFromArgs(args);
  if (Object.values(input).some((value) => !value.trim())) {
    throw new Error('Required: --clinic-code --clinic-name --branch-code --branch-name --admin-email --admin-name (or matching BOOTSTRAP_* environment variables)');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.adminEmail)) throw new Error('Admin email is not valid');

  const password = randomBytes(48).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);
  const credentialsPath = path.resolve(process.cwd(), '..', '.local', 'bootstrap-credentials.txt');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(821901735, 1)');
    const existing = await client.query(`SELECT 1 FROM clinics LIMIT 1`);
    if (existing.rows.length) throw new Error('Bootstrap refused: a clinic already exists');
    await mkdir(path.dirname(credentialsPath), { recursive: true });
    await writeFile(credentialsPath, `Admin email: ${input.adminEmail}\nAdmin password: ${password}\n`, { flag: 'w', mode: 0o600 });

    const clinic = await client.query(`INSERT INTO clinics (code,name) VALUES ($1,$2) RETURNING id`, [input.clinicCode, input.clinicName]);
    const clinicId = clinic.rows[0].id as string;
    const branch = await client.query(`INSERT INTO branches (clinic_id,code,name) VALUES ($1,$2,$3) RETURNING id`, [clinicId, input.branchCode, input.branchName]);
    const branchId = branch.rows[0].id as string;

    const permissionIds = new Map<string, string>();
    for (const [code, description] of Object.entries(PERMISSIONS)) {
      const inserted = await client.query(
        `INSERT INTO permissions (code,description) VALUES ($1,$2)
         ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description RETURNING id`,
        [code, description],
      );
      permissionIds.set(code, inserted.rows[0].id);
    }
    const roleIds = new Map<string, string>();
    for (const [code, name] of Object.entries(ROLE_NAMES)) {
      const role = await client.query(
        `INSERT INTO roles (clinic_id,code,name) VALUES ($1,$2,$3) RETURNING id`, [clinicId, code, name],
      );
      roleIds.set(code, role.rows[0].id);
    }
    for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const code of codes) {
        await client.query(
          `INSERT INTO role_permissions (clinic_id,role_id,permission_id) VALUES ($1,$2,$3)`,
          [clinicId, roleIds.get(roleCode), permissionIds.get(code)],
        );
      }
    }
    const user = await client.query(
      `INSERT INTO users (clinic_id,branch_id,normalized_email,password_hash,display_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [clinicId, branchId, input.adminEmail, passwordHash, input.adminName],
    );
    const userId = user.rows[0].id as string;
    await client.query(
      `INSERT INTO user_roles (clinic_id,user_id,role_id,assigned_by) VALUES ($1,$2,$3,$2)`,
      [clinicId, userId, roleIds.get('admin')],
    );
    await client.query(
      `INSERT INTO audit_events (clinic_id,branch_id,actor_id,event_type,entity_type,entity_id,safe_summary)
       VALUES ($1,$2,$3,'bootstrap.completed','clinic',$1,'Initial clinic and administrator created')`,
      [clinicId, branchId, userId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return credentialsPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBootstrap().then((credentialsPath) => {
    console.log(credentialsPath);
    return pool.end();
  }).catch(async (error) => {
    console.error(error instanceof Error ? error.message : 'Bootstrap failed');
    await pool.end();
    process.exitCode = 1;
  });
}
