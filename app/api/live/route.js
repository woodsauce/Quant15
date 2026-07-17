import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const COINS = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'ether', 'eth'],
  SOL: ['solana', 'sol'],
  XRP: ['xrp', 'ripple'],
};
const SERIES = { BTC: 'KXBTC15M', ETH: 'KXETH15M', SOL: 'KXSOL15M', XRP: 'KXXRP15M' };
const KALSHI_BASE = 'https://external-api.kalshi.com/trade-api/v2';
const CACHE_MS = 2500;
let responseCache = { at: 0, value: null };

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { return JSON.parse(value); } catch { return []; }
}
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function unix(value) {
  const n = number(value);
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}
function coinOf(text = '') {
  const input = String(text).toLowerCase();
  for (const [coin, words] of Object.entries(COINS)) {
    if (words.some((word) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, 'i').test(input))) return coin;
  }
  return null;
}
function looks15Minute(text = '', start, end) {
  const input = String(text).toLowerCase();
  if (/15\s*[- ]?\s*(minute|min)\b|\b15m\b|up\s*or\s*down/.test(input)) return true;
  const startMs = new Date(start || 0).getTime();
  const endMs = new Date(end || 0).getTime();
  const duration = (endMs - startMs) / 60000;
  return Number.isFinite(duration) && duration >= 10 && duration <= 20;
}
function marketProbability(market) {
  const outcomes = asArray(market.outcomes);
  const prices = asArray(market.outcomePrices).map(Number);
  let index = outcomes.findIndex((x) => /^(yes|up|higher|above)$/i.test(String(x)));
  if (index < 0) index = 0;
  return prices[index];
}
function tradeDirection(trade) {
  const outcome = String(trade.outcome || '').trim();
  const side = String(trade.side || 'BUY').toUpperCase();
  if (side === 'SELL') {
    if (/^(yes|up|higher|above)$/i.test(outcome)) return 'DOWN';
    if (/^(no|down|lower|below)$/i.test(outcome)) return 'UP';
  }
  if (/^(yes|up|higher|above)$/i.test(outcome)) return 'UP';
  if (/^(no|down|lower|below)$/i.test(outcome)) return 'DOWN';
  return outcome || side;
}
function withTimeout(url, timeout = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json', 'User-Agent': 'Quanta15/2.0' },
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }).finally(() => clearTimeout(timer));
}
async function safeGet(url, fallback = null, timeout = 9000) {
  try { return await withTimeout(url, timeout); } catch { return fallback; }
}

async function polymarketMarkets(health) {
  try {
    const pages = await Promise.all([0, 200, 400].map((offset) =>
      withTimeout(`https://gamma-api.polymarket.com/events?active=true&closed=false&limit=200&offset=${offset}`)
    ));
    const events = pages.flatMap((page) => Array.isArray(page) ? page : []);
    const now = Date.now();
    const output = [];
    for (const event of events) {
      for (const market of event.markets || []) {
        const text = `${event.title || ''} ${event.slug || ''} ${market.question || ''} ${market.slug || ''}`;
        const coin = coinOf(text);
        if (!coin || !looks15Minute(text, market.startDate || event.startDate, market.endDate || event.endDate)) continue;
        const end = market.endDate || event.endDate;
        const endMs = new Date(end).getTime();
        if (!end || endMs < now - 120000 || endMs > now + 5400000) continue;
        const yes = marketProbability(market);
        if (!Number.isFinite(yes)) continue;
        output.push({
          source: 'Polymarket',
          id: market.conditionId || market.id,
          conditionId: market.conditionId || '',
          coin,
          title: market.question || event.title,
          end,
          yes,
          liquidity: number(market.liquidityNum ?? market.liquidity),
          volume: number(market.volumeNum ?? market.volume),
          url: `https://polymarket.com/event/${event.slug || market.slug}`,
        });
      }
    }
    health.polymarket = { ok: true, detail: `${output.length} active 15-minute markets` };
    return output;
  } catch (error) {
    health.polymarket = { ok: false, detail: error.message };
    return [];
  }
}

