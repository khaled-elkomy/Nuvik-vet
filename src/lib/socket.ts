import { io, type Socket } from 'socket.io-client';
import { getAuthToken } from './api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

let socket: Socket | null = null;

/**
 * اتصال Socket.io واحد يتشارك فيه كل التطبيق.
 * بمجرد الاتصال (وبعد أي إعادة اتصال) بنبعت "identify" بتوكن الدخول الحالي،
 * عشان السيرفر يضم الـ socket لغرفة الدكتور بتاعه بالذات — وده أساس عزل
 * قوائم الانتظار: دكتور مش هيستقبل أي حدث عن مريض مش بتاعه أصلًا.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
    const identify = () => {
      const token = getAuthToken();
      if (token) socket!.emit('identify', token);
    };
    socket.on('connect', identify);
  }
  return socket;
}

/** ينادَى بعد أي تسجيل دخول ناجح لضمان إن الـ socket منضم لغرفة المستخدم الجديد فورًا */
export function reidentifySocket() {
  const token = getAuthToken();
  if (socket?.connected && token) socket.emit('identify', token);
}
