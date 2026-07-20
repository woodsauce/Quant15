const crypto = require('crypto');
const { sign } = require('jsonwebtoken');

const HOST = 'api.coinbase.com';
const API_BASE = `https://${HOST}`;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function getSecret() {
  const b64 = process.env.COINBASE_PRIVATE_KEY_B64 || '';
  const raw = process.env.COINBASE_PRIVATE_KEY || '';
  if (b64.trim()) {
    return Buffer.from(b64.trim(), 'base64').toString('utf8').replace(/\\n/g, '\n');
  }
  return raw.replace(/\\n/g, '\n');
}

function missingEnv() {
  const missing = [];
  if (!process.env.COINBASE_API_KEY_NAME) missing.push('COINBASE_API_KEY_NAME');
  if (!process.env.COINBASE_PRIVATE_KEY_B64 && !process.env.COINBASE_PRIVATE_KEY) missing.push('COINBASE_PRIVATE_KEY_B64');
  return missing;
}

function buildJwt(method, path) {
  const keyName = process.env.COINBASE_API_KEY_NAME;
  const keySecret = getSecret();
  if (!keyName || !keySecret) throw new Error('Missing Coinbase API key environment variables.');
  const now = Math.floor(Date.now() / 1000);
  const uri = `${method.toUpperCase()} ${HOST}${path}`;
  return sign(
    {
      iss: 'cdp',
      nbf: now,
      exp: now + 120,
      sub: keyName,
      uri,
    },
    keySecret,
    {
      algorithm: 'ES256',
      header: {
        kid: keyName,
        nonce: crypto.randomBytes(16).toString('hex'),
      },
    }
  );
}

async function coinbaseRequest(path, { method = 'GET', body } = {}) {
  const token = buildJwt(method, path);
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = data?.message || data?.error || data?.raw || `${response.status} ${response.statusText}`;
    const err = new Error(detail);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function inspectKey() {
  const secret = getSecret();
  const header = (secret.match(/-----BEGIN [^-]+-----/) || [null])[0];
  const hasPrivate = /PRIVATE KEY/.test(secret);
  const isEncrypted = /ENCRYPTED PRIVATE KEY/.test(secret);
  const isEC = /EC PRIVATE KEY|BEGIN PRIVATE KEY/.test(secret);
  return {
    keyNameFound: Boolean(process.env.COINBASE_API_KEY_NAME),
    privateKeyFound: Boolean(secret),
    privateKeyHeader: header || 'not found',
    looksLikePrivateKey: hasPrivate,
    encryptedKeyDetected: isEncrypted,
    expectedTypeHint: isEC ? 'Looks compatible with Coinbase CDP ECDSA key format.' : 'Coinbase Advanced Trade CDP keys normally use an EC private key / ECDSA key.',
  };
}

module.exports = { json, missingEnv, buildJwt, coinbaseRequest, inspectKey };
