import type { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { env } from './env.js';

let ioInstance: Server | null = null;
export function setIO(io: Server) { ioInstance = io; }
export function getIO(): Server {
  if (!ioInstance) throw new Error('Socket.io لم يتم تهيئته بعد');
  return ioInstance;
}

export async function registerSocketAuth(socket: Socket) {
  socket.on('identify', async (token: string) => {
    try {
      const payload = jwt.verify(token, env.jwtSecret, { issuer: env.jwtIssuer, audience: env.jwtAudience }) as jwt.JwtPayload;
      if (typeof payload.sub !== 'string' || typeof payload.clinic_id !== 'string' || typeof payload.branch_id !== 'string') return;
      const valid = await pool.query(
        `SELECT 1 FROM users u JOIN branches b
           ON b.id=u.branch_id AND b.clinic_id=u.clinic_id AND b.active
          WHERE u.id=$1 AND u.clinic_id=$2 AND u.branch_id=$3 AND u.active AND u.locked_at IS NULL`,
        [payload.sub, payload.clinic_id, payload.branch_id],
      );
      if (!valid.rows[0]) return;
      for (const room of socket.rooms) if (room !== socket.id) await socket.leave(room);
      await socket.join(`clinic:${payload.clinic_id}`);
      await socket.join(`branch:${payload.clinic_id}:${payload.branch_id}`);
    } catch {
      // Invalid or stale tokens receive no tenant or branch room.
    }
  });
}
