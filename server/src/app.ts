import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { authRouter } from './routes/auth.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { customersAnimalsRouter } from './routes/customersAnimals.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { posRouter } from './routes/pos.routes.js';

export function createApp() {
  const app = express();
  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      callback(new Error('غير مسموح بالوصول من هذا المصدر (CORS)'));
    },
    credentials: true,
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'nuvik-vet-api' }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api', customersAnimalsRouter);
  app.use('/api', catalogRouter);
  app.use('/api', posRouter);
  // Legacy Human Clinic routers are intentionally not mounted until rewired to the new schema.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API request failed', err);
    const status = err.status || 500;
    res.status(status).json({ error: status < 500 ? (err.message || 'حدث خطأ') : 'حدث خطأ غير متوقع في السيرفر' });
  });
  return app;
}
