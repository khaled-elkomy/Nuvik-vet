import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool({ connectionString: env.databaseUrl });

pool.on('error', (err) => {
  console.error('❌ خطأ غير متوقع في اتصال قاعدة البيانات', err);
});
