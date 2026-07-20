const { json, redirect, redirectUri, parseCookies, clearCookie, STATE_COOKIE, PKCE_COOKIE, sessionCookie, exchangeToken, baseUrl } = require('./_coinbaseSession');

module.exports = async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};
  const app = `${baseUrl(req)}/?coinbase=callback`;
  if (error) return redirect(res, `${app}&coinbase_error=${encodeURIComponent(error_description || error)}`);
  const cookies = parseCookies(req);
  if (!code || !state || state !== cookies[STATE_COOKIE]) {
    return json(res, 400, { ok: false, error: 'Coinbase OAuth state check failed. Start the Coinbase connection again.' });
  }
  try {
    const tokens = await exchangeToken({
      grant_type: 'authorization_code',
      client_id: process.env.COINBASE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.COINBASE_OAUTH_CLIENT_SECRET || '',
      code,
      redirect_uri: redirectUri(req),
      code_verifier: cookies[PKCE_COOKIE] || ''
    });
    res.setHeader('Set-Cookie', [sessionCookie(tokens), clearCookie(STATE_COOKIE), clearCookie(PKCE_COOKIE)]);
    redirect(res, `${app}&coinbase_connected=1`);
  } catch (err) {
    json(res, 502, { ok: false, error: 'Coinbase token exchange failed', detail: err.message });
  }
};
