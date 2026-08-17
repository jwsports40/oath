// One-command launcher: app preview (:4173) + SCRIBE bridge (:4174) and, when
// cloudflared is installed, a free https tunnel to the bridge so the hosted app
// (GitHub Pages) can reach it from anywhere. The tunnel URL is printed below —
// paste it into the app: Hero → Settings → SCRIBE → BRIDGE URL.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Freshly-installed cloudflared may not be on PATH in already-open shells.
const CLOUDFLARED = [
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
].find(existsSync) ?? 'cloudflared';

function run(name, cmd, args, { onData, optional = false } = {}) {
  const child = spawn(cmd, args, { shell: true, windowsHide: true });
  const tag = `[${name}]`;
  const pipe = (d) => {
    process.stdout.write(`${tag} ${d}`);
    if (onData) onData(String(d));
  };
  child.stdout.on('data', pipe);
  child.stderr.on('data', pipe);
  child.on('close', (code) => {
    console.log(`${tag} exited ${code}`);
    if (!optional) process.exit(code ?? 0);
  });
  return child;
}

const children = [];
children.push(run('app', 'npx', ['vite', 'preview', '--host']));
children.push(run('scribe', 'node', ['server/scribe-proxy.mjs']));

// Publish the tunnel URL to the repo's 'bridge' branch so the deployed app
// AUTO-CONNECTS — no more pasting the URL into Settings after each restart.
function publishBridgeUrl(url) {
  try {
    const repo = 'jwsports40/oath';
    const path = 'bridge-url.txt';
    let sha = null;
    try {
      const cur = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/contents/${path}?ref=bridge`], { encoding: 'utf8' }));
      sha = cur.sha;
    } catch { /* first publish */ }
    const args = ['api', '-X', 'PUT', `repos/${repo}/contents/${path}`,
      '-f', `message=bridge: ${url}`,
      '-f', `content=${Buffer.from(url).toString('base64')}`,
      '-f', 'branch=bridge'];
    if (sha !== null) args.push('-f', `sha=${sha}`);
    execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('[tunnel] bridge URL published — the app will auto-connect');
  } catch (e) {
    console.log('[tunnel] bridge URL publish failed (paste it manually):', e.message);
  }
}

// Quick tunnel (no Cloudflare account needed). URL changes on each restart.
let announced = false;
children.push(run('tunnel', `"${CLOUDFLARED}"`, ['tunnel', '--url', 'http://localhost:4174'], {
  optional: true,
  onData: (text) => {
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !announced) {
      announced = true;
      publishBridgeUrl(m[0]);
      setTimeout(() => {
        console.log('\n############################################################');
        console.log('#  SCRIBE BRIDGE TUNNEL — auto-connected (no paste needed)  #');
        console.log(`#  ${m[0]}  `);
        console.log('############################################################\n');
      }, 500);
    }
  },
}));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { for (const c of children) c.kill(); process.exit(0); });
}
