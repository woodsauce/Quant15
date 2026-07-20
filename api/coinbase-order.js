const { json, refreshIfNeeded, coinbaseApi } = require('./_coinbaseSession');

const ALLOWED_PRODUCTS = new Set(['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD']);

function safeMoney(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, 1), 1000).toFixed(2);
}

function clientOrderId(lock) {
  const raw = `edge15-${lock.symbol || 'NA'}-${lock.roundKey || Date.now()}-${lock.pick || 'NA'}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  return raw.slice(0, 64);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST required' });
  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { return json(res, 400, { ok: false, error: 'Invalid JSON body' }); }
  const mode = body.mode === 'live' ? 'live' : 'paper';
  const lock = body.lock || {};
  const symbol = String(lock.symbol || '').toUpperCase();
  const pick = String(lock.pick || '').toUpperCase();
  const productId = `${symbol}-USD`;
  const quoteSize = safeMoney(body.usdSize, '1.00');

  if (!ALLOWED_PRODUCTS.has(productId)) return json(res, 400, { ok: false, error: 'Unsupported Coinbase product', productId });
  if (pick !== 'OVER') return json(res, 200, { ok: true, mode, skipped: true, reason: 'Coinbase spot mode is OVER-only. UNDER locks are signal-only unless you add shorting/sell-owned-asset logic.', productId, pick });

  const simulated = {
    ok: true,
    mode: 'paper',
    submitted: false,
    paperOrder: true,
    product_id: productId,
    side: 'BUY',
    quote_size: quoteSize,
    client_order_id: clientOrderId(lock),
    lockSummary: { roundKey: lock.roundKey, symbol, pick, score: lock.score, window: lock.window, priceAtLock: lock.priceAtLock }
  };
  if (mode !== 'live') return json(res, 200, simulated);

  if (process.env.COINBASE_LIVE_TRADING_ENABLED !== 'true') {
    return json(res, 403, { ok: false, error: 'Live Coinbase trading is locked. Set COINBASE_LIVE_TRADING_ENABLED=true only after paper/OAuth testing.', paperEquivalent: simulated });
  }

  let session = null;
  try { session = await refreshIfNeeded(req, res); } catch (err) { return json(res, 401, { ok: false, error: 'Coinbase token refresh failed', detail: err.message }); }
  if (!session) return json(res, 401, { ok: false, error: 'Coinbase is not connected. Click Connect Coinbase first.' });

  const payload = {
    client_order_id: clientOrderId(lock),
    product_id: productId,
    side: 'BUY',
    order_configuration: {
      market_market_ioc: {
        quote_size: quoteSize
      }
    }
  };

  try {
    const data = await coinbaseApi('/api/v3/brokerage/orders', { method: 'POST', body: JSON.stringify(payload) }, session.access_token);
    json(res, 200, { ok: true, mode: 'live', submitted: true, product_id: productId, side: 'BUY', quote_size: quoteSize, response: data });
  } catch (err) {
    json(res, err.status || 502, { ok: false, error: 'Coinbase live order failed', detail: err.message, payloadPreview: { ...payload, order_configuration: payload.order_configuration } });
  }
};
