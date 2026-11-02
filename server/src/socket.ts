import type { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import type { AuthUser } from './types.js';

let ioInstance: Server | null = null;

export function setIO(io: Server) {
  ioInstance = io;
}

export function getIO(): Server {
  if (!ioInstance) throw new Error('Socket.io لم يتم تهيئته بعد');
  return ioInstance;
}

export const RECEPTION_ROOM = 'reception';
export const roomForDoctor = (doctorId: string) => `doctor:${doctorId}`;

/**
 * لحظة ما أي شاشة (ريسبشن أو دكتور) تفتح الاتصال اللحظي، بتبعت توكن الدخول
 * بتاعها عن طريق حدث "identify". السيرفر بيتحقق من التوكن ويضم الـ socket
 * لغرفة مخصصة حسب الهوية — وده أساس العزل: دكتور معينّ مش هيستقبل
 * أي حدث عن مرضى دكتور تاني، لأنه أصلًا مش في الغرفة بتاعته.
 */
export function registerSocketAuth(socket: Socket) {
  socket.on('identify', (token: string) => {
    try {
      const user = jwt.verify(token, env.jwtSecret, {
        issuer: env.jwtIssuer,
        audience: env.jwtAudience,
      }) as AuthUser;
      if (user.role === 'doctor') {
        socket.join(roomForDoctor(user.id));
      } else if (user.role === 'reception') {
        socket.join(RECEPTION_ROOM);
      }
    } catch {
      // توكن غير صالح — الـ socket ببساطة مش بينضم لأي غرفة، مش هيستقبل تحديثات
    }
  });
}
