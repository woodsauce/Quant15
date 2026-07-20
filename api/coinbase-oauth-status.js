const { json, refreshIfNeeded, coinbaseApi, requiredOAuthEnv } = require('./_coinbaseSession');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  const missing = requiredOAuthEnv();
  let session = null;
  try { session = await refreshIfNeeded(req, res); } catch (err) { return json(res, 401, { connected: false, error: 'Coinbase token refresh failed', detail: err.message, missingEnv: missing }); }
  if (!session) return json(res, 200, { connected: false, missingEnv: missing, liveTradingEnabled: process.env.COINBASE_LIVE_TRADING_ENABLED === 'true' });
  try {
    const accounts = await coinbaseApi('/api/v3/brokerage/accounts?limit=20', { method: 'GET' }, session.access_token);
    json(res, 200, {
      connected: true,
      scope: session.scope,
      expiresAt: session.expires_at,
      liveTradingEnabled: process.env.COINBASE_LIVE_TRADING_ENABLED === 'true',
      accountsCount: Array.isArray(accounts.accounts) ? accounts.accounts.length : undefined,
      accountsPreview: Array.isArray(accounts.accounts) ? accounts.accounts.slice(0, 5).map(a => ({ uuid: a.uuid, name: a.name, currency: a.currency, availableBalance: a.available_balance })) : []
    });
  } catch (err) {
    json(res, err.status || 502, { connected: true, authTest: false, error: 'Coinbase account test failed', detail: err.message, scope: session.scope, liveTradingEnabled: process.env.COINBASE_LIVE_TRADING_ENABLED === 'true' });
  }
};
