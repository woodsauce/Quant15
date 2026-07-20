const crypto = require('crypto');
const { json, redirect, redirectUri, cookie, STATE_COOKIE, PKCE_COOKIE, requiredOAuthEnv } = require('./_coinbaseSession');

function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

module.exports = async function handler(req, res) {
  const missing = requiredOAuthEnv();
  if (missing.length) return json(res, 500, { ok: false, error: 'Missing Coinbase OAuth environment variables', missing });
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(64));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const scope = process.env.COINBASE_OAUTH_SCOPES || 'wallet:accounts:read wallet:trades:create wallet:trades:read offline_access';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.COINBASE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri(req),
    state,
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  res.setHeader('Set-Cookie', [cookie(STATE_COOKIE, state, { maxAge: 600 }), cookie(PKCE_COOKIE, verifier, { maxAge: 600 })]);
  redirect(res, `https://login.coinbase.com/oauth2/auth?${params.toString()}`);
};
