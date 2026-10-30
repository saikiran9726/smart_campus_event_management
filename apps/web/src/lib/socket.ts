import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { env } from '@/env';
import { queryClient } from './query-client';

let socketInstance: Socket | null = null;
const localListeners = new Map<string, Set<(data: any) => void>>();

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(env.VITE_API_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
  }
  return socketInstance;
}

export function connectSocket(token?: string | null): Socket {
  const socket = getSocket();
  if (token) {
    socket.auth = { token };
  }
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socketInstance && socketInstance.connected) {
    socketInstance.disconnect();
  }
}

export function emitSocketEvent(event: string, data: unknown): void {
  const set = localListeners.get(event);
  if (set) {
    set.forEach((fn) => fn(data));
  }
}

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();

    const listener = (data: T) => {
      handlerRef.current(data);
    };

    socket.on(event, listener);

    if (!localListeners.has(event)) {
      localListeners.set(event, new Set());
    }
    localListeners.get(event)!.add(listener);

    return () => {
      socket.off(event, listener);
      localListeners.get(event)?.delete(listener);
    };
  }, [event]);
}

export interface SeatsUpdatePayload {
  eventId: string;
  remaining: number;
  capacity?: number;
  isWaitlist?: boolean;
}

export function useSeats(eventId?: string) {
  const [liveSeats, setLiveSeats] = useState<SeatsUpdatePayload | null>(() => {
    return eventId
      ? queryClient.getQueryData<SeatsUpdatePayload>(['seats', eventId]) || null
      : null;
  });

  useSocketEvent<SeatsUpdatePayload>('seats:update', (data) => {
    if (!eventId || data.eventId === eventId) {
      setLiveSeats(data);
      queryClient.setQueryData(['seats', data.eventId], data);

      queryClient.setQueryData(
        ['events', data.eventId],
        (old: Record<string, unknown> | undefined) => {
          if (!old) return old;
          return {
            ...old,
            seats_remaining: data.remaining,
            remaining: data.remaining,
          };
        }
      );

      queryClient.invalidateQueries({ queryKey: ['events', 'list'], exact: false });
    }
  });

  return {
    remaining: liveSeats?.remaining,
    capacity: liveSeats?.capacity,
    isWaitlist: liveSeats?.isWaitlist,
  };
}