async function kalshiMarkets(health) {
  const output = [];
  let reached = 0;
  await Promise.all(Object.entries(SERIES).map(async ([coin, series]) => {
    const json = await safeGet(`${KALSHI_BASE}/markets?status=open&limit=100&series_ticker=${series}`);
    if (!json) return;
    reached += 1;
    for (const market of json.markets || []) {
      const end = market.close_time || market.expiration_time;
      const endMs = new Date(end).getTime();
      if (!end || endMs < Date.now() - 120000 || endMs > Date.now() + 5400000) continue;
      let yes = number(market.yes_ask_dollars ?? market.last_price_dollars ?? market.yes_ask ?? market.last_price, NaN);
      if (yes > 1) yes /= 100;
      if (!Number.isFinite(yes)) continue;
      output.push({
        source: 'Kalshi',
        id: market.ticker,
        coin,
        title: market.title || market.subtitle || market.ticker,
        end,
        yes,
        liquidity: number(market.liquidity_dollars ?? market.liquidity),
        volume: number(market.volume),
        url: `https://kalshi.com/markets/${String(market.event_ticker || market.ticker).toLowerCase()}`,
      });
    }
  }));
  health.kalshi = { ok: reached > 0, detail: `${output.length} active markets · ${reached}/4 series reached` };
  return output;
}

async function coinbaseSpots(health) {
  const output = {};
  let reached = 0;
  await Promise.all(Object.keys(COINS).map(async (coin) => {
    const json = await safeGet(`https://api.exchange.coinbase.com/products/${coin}-USD/ticker`);
    if (!json) return;
    output[coin] = number(json.price);
    reached += 1;
  }));
  health.coinbase = { ok: reached > 0, detail: `${reached}/4 spot feeds reached` };
  return output;
}

function findMarketForTrade(trade, markets) {
  const conditionId = String(trade.conditionId || trade.market || '');
  const exact = markets.find((market) => market.conditionId && market.conditionId === conditionId);
  if (exact) return exact;
  const text = `${trade.title || ''} ${trade.slug || ''} ${trade.eventSlug || ''}`;
  const coin = coinOf(text);
  if (!coin || !looks15Minute(text)) return null;
  return markets.find((market) => market.coin === coin) || {
    source: 'Polymarket', conditionId, coin, title: trade.title || `${coin} 15-minute market`,
    liquidity: 0, url: trade.eventSlug ? `https://polymarket.com/event/${trade.eventSlug}` : 'https://polymarket.com/markets/crypto',
  };
}

function scoreTrade(trade, leader, market, maxAgeSeconds = 86400) {
  const timestamp = unix(trade.timestamp);
  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  const price = number(trade.price);
  const sizeUnits = number(trade.size);
  const notional = sizeUnits * price;
  const freshness = Math.max(0, 1 - ageSeconds / maxAgeSeconds);
  const sizeScore = Math.min(1, notional / 10000);
  const pnl = number(leader?.pnl);
  const volume = Math.max(1, number(leader?.vol));
  const efficiency = Math.min(1, Math.max(0, pnl / volume * 10));
  const liquidity = Math.min(1, number(market?.liquidity) / 25000);
  return Math.round(100 * (0.36 * freshness + 0.30 * sizeScore + 0.22 * efficiency + 0.12 * liquidity));
}

function normalizeSignal(trade, leader, market, sourceType = 'Top Wallet') {
  const timestamp = unix(trade.timestamp);
  const price = number(trade.price);
  const size = number(trade.size);
  return {
    coin: market.coin,
    conditionId: market.conditionId || String(trade.conditionId || trade.market || ''),
    title: trade.title || market.title,
    outcome: tradeDirection(trade),
    rawOutcome: trade.outcome || '',
    side: String(trade.side || 'BUY').toUpperCase(),
    price,
    size,
    notional: size * price,
    timestamp,
    score: scoreTrade(trade, leader, market),
    wallet: leader?.proxyWallet || trade.proxyWallet || trade.user || '',
    trader: leader?.userName || trade.name || trade.pseudonym || `${String(leader?.proxyWallet || trade.proxyWallet || 'Wallet').slice(0, 8)}…`,
    rank: number(leader?.rank),
    traderPnl: number(leader?.pnl),
    url: market.url,
    sourceType,
  };
}

