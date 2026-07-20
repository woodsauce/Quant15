const { json, missingEnv, buildJwt, coinbaseRequest, inspectKey } = require('./_coinbaseKeyAuth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });

  const missing = missingEnv();
  const liveUnlocked = process.env.COINBASE_LIVE_TRADING_ENABLED === 'true';
  const inspection = inspectKey();

  if (missing.length) {
    return json(res, 200, {
      ok: false,
      connected: false,
      authTest: false,
      liveTradingEnabled: liveUnlocked,
      missingEnv: missing,
      ...inspection,
      nextStep: 'Add the missing environment variables in Vercel, then redeploy.'
    });
  }

  let jwtCreated = false;
  try {
    buildJwt('GET', '/api/v3/brokerage/key_permissions');
    jwtCreated = true;
  } catch (err) {
    return json(res, 200, {
      ok: false,
      connected: false,
      authTest: false,
      jwtCreated: false,
      liveTradingEnabled: liveUnlocked,
      ...inspection,
      error: 'Coinbase JWT signing failed',
      detail: err.message
    });
  }

  try {
    const permissions = await coinbaseRequest('/api/v3/brokerage/key_permissions', { method: 'GET' });
    return json(res, 200, {
      ok: true,
      connected: true,
      authTest: true,
      jwtCreated,
      liveTradingEnabled: liveUnlocked,
      ...inspection,
      permissions,
      canView: permissions?.can_view,
      canTrade: permissions?.can_trade,
      portfolioUuid: permissions?.portfolio_uuid || null,
      message: 'Coinbase API key connected.'
    });
  } catch (err) {
    return json(res, err.status || 200, {
      ok: false,
      connected: false,
      authTest: false,
      jwtCreated,
      liveTradingEnabled: liveUnlocked,
      ...inspection,
      error: 'Coinbase auth request failed',
      detail: err.message,
      response: err.data || null
    });
  }
};
