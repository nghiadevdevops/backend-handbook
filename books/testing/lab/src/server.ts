import { composeFromEnv } from './composition.ts';
import { buildApp } from './http/app.ts';

const port = Number(process.env['PORT'] ?? 8080);
const app = buildApp(composeFromEnv(process.env));

await app.listen({ port, host: '0.0.0.0' });
