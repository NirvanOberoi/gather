// One-command E2E: serves dist/ and runs the demo flow. Usage: npm run test:e2e (after npm run export:web)
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['e2e/serve.mjs', 'dist', '8089'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const flow = spawn(process.execPath, ['e2e/demo-flow.mjs'], { stdio: 'inherit', env: { ...process.env, BASE_URL: 'http://localhost:8089' } });
flow.on('exit', (code) => {
  server.kill();
  process.exit(code ?? 1);
});