async function walletIntelligence(polyMarkets, health) {
  const leaderboard = await safeGet('https://data-api.polymarket.com/v1/leaderboard?timePeriod=WEEK&category=OVERALL&orderBy=PNL&limit=20');
  const leaders = Array.isArray(leaderboard) ? leaderboard : [];
  const signals = [];
  let walletsReached = 0;

  await Promise.all(leaders.slice(0, 12).map(async (leader) => {
    const wallet = leader.proxyWallet;
    if (!wallet) return;
    const trades = await safeGet(`https://data-api.polymarket.com/trades?user=${wallet}&limit=200&takerOnly=true`, []);
    if (!Array.isArray(trades)) return;
    walletsReached += 1;
    for (const trade of trades) {
      const timestamp = unix(trade.timestamp);
      if (!timestamp || Date.now() / 1000 - timestamp > 86400) continue;
      const market = findMarketForTrade(trade, polyMarkets);
      if (!market) continue;
      signals.push(normalizeSignal(trade, leader, market));
    }
  }));

  const globalTrades = await safeGet('https://data-api.polymarket.com/trades?limit=500&takerOnly=true', []);
  const whales = [];
  if (Array.isArray(globalTrades)) {
    for (const trade of globalTrades) {
      const timestamp = unix(trade.timestamp);
      if (!timestamp || Date.now() / 1000 - timestamp > 21600) continue;
      const market = findMarketForTrade(trade, polyMarkets);
      if (!market) continue;
      const signal = normalizeSignal(trade, null, market, 'Large Trade');
      signal.score = Math.max(signal.score, Math.min(95, Math.round(45 + signal.notional / 500)));
      if (signal.notional >= 1000) whales.push(signal);
    }
  }

  const dedupe = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.wallet}|${item.conditionId}|${item.timestamp}|${item.side}|${item.price}|${item.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const cleanSignals = dedupe(signals).sort((a, b) => b.score - a.score || b.timestamp - a.timestamp).slice(0, 150);
  const cleanWhales = dedupe(whales).sort((a, b) => b.notional - a.notional || b.timestamp - a.timestamp).slice(0, 100);
  health.wallets = {
    ok: leaders.length > 0 || cleanWhales.length > 0,
    detail: `${leaders.length} leaders · ${walletsReached} wallets reached · ${cleanSignals.length} signals · ${cleanWhales.length} large trades`,
  };
  return { signals: cleanSignals, whales: cleanWhales };
}

function consensusFrom(signals) {
  const groups = new Map();
  for (const signal of signals) {
    const direction = signal.outcome || signal.rawOutcome || signal.side;
    const marketKey = signal.conditionId || `${signal.coin}|${signal.title}`;
    const key = `${marketKey}|${direction}`;
    const group = groups.get(key) || { ...signal, wallets: new Set(), total: 0, latest: 0, scores: [] };
    group.wallets.add(signal.wallet || signal.trader);
    group.total += signal.notional;
    group.latest = Math.max(group.latest, signal.timestamp);
    group.scores.push(signal.score);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    walletCount: group.wallets.size,
    total: group.total,
    timestamp: group.latest,
    score: Math.round(group.scores.reduce((a, b) => a + b, 0) / group.scores.length),
    wallets: undefined,
    scores: undefined,
  })).filter((group) => group.walletCount >= 2).sort((a, b) => b.walletCount - a.walletCount || b.total - a.total).slice(0, 50);
}

function compareMarkets(polyMarkets, kalshiMarkets) {
  const output = [];
  for (const poly of polyMarkets) {
    const candidates = kalshiMarkets.filter((market) => market.coin === poly.coin);
    if (!candidates.length) continue;
    const kalshi = candidates.sort((a, b) => Math.abs(new Date(a.end) - new Date(poly.end)) - Math.abs(new Date(b.end) - new Date(poly.end)))[0];
    const difference = Math.abs(new Date(kalshi.end) - new Date(poly.end));
    if (difference > 300000) continue;
    const gap = Math.abs(poly.yes - kalshi.yes) * 100;
    output.push({
      coin: poly.coin,
      title: poly.title,
      end: poly.end,
      polyYes: poly.yes,
      kalshiYes: kalshi.yes,
      gap,
      cheaper: poly.yes < kalshi.yes ? 'Polymarket' : 'Kalshi',
    });
  }
  return output.sort((a, b) => b.gap - a.gap);
}

export async function GET() {
  if (responseCache.value && Date.now() - responseCache.at < CACHE_MS) {
    return NextResponse.json(responseCache.value, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  const health = {};
  const [polyMarkets, kalshiMarketsData, spots] = await Promise.all([
    polymarketMarkets(health),
    kalshiMarkets(health),
    coinbaseSpots(health),
  ]);
  const intelligence = await walletIntelligence(polyMarkets, health);
  const value = {
    generatedAt: new Date().toISOString(),
    markets: [...polyMarkets, ...kalshiMarketsData].sort((a, b) => new Date(a.end) - new Date(b.end)),
    signals: intelligence.signals,
    whales: intelligence.whales,
    consensus: consensusFrom(intelligence.signals),
    comparisons: compareMarkets(polyMarkets, kalshiMarketsData),
    spots,
    health,
  };
  responseCache = { at: Date.now(), value };
  return NextResponse.json(value, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
