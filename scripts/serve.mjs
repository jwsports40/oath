// One-command launcher: app preview server (:4173) + SCRIBE bridge (:4174).
import { spawn } from 'node:child_process';

function run(name, cmd, args) {
  const child = spawn(cmd, args, { shell: true, windowsHide: true });
  const tag = `[${name}]`;
  child.stdout.on('data', (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`${tag} ${d}`));
  child.on('close', (code) => {
    console.log(`${tag} exited ${code}`);
    process.exit(code ?? 0);
  });
  return child;
}

const app = run('app', 'npx', ['vite', 'preview', '--host']);
const bridge = run('scribe', 'node', ['server/scribe-proxy.mjs']);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { app.kill(); bridge.kill(); process.exit(0); });
}
