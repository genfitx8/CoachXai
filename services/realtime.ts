import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function realtimeConnect() {
  if (socket) return socket;
  const url = process.env.REACT_APP_SOCKET_URL || '';
  socket = io(url, { autoConnect: true });
  return socket;
}

export function realtimeSubscribe(channel: string, handler: (payload: any) => void) {
  const s = realtimeConnect();
  s.on(channel, handler);
}

export function realtimeUnsubscribe(channel: string, handler: (payload: any) => void) {
  if (!socket) return;
  socket.off(channel, handler);
}

export function realtimeDisconnect() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
