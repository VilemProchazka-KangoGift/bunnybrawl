import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  VITE_E2E_MQTT_URL: process.env.VITE_E2E_MQTT_URL ?? 'ws://127.0.0.1:18888/mqtt',
};

for (const command of [
  'npm run build',
  'npx playwright test e2e/simworker-online-smoke.spec.ts --workers=1 --retries=0',
]) {
  const result = spawnSync(command, { shell: true, stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
