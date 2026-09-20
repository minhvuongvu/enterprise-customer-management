import { createApp } from './app.ts';

/**
 * Entry point.
 *
 * Run with `node src/main.ts` - Node 24 strips the types, so this package has
 * no build step. One less thing between a change and seeing it.
 */
const { app, config, store } = createApp();

const server = app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Mock API listening',
      url: `http://localhost:${config.port}`,
      customers: store.size,
      seed: config.seed,
      warning: 'Development only. This server does not verify passwords.',
    }),
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Without this an open SSE stream keeps the process alive after Ctrl-C.
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
