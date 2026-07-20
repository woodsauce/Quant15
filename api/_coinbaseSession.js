const crypto = require('crypto');

const TOKEN_URL = 'https://login.coinbase.com/oauth2/token';
const API_BASE = 'https://api.coinbase.com';
const SESSION_COOKIE = 'edge15_cb_session';
const STATE_COOKIE = 'edge15_cb_state';
const PKCE_COOKIE = 'edge15_cb_pkce';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function baseUrl(req) {
  if (process.env.PUBLIC_APP_URL) return String(process.env.PUBLIC_APP_URL).replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function redirectUri(req) {
  return process.env.COINBASE_OAUTH_REDIRECT_URI || `${baseUrl(req)}/api/coinbase-oauth-callback`;
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  if (process.env.NODE_ENV !== 'development') parts.push('Secure');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

function clearCookie(name) {
  return cookie(name, '', { maxAge: 0 });
}

function secretKey() {
  const raw = process.env.OAUTH_SESSION_SECRET || process.env.COINBASE_OAUTH_CLIENT_SECRET || 'dev-only-change-me';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encrypt(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const pt = Buffer.from(JSON.stringify(payload), 'utf8');
  const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

function decrypt(value) {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    return JSON.parse(dec);
  } catch {
    return null;
  }
}

function getSession(req) {
  return decrypt(parseCookies(req)[SESSION_COOKIE]);
}

function sessionCookie(tokens) {
  const expiresAt = Date.now() + Math.max(30, Number(tokens.expires_in || 3600) - 60) * 1000;
  const session = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || 'bearer',
    scope: tokens.scope || '',
    expires_at: expiresAt,
    created_at: Date.now()
  };
  return cookie(SESSION_COOKIE, encrypt(session), { maxAge: 60 * 60 * 24 * 365 });
}

async function exchangeToken(params) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams(params).toString()
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  return data;
}

async function refreshIfNeeded(req, res) {
  let session = getSession(req);
  if (!session) return null;
  if (Date.now() < Number(session.expires_at || 0) - 30_000) return session;
  if (!session.refresh_token) return session;
  const tokens = await exchangeToken({
    grant_type: 'refresh_token',
    client_id: process.env.COINBASE_OAUTH_CLIENT_ID || '',
    client_secret: process.env.COINBASE_OAUTH_CLIENT_SECRET || '',
    refresh_token: session.refresh_token
  });
  res.setHeader('Set-Cookie', sessionCookie(tokens));
  return getSession({ headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(encrypt({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || 'bearer',
    scope: tokens.scope || '',
    expires_at: Date.now() + Math.max(30, Number(tokens.expires_in || 3600) - 60) * 1000,
    created_at: Date.now()
  }))}` }});
}

async function coinbaseApi(path, options = {}, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function requiredOAuthEnv() {
  const missing = [];
  if (!process.env.COINBASE_OAUTH_CLIENT_ID) missing.push('COINBASE_OAUTH_CLIENT_ID');
  if (!process.env.COINBASE_OAUTH_CLIENT_SECRET) missing.push('COINBASE_OAUTH_CLIENT_SECRET');
  if (!process.env.OAUTH_SESSION_SECRET) missing.push('OAUTH_SESSION_SECRET');
  return missing;
}

module.exports = {
  TOKEN_URL,
  API_BASE,
  SESSION_COOKIE,
  STATE_COOKIE,
  PKCE_COOKIE,
  json,
  redirect,
  baseUrl,
  redirectUri,
  parseCookies,
  cookie,
  clearCookie,
  encrypt,
  decrypt,
  getSession,
  sessionCookie,
  exchangeToken,
  refreshIfNeeded,
  coinbaseApi,
  requiredOAuthEnv
};
