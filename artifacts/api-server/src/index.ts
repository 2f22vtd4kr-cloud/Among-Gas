import { createServer } from 'node:http';
import app from './app.js';
import { attachWsServer } from './ws/wsServer.js';
import { logger } from './lib/logger.js';

const rawPort = process.env['PORT'];

if (!rawPort) {
  throw new Error('PORT environment variable is required but was not provided.');
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Create a plain HTTP server from the Express app so we can share it with the
// WebSocket server.  Both HTTP and WS traffic arrive on the same port; the
// 'upgrade' event handler in attachWsServer routes WS connections to /api/ws
// while all normal HTTP requests continue through Express.
const httpServer = createServer(app);

attachWsServer(httpServer);

httpServer.on('error', (err) => {
  logger.error({ err }, 'Error listening on port');
  process.exit(1);
});

httpServer.listen(port, () => {
  logger.info({ port }, 'Server listening');
});
