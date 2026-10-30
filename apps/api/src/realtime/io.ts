import type { Server as HTTPServer } from 'node:http';
import { verifyToken } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@eventora/shared';
import { db } from '../db/client';
import { users } from '../db/schema';
import { env } from '../env';
import { registerChatHandlers } from './handlers/chat';

let ioInstance: Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> | null = null;

export function initIO(
  httpServer: HTTPServer
): Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.PUBLIC_WEB_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Socket authentication middleware
  io.use(async (socket: Socket<any, any, any, SocketData>, next) => {
    try {
      // Test bypass in test environment
      if (env.NODE_ENV === 'test') {
        const testUserId =
          socket.handshake.auth?.testUserId ||
          socket.handshake.headers['x-test-user-id'];

        if (typeof testUserId === 'string' && testUserId) {
          socket.data.userId = testUserId;
          return next();
        }
      }

      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const verified = await verifyToken(token, {
        secretKey: env.CLERK_SECRET_KEY,
      });

      if (!verified?.sub) {
        return next(new Error('Invalid token payload'));
      }

      const [user] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.clerkId, verified.sub))
        .limit(1);

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.data.userId = user.id;
      socket.data.role = user.role;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Register all chat handlers (join verification, message, typing throttling, read receipts)
    registerChatHandlers(io, socket);
  });

  ioInstance = io;
  return io;
}

export function getIO(): Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized yet');
  }
  return ioInstance;
}

/**
 * Emits updated seat availability for a live event to room `event:{eventId}`
 */
export function emitSeats(eventId: string, remaining: number): void {
  if (ioInstance) {
    ioInstance.to(`event:${eventId}`).emit('seats:update', {
      eventId,
      remaining,
    });
  }
}

/**
 * Emits gate scan result event to room `event:{eventId}`
 */
export function emitScanResult(eventId: string, payload: any): void {
  if (ioInstance) {
    (ioInstance as any).to(`event:${eventId}`).emit('scan:result', payload);
  }
}

