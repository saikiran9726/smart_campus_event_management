import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { env } from '@/env';
import { queryClient } from './query-client';

let socketInstance: Socket | null = null;

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

    return () => {
      socket.off(event, listener);
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
  useSocketEvent<SeatsUpdatePayload>('seats:update', (data) => {
    if (!eventId || data.eventId === eventId) {
      // Update specific event query in TanStack Query cache
      queryClient.setQueryData(['seats', data.eventId], data);

      queryClient.setQueryData(['events', data.eventId], (old: Record<string, unknown> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          seats_remaining: data.remaining,
          remaining: data.remaining,
        };
      });

      // Also invalidate event lists so UI stays in sync
      queryClient.invalidateQueries({ queryKey: ['events', 'list'], exact: false });
    }
  });

  const cachedData = eventId
    ? queryClient.getQueryData<SeatsUpdatePayload>(['seats', eventId])
    : undefined;

  return {
    remaining: cachedData?.remaining,
    capacity: cachedData?.capacity,
    isWaitlist: cachedData?.isWaitlist,
  };
}
