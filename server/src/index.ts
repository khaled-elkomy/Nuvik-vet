import 'express-async-errors'; // لازم يكون أول استيراد — بيخلي أخطاء الـ async routes توصل للـ error handler تلقائيًا
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { env } from './env.js';
import { setIO, registerSocketAuth } from './socket.js';
import { authRouter } from './routes/auth.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { patientsRouter } from './routes/patients.routes.js';
import { visitsRouter } from './routes/visits.routes.js';
import { prescriptionsRouter } from './routes/prescriptions.routes.js';
import { attachmentsRouter } from './routes/attachments.routes.js';
import { prescriptionImagesRouter } from './routes/prescriptionImages.routes.js';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { queueRouter } from './routes/queue.routes.js';
import { medicalRecordsRouter } from './routes/medicalRecords.routes.js';
import { financeRouter } from './routes/finance.routes.js';

const app = express();
const httpServer = http.createServer(app);

// Nuvik Vet accepts only the explicit local origins configured in env.clientOrigins.
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
    callback(new Error('غير مسموح بالوصول من هذا المصدر (CORS)'));
  },
  credentials: true,
};

const io = new Server(httpServer, { cors: corsOptions });
setIO(io);

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

/**
 * ملحوظة أمان مهمة: مفيش static mount عام لمجلد uploads كله.
 * ملفات المرضى (تحاليل/أشعة/روشتات) بتتقرى بس عن طريق راوتس محمية
 * بتسجيل الدخول (GET /api/attachments/file/:id و /api/prescription-images/file/:id).
 * الاستثناء الوحيد هو شعار العيادة، وهو مش بيانات حساسة، فمتاح كملف عام:
 */
app.use('/uploads/logos', express.static(path.resolve(process.cwd(), 'uploads', 'logos')));

app.get('/api/health', (_req, res) => res.json({ ok: true, message: 'السيرفر شغال' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/prescriptions', prescriptionsRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/prescription-images', prescriptionImagesRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/queue', queueRouter);
app.use('/api/medical-records', medicalRecordsRouter);
app.use('/api/finance', financeRouter);

// معالج أخطاء عام — بيرجع رسالة عربية واضحة بدل ما السيرفر يقع، وميسربش تفاصيل داخلية
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ خطأ في السيرفر:', err);
  const status = err.status || 500;
  const safeMessage = status < 500 ? (err.message || 'حدث خطأ') : 'حدث خطأ غير متوقع في السيرفر، حاول لاحقًا';
  res.status(status).json({ error: safeMessage });
});

io.on('connection', (socket) => {
  console.log(`🔌 اتصال جديد: ${socket.id}`);
  registerSocketAuth(socket);
  socket.on('disconnect', () => console.log(`🔌 انقطع الاتصال: ${socket.id}`));
});

httpServer.listen(env.port, () => {
  console.log(`✅ السيرفر شغال على http://localhost:${env.port}`);
});
