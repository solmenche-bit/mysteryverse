// MYSTERYVERSE server entry point.
import http from 'node:http';
import path from 'node:path';
import { PORT, PUBLIC_DIR } from './server/config.js';
import { loadDb, writeNow } from './server/db.js';
import { sendJson, serveStatic, readBody, HttpError, clientIp, SECURITY_HEADERS } from './server/http.js';
import { ensureAdminPassword, rateLimit } from './server/security.js';
import { router } from './server/api.js';
import { GAMES, GAME_MAP } from './server/games/index.js';
import { seedCurated } from './server/engine/challenges.js';
import { initGeneration } from './server/engine/generation.js';
import { aiStatus } from './server/ai/provider.js';

loadDb();
const newPassword = ensureAdminPassword();
const seeded = seedCurated(GAMES);
initGeneration(GAME_MAP);

async function handleApi(req, res, url) {
  const match = router.match(req.method, url.pathname);
  if (!match) throw new HttpError(404, 'Not found');
  if (!rateLimit(`api:${clientIp(req)}`, 600)) throw new HttpError(429, 'Too many requests');
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!match.opts.rawBody) {
      const raw = await readBody(req, 1_000_000);
      if (raw.length) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          throw new HttpError(400, 'Invalid JSON');
        }
      }
    }
  }
  const query = Object.fromEntries(url.searchParams);
  const result = await match.handler({ req, res, body, query, params: match.params });
  if (!res.headersSent) sendJson(res, 200, result ?? { ok: true });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    if (url.pathname === '/admin' || url.pathname === '/admin/') return serveStatic(req, res, PUBLIC_DIR, '/admin.html');
    if (serveStatic(req, res, PUBLIC_DIR, url.pathname)) return;
    // Unknown non-file paths fall back to the app shell (hash routing lives in the browser).
    if (!path.extname(url.pathname)) return serveStatic(req, res, PUBLIC_DIR, '/index.html');
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Not found');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('[error]', req.method, url.pathname, err);
    if (!res.headersSent) sendJson(res, status, { ok: false, error: status === 500 ? 'Something went wrong on the server.' : err.message, ...(err.extra || {}) });
    else res.end();
  }
});

server.listen(PORT, () => {
  const ai = aiStatus();
  console.log(`\n  MYSTERYVERSE is running at http://localhost:${PORT}`);
  console.log(`  Admin dashboard:          http://localhost:${PORT}/admin`);
  console.log(`  Challenges: ${seeded.added} added, ${seeded.updated} refreshed from the curated library`);
  console.log(`  AI: ${ai.enabled ? `connected (${ai.model})` : `offline mode - ${ai.reason}`}`);
  if (newPassword) console.log(`  New admin password: ${newPassword}  (also saved in data/ADMIN_PASSWORD.txt)`);
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    writeNow();
    process.exit(0);
  });
}
