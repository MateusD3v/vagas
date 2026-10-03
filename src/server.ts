import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = await buildApp();
let stopping = false;

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'Falha ao iniciar a API');
  process.exitCode = 1;
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'Encerrando API');
    void app.close().finally(() => {
      process.exitCode = 0;
    });
  });
}
