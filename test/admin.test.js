// End-to-end test of the admin API, exercised the way public/js/admin.js calls it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3106;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'admin-test-password-1';

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let cookie = '';
async function req(method, url, body, { raw = false, auth = true } = {}) {
  const headers = {};
  if (auth && cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = raw ? 'application/octet-stream' : 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try {
    data = await res.json();
  } catch { /* not JSON */ }
  return { status: res.status, data, headers: res.headers };
}

async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* not ready */ }
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
}

test('admin.html only loads local scripts and has no inline script', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 1);
  for (const [, attrs, inner] of scripts) {
    const src = attrs.match(/src="([^"]+)"/)?.[1];
    assert.ok(src, 'every script needs a src');
    assert.match(src, /^\/[^/]/, `script must be same-origin: ${src}`);
    assert.equal(inner.trim(), '', 'no inline script bodies (CSP)');
  }
  assert.match(html, /\/css\/app\.css/);
  assert.match(html, /\/css\/admin\.css/);
  assert.match(html, /id="toasts"/);
});

test('admin API end to end', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-admin-test-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), MYSTERYVERSE_DATA_DIR: dataDir, ADMIN_PASSWORD: PASSWORD, ANTHROPIC_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  const uploaded = [];
  t.after(async () => {
    server.kill();
    await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r)));
    for (const f of uploaded) fs.rmSync(path.join(ROOT, 'public', f), { force: true });
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await waitFor(async () => (await fetch(`${BASE}/api/status`)).ok).catch(() => assert.fail(`server did not start:\n${log}`));

  await t.test('serves the admin page', async () => {
    const res = await fetch(`${BASE}/admin`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /js\/admin\.js/);
    const js = await fetch(`${BASE}/js/admin.js`);
    assert.equal(js.status, 200);
  });

  await t.test('requires login', async () => {
    assert.equal((await req('GET', '/api/admin/me')).data.admin, false);
    assert.equal((await req('GET', '/api/admin/overview')).status, 401);
    assert.equal((await req('POST', '/api/admin/login', { password: 'nope' })).status, 401);
    const ok = await req('POST', '/api/admin/login', { password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.ok(cookie.startsWith('mv_admin='));
    assert.equal((await req('GET', '/api/admin/me')).data.admin, true);
  });

  await t.test('overview and usage', async () => {
    const { data } = await req('GET', '/api/admin/overview');
    assert.equal(data.byGame.length, 7);
    assert.equal(data.ai.enabled, false);
    assert.ok(data.byGame.find((g) => g.id === 'connection').approved >= 20);
    assert.equal(typeof data.openReports, 'number');
    assert.ok(data.usage.total);
    const usage = await req('GET', '/api/admin/usage');
    assert.ok(usage.data.usage.byPurpose);
  });

  let template;
  await t.test('list, filter and fetch challenges', async () => {
    const all = (await req('GET', '/api/admin/challenges')).data.challenges;
    assert.ok(all.length >= 40);
    const conn = (await req('GET', '/api/admin/challenges?game=connection&status=approved&difficulty=easy&source=curated')).data.challenges;
    assert.ok(conn.length >= 3);
    assert.ok(conn.every((c) => c.game === 'connection' && c.difficulty === 'easy' && c.status === 'approved'));
    const search = (await req('GET', '/api/admin/challenges?q=palindrome')).data.challenges;
    assert.ok(search.some((c) => c.id === 'conn-palindromes'));
    const one = await req('GET', '/api/admin/challenges/conn-time');
    assert.equal(one.data.challenge.id, 'conn-time');
    assert.equal((await req('GET', '/api/admin/challenges/does-not-exist')).status, 404);
    template = (await req('GET', '/api/admin/templates/connection')).data;
    assert.ok(template.example.data.items.length === 5);
    assert.equal((await req('GET', '/api/admin/templates/nope')).status, 404);
  });

  let createdId;
  await t.test('create invalid and valid challenges', async () => {
    const bad = await req('POST', '/api/admin/challenges', { game: 'connection', difficulty: 'easy', data: { answer: 'x' } });
    assert.equal(bad.status, 200);
    assert.equal(bad.data.ok, false);
    assert.ok(bad.data.validation.problems.length > 0);
    const unsafeData = structuredClone(template.example.data);
    unsafeData.explanation = 'All of these involve beer.';
    const unsafe = await req('POST', '/api/admin/challenges', { game: 'connection', difficulty: 'easy', data: unsafeData });
    assert.equal(unsafe.data.ok, false);
    const data = structuredClone(template.example.data);
    data.explanation = 'Admin-written variant for testing.';
    const good = await req('POST', '/api/admin/challenges', { game: 'connection', difficulty: 'medium', status: 'pending', title: 'Test puzzle', tags: ['test'], data });
    assert.equal(good.data.ok, true, JSON.stringify(good.data));
    assert.equal(good.data.challenge.source, 'admin');
    assert.equal(good.data.challenge.status, 'pending');
    createdId = good.data.challenge.id;
  });

  await t.test('edit, approve, validate and delete', async () => {
    const id = encodeURIComponent(createdId);
    const diff = await req('PUT', `/api/admin/challenges/${id}`, { difficulty: 'hard', title: 'Renamed puzzle' });
    assert.equal(diff.data.challenge.difficulty, 'hard');
    assert.equal(diff.data.challenge.title, 'Renamed puzzle');
    const invalid = await req('PUT', `/api/admin/challenges/${id}`, { data: { items: [] } });
    assert.equal(invalid.data.ok, false);
    assert.ok(invalid.data.validation.problems.length);
    const unchanged = await req('GET', `/api/admin/challenges/${id}`);
    assert.equal(unchanged.data.challenge.data.items.length, 5, 'failed edit must not save');
    const approved = await req('PUT', `/api/admin/challenges/${id}`, { status: 'approved' });
    assert.equal(approved.data.challenge.status, 'approved');
    const checks = await req('POST', `/api/admin/challenges/${id}/validate`);
    assert.equal(checks.data.validation.ok, true);
    assert.equal(checks.data.moderation.ok, true);
    const stored = await req('GET', `/api/admin/challenges/${id}`);
    assert.ok(stored.data.challenge.validation, 'checks are stored on the record');
    // a preview start works for the admin even for a non-approved challenge
    await req('PUT', `/api/admin/challenges/${id}`, { status: 'pending' });
    const preview = await req('POST', '/api/play/start', { game: 'connection', challengeId: createdId });
    assert.equal(preview.status, 200);
    const asPlayer = await req('POST', '/api/play/start', { game: 'connection', challengeId: createdId }, { auth: false });
    assert.equal(asPlayer.status, 403);
    assert.equal((await req('DELETE', `/api/admin/challenges/${id}`)).data.ok, true);
    assert.equal((await req('GET', `/api/admin/challenges/${id}`)).status, 404);
  });

  await t.test('settings with masked API key', async () => {
    const before = (await req('GET', '/api/admin/settings')).data;
    assert.equal(before.settings.ai.apiKey, '');
    assert.equal(before.settings.content.strictMode, true);
    const saved = await req('PUT', '/api/admin/settings', {
      content: { extraBlockedTerms: ['Zorbleflop', ' '], requireApproval: true },
      ai: { apiKey: 'sk-test-abcd1234', model: 'claude-opus-5-5', chatEffort: 'low', dailyTokenBudget: 500000 },
      audio: { musicVolume: 0.5 },
      gameplay: { defaultMode: 'classroom' },
    });
    assert.equal(saved.data.settings.ai.apiKey, '••••1234');
    assert.deepEqual(saved.data.settings.content.extraBlockedTerms, ['zorbleflop']);
    assert.equal(saved.data.settings.audio.musicVolume, 0.5);
    assert.equal(saved.data.settings.gameplay.defaultMode, 'classroom');
    // sending the masked value back must not overwrite the stored key
    const again = await req('PUT', '/api/admin/settings', { ai: { apiKey: '••••1234' } });
    assert.equal(again.data.settings.ai.apiKey, '••••1234');
    assert.ok(!JSON.stringify((await req('GET', '/api/admin/settings')).data).includes('sk-test-abcd1234'), 'key never sent back');
    const cleared = await req('PUT', '/api/admin/settings', { ai: { clearApiKey: true } });
    assert.equal(cleared.data.settings.ai.apiKey, '');
    const badModel = await req('PUT', '/api/admin/settings', { ai: { model: 'bad model!' } });
    assert.equal(badModel.data.settings.ai.model, 'claude-opus-5-5');
    const status = (await req('GET', '/api/admin/overview')).data.ai;
    assert.equal(status.enabled, false);
    const test1 = await req('POST', '/api/admin/ai-test');
    assert.equal(test1.data.ok, false);
  });

  await t.test('reports flow', async () => {
    const start = await req('POST', '/api/play/start', { game: 'twenty', difficulty: 'easy' }, { auth: false });
    const challengeId = start.data.challengeId;
    const rep = await req('POST', '/api/play/report', { challengeId, reason: 'inappropriate', note: 'testing the report flow' }, { auth: false });
    assert.equal(rep.data.ok, true);
    assert.equal((await req('GET', `/api/admin/challenges/${challengeId}`)).data.challenge.status, 'pending', 'inappropriate reports hold the challenge');
    const list = (await req('GET', '/api/admin/reports')).data.reports;
    const mine = list.find((x) => x.challengeId === challengeId);
    assert.ok(mine);
    assert.equal(mine.status, 'open');
    assert.equal(mine.challenge.status, 'pending');
    assert.equal((await req('GET', '/api/admin/overview')).data.openReports, 1);
    assert.equal((await req('PUT', `/api/admin/reports/${mine.id}`, { status: 'resolved' })).data.report.status, 'resolved');
    assert.equal((await req('PUT', `/api/admin/challenges/${challengeId}`, { status: 'approved' })).data.challenge.status, 'approved');
    assert.equal((await req('GET', '/api/admin/overview')).data.openReports, 0);
    assert.equal((await req('PUT', '/api/admin/reports/nope', { status: 'resolved' })).status, 404);
  });

  await t.test('media upload, serve and delete', async () => {
    const up = await req('POST', '/api/admin/upload?name=tiny%20dot.png', PNG, { raw: true });
    assert.equal(up.status, 200, JSON.stringify(up.data));
    const m = up.data.media;
    uploaded.push(m.url);
    assert.equal(m.kind, 'image');
    assert.match(m.url, /^\/uploads\/[a-f0-9]+\.png$/);
    const served = await fetch(BASE + m.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    const rejected = await req('POST', '/api/admin/upload?name=x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { raw: true });
    assert.equal(rejected.status, 415);
    const noAuth = await req('POST', '/api/admin/upload?name=x.png', PNG, { raw: true, auth: false });
    assert.equal(noAuth.status, 401);
    const media = (await req('GET', '/api/admin/media')).data.media;
    assert.ok(media.some((x) => x.id === m.id));
    assert.equal((await req('DELETE', `/api/admin/media/${m.id}`)).data.ok, true);
    assert.equal((await fetch(BASE + m.url)).status, 404);
  });

  await t.test('generation jobs', async () => {
    const queued = await req('POST', '/api/admin/generate', { game: 'connection', difficulty: 'easy', count: 1 });
    assert.equal(queued.data.ok, true);
    const jobId = queued.data.jobs[0].id;
    const job = await waitFor(async () => {
      const j = (await req('GET', '/api/admin/jobs')).data.jobs.find((x) => x.id === jobId);
      return j && j.status === 'failed' ? j : null;
    });
    assert.match(job.error, /API key/);
    const unknown = await req('POST', '/api/admin/generate', { game: 'nope', difficulty: 'easy' });
    assert.equal(unknown.status, 400);
  });

  await t.test('audit, learned and password change', async () => {
    const audit = (await req('GET', '/api/admin/audit')).data.audit;
    const actions = audit.map((a) => a.action);
    for (const a of ['login', 'challenge-create', 'challenge-update', 'challenge-delete', 'settings-update', 'upload', 'media-delete', 'report-update']) assert.ok(actions.includes(a), `audit has ${a}`);
    assert.ok(Array.isArray((await req('GET', '/api/admin/learned')).data.learned));
    assert.equal((await req('POST', '/api/admin/password', { current: 'wrong', next: 'something-new-1' })).status, 400);
    assert.equal((await req('POST', '/api/admin/password', { current: PASSWORD, next: 'short' })).status, 400);
    assert.equal((await req('POST', '/api/admin/password', { current: PASSWORD, next: 'something-new-1' })).data.ok, true);
    assert.equal((await req('POST', '/api/admin/logout')).data.ok, true);
    cookie = '';
    assert.equal((await req('GET', '/api/admin/me')).data.admin, false);
    assert.equal((await req('POST', '/api/admin/login', { password: 'something-new-1' })).status, 200);
  });
});
