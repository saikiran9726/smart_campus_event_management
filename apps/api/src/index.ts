import { pool } from './db/client';
import { env } from './env';
import { initIO } from './realtime/io';
import { buildServer } from './server';
import { startAllWorkers, stopAllWorkers } from './workers';

export * from './db/client';
export * from './db/schema';
export * from './env';
export * from './lib/app-error';
export * from './middleware/rbac';
export * from './plugins/auth';
export * from './realtime/io';
export * from './modules/forms';
export * from './modules/registrations';
export * from './modules/payments';
export * from './modules/waitlist';
export * from './modules/strikes';
export * from './modules/tickets';
export * from './modules/passkeys';
export * from './modules/gate';
export * from './modules/comms';
export * from './workers';
export * from './server';

async function start(): Promise<void> {
  const server = buildServer();

  // Initialize Socket.IO attached to Fastify's HTTP server
  const io = initIO(server.server);

  const shutdown = async (signal: string) => {
    server.log.info({ signal }, 'Graceful shutdown initiated');
    try {
      stopAllWorkers();
      io.close();
      await server.close();
      await pool.end();
      server.log.info('Graceful shutdown completed');
      process.exit(0);
    } catch (err) {
      server.log.error(err, 'Error encountered during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 Eventora API server ready at http://0.0.0.0:${env.PORT}`);
    startAllWorkers();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Automatically start server in non-test runtime
if (env.NODE_ENV !== 'test') {
  start();
}

