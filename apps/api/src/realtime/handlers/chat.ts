import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@eventora/shared';
import {
  checkTypingThrottle,
  clearTypingStateForUser,
} from '../../modules/channels/rate-limiter';
import {
  checkChannelReadAccess,
  markChannelRead,
  postMessageToChannel,
} from '../../modules/channels/service';

export function registerChatHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
): void {
  const userId = socket.data.userId;

  // 1. Join channel room with verification
  socket.on('join:channel', async ({ channelId }) => {
    if (!userId) {
      socket.emit('error' as any, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required to join channels.',
      });
      return;
    }

    try {
      const hasAccess = await checkChannelReadAccess(channelId, userId);
      if (!hasAccess) {
        socket.emit('error' as any, {
          code: 'FORBIDDEN',
          message: 'You do not have access to this channel.',
        });
        return;
      }

      socket.join(`channel:${channelId}`);
      socket.emit('joined:channel' as any, { channelId });
    } catch (err: any) {
      socket.emit('error' as any, {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to join channel.',
      });
    }
  });

  // 2. Leave channel room
  socket.on('leave:channel', ({ channelId }) => {
    socket.leave(`channel:${channelId}`);
  });

  // 3. Socket-based message dispatch
  socket.on('chat:message' as any, async (payload: { channelId: string; body?: string; content?: string; replyToId?: string }) => {
    if (!userId) {
      socket.emit('error' as any, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required to send messages.',
      });
      return;
    }

    const messageContent = payload.body || payload.content || '';

    try {
      await postMessageToChannel(payload.channelId, userId, messageContent, payload.replyToId);
    } catch (err: any) {
      socket.emit('error' as any, {
        code: err.code || 'VALIDATION_FAILED',
        message: err.message || 'Failed to send message.',
      });
    }
  });

  // 4. Throttled typing indicator (max 1 per 2 seconds)
  socket.on('chat:typing', (payload) => {
    if (!userId) return;

    const allowed = checkTypingThrottle(payload.channelId, userId);
    if (!allowed) {
      return; // Drop throttled indicator
    }

    socket.to(`channel:${payload.channelId}`).emit('chat:typing', {
      channelId: payload.channelId,
      userId,
      userName: payload.userName || 'User',
      isTyping: payload.isTyping,
    });
  });

  // 5. Read receipt
  socket.on('chat:read', async (payload) => {
    if (!userId) return;

    try {
      await markChannelRead(payload.channelId, userId, payload.lastReadMessageId);
    } catch {
      // Ignore background read sync errors
    }
  });

  // 6. Cleanup on disconnect
  socket.on('disconnect', () => {
    if (userId) {
      clearTypingStateForUser(userId);
    }
  });
}
