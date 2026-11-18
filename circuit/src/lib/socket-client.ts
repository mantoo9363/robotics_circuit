import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSimulationServerUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL;
}

export function getSimulationSocket() {
  if (socket) return socket;

  socket = io(getSimulationServerUrl(), {
    autoConnect: false,
    //transports: ["polling",'websocket'],
    transports: ['websocket'],
  });

  return socket;
}
