// Rate limiting and admin authentication.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { db, persist, audit } from './db.js';
import { parseCookies } from './http.js';

const buckets = new Map();

/** Fixed-window limiter. Returns true while the caller is under the limit. */
export function rateLimit(key, limit, windowMs = 60_000) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, count: 0, windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > b.windowMs) buckets.delete(k);
}, 60_000).unref();

const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');

export function setAdminPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  db().admin = { salt, hash: hashPassword(pw, salt), changedAt: new Date().toISOString() };
  persist();
}

export function verifyAdminPassword(pw) {
  const admin = db().admin;
  if (!admin) return false;
  const a = Buffer.from(hashPassword(pw, admin.salt), 'hex');
  const b = Buffer.from(admin.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Makes sure an admin password exists. Returns a newly generated password, if any. */
export function ensureAdminPassword() {
  const envPw = process.env.ADMIN_PASSWORD;
  if (envPw) {
    if (!verifyAdminPassword(envPw)) setAdminPassword(envPw);
    return null;
  }
  if (db().admin) return null;
  const pw = crypto.randomBytes(9).toString('base64url');
  setAdminPassword(pw);
  fs.writeFileSync(path.join(DATA_DIR, 'ADMIN_PASSWORD.txt'), `MysteryVerse admin password: ${pw}\nChange it in Admin > Settings.\n`);
  audit('system', 'admin-password-generated');
  return pw;
}

const sessions = new Map(); // token -> expiry
const SESSION_MS = 12 * 3600_000;

export function createAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}

export function destroyAdminSession(req) {
  sessions.delete(parseCookies(req).mv_admin);
}

export function isAdmin(req) {
  const token = parseCookies(req).mv_admin;
  const exp = token && sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export const adminCookie = (token, secure = false) =>
  `mv_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
export const clearAdminCookie = 'mv_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
