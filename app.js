const SYMBOLS = {
  BTC: { product: 'BTC-USD', label: 'Bitcoin', ideal: 85, warning: 35, decimals: 0, idealPct: 0.00135 },
  ETH: { product: 'ETH-USD', label: 'Ethereum', ideal: 7.5, warning: 3.2, decimals: 2, idealPct: 0.00175 },
  SOL: { product: 'SOL-USD', label: 'Solana', ideal: 0.62, warning: 0.24, decimals: 3, idealPct: 0.0021 },
  BNB: { product: 'BNB-USD', label: 'BNB', ideal: 2.4, warning: 0.95, decimals: 2, idealPct: 0.0017 },
  XRP: { product: 'XRP-USD', label: 'XRP', ideal: 0.0032, warning: 0.00125, decimals: 4, idealPct: 0.0025 }
};

const MODE_RULES = {
  champion: { label: 'Champion Core', t8: 99, t7: 80, t6: 70, t4: 63, fallback: 58, minPro: 0, maxShield: 100, allowEarlyTrade: false },
  proBalanced: { label: 'Pro Balanced', t8: 90, t7: 84, t6: 72, t4: 66, fallback: 60, minPro: 70, maxShield: 72, allowEarlyTrade: false },
  proConservative: { label: 'Pro Conservative', t8: 94, t7: 88, t6: 77, t4: 72, fallback: 68, minPro: 76, maxShield: 58, allowEarlyTrade: false },
  highConviction: { label: 'High-Conviction Only', t8: 95, t7: 90, t6: 82, t4: 78, fallback: 74, minPro: 82, maxShield: 45, allowEarlyTrade: false },
  earlyScout: { label: 'Early Scout', t8: 88, t7: 84, t6: 74, t4: 72, fallback: 66, minPro: 76, maxShield: 55, allowEarlyTrade: false },
  action: { label: 'Action Mode', t8: 82, t7: 72, t6: 62, t4: 55, fallback: 50, minPro: 60, maxShield: 85, allowEarlyTrade: false }
};

const STORE_KEY = 'edge15-ai-oracle-pro-v2-record';
const LOCK_KEY = 'edge15-ai-oracle-pro-v2-locks';
const MEMORY_KEY = 'edge15-ai-oracle-pro-v2-memory';
const SETTINGS_KEY = 'edge15-ai-oracle-pro-v2-settings';

const defaults = load(SETTINGS_KEY, { mode: 'proBalanced', defense: 'adaptive' });
const state = {
  mode: defaults.mode || 'proBalanced',
  defense: defaults.defense || 'adaptive',
  markets: [],
  activeLocks: load(LOCK_KEY, []),
  record: load(STORE_KEY, { wins: 0, losses: 0, skips: 0, history: [], proHistory: [] }),
  memory: load(MEMORY_KEY, {}),
  loading: false,
  lastRoundKey: '',
  abort: null
};

const els = {
  qrImage: document.getElementById('qrImage'), refreshNow: document.getElementById('refreshNow'), resetRecord: document.getElementById('resetRecord'), exportRecord: document.getElementById('exportRecord'),
  modeSelect: document.getElementById('modeSelect'), defenseSelect: document.getElementById('defenseSelect'), coinSelect: document.getElementById('coinSelect'), modePill: document.getElementById('modePill'),
  roundTimer: document.getElementById('roundTimer'), bestPick: document.getElementById('bestPick'), bestReason: document.getElementById('bestReason'), bestProScore: document.getElementById('bestProScore'), bestScore: document.getElementById('bestScore'), bestRisk: document.getElementById('bestRisk'), bestWindow: document.getElementById('bestWindow'), lockBox: document.getElementById('lockBox'),
  marketGrid: document.getElementById('marketGrid'), wins: document.getElementById('wins'), losses: document.getElementById('losses'), skips: document.getElementById('skips'), accuracy: document.getElementById('accuracy'), last10: document.getElementById('last10'), dataStatus: document.getElementById('dataStatus'), updatedAt: document.getElementById('updatedAt'), engineLabel: document.getElementById('engineLabel'), defenseLabel: document.getElementById('defenseLabel'),
  councilList: document.getElementById('councilList'), memorySummary: document.getElementById('memorySummary'), pendingList: document.getElementById('pendingList'),
  scoreStack: document.getElementById('scoreStack'), proGrade: document.getElementById('proGrade'), shieldPill: document.getElementById('shieldPill'), shieldDetails: document.getElementById('shieldDetails'), holdQuality: document.getElementById('holdQuality'), postLockMonitor: document.getElementById('postLockMonitor'), timingLab: document.getElementById('timingLab'), cleanMarketPill: document.getElementById('cleanMarketPill'), cleanMarketNotes: document.getElementById('cleanMarketNotes')
};

init();

function init() {
  els.qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=184x184&data=${encodeURIComponent(location.href)}`;
  els.modeSelect.value = state.mode;
  els.defenseSelect.value = state.defense;
  els.modeSelect.addEventListener('change', () => { state.mode = els.modeSelect.value; saveSettings(); render(); scan(); });
  els.defenseSelect.addEventListener('change', () => { state.defense = els.defenseSelect.value; saveSettings(); render(); scan(); });
  els.refreshNow.addEventListener('click', scan);
  els.exportRecord?.addEventListener('click', exportRecord);
  els.resetRecord.addEventListener('click', () => {
    if (!confirm('Reset all local record, locks, and learning memory?')) return;
    state.record = { wins: 0, losses: 0, skips: 0, history: [], proHistory: [] };
    state.activeLocks = [];
    state.memory = {};
    save(STORE_KEY, state.record); save(LOCK_KEY, state.activeLocks); save(MEMORY_KEY, state.memory); render();
  });
  setInterval(updateTimerOnly, 1000);
  setInterval(scan, 5000);
  scan();
}

function saveSettings() { save(SETTINGS_KEY, { mode: state.mode, defense: state.defense }); }

function selectedSymbols() { return Array.from(els.coinSelect.selectedOptions).map(o => o.value); }

async function scan() {
  if (state.loading) return;
  state.loading = true;
  state.abort?.abort?.();
  state.abort = new AbortController();
  els.dataStatus.textContent = 'Reading feeds...';
  try {
    const rows = await Promise.all(selectedSymbols().map(loadMarket));
    const cleanRows = rows.filter(Boolean).map(row => applyProEngine(row));
    state.markets = rankMarkets(cleanRows);
    resolvePendingLocks();
    maybeLockBest();
    render();
    els.dataStatus.textContent = 'Live';
    els.updatedAt.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error(err);
    els.dataStatus.textContent = 'Scan error';
    els.updatedAt.textContent = err.message || 'Unable to read feeds';
  } finally {
    state.loading = false;
  }
}

async function loadMarket(symbol) {
  const meta = SYMBOLS[symbol];
  if (!meta) return null;
  const [coinbase, kalshi] = await Promise.allSettled([
    fetchJson(`/api/coinbase?product=${encodeURIComponent(meta.product)}`),
    fetchJson(`/api/kalshi?symbol=${encodeURIComponent(symbol)}`)
  ]);
  const cb = coinbase.status === 'fulfilled' ? coinbase.value : null;
  const ks = kalshi.status === 'fulfilled' ? kalshi.value?.market : null;
  const price = number(cb?.price ?? cb?.stats?.last);
  const candles = Array.isArray(cb?.candles) ? cb.candles : [];
  const target = number(ks?.target);
  const closeMs = Date.parse(ks?.closeTime || ks?.expirationTime || '') || nextQuarterHour(Date.now());
  const timeRemaining = Math.max(0, closeMs - Date.now());
  const features = analyzeFeatures(symbol, price, target, candles, ks, timeRemaining);
  return { symbol, meta, coinbase: cb, kalshi: ks, price, target, closeMs, timeRemaining, ...features };
}

function analyzeFeatures(symbol, price, target, candles, market, timeRemaining) {
  const meta = SYMBOLS[symbol];
  const closes = candles.map(c => number(c.close)).filter(Number.isFinite);
  const last = closes.at(-1) ?? price;
  const c1 = candles.at(-1) || {}; const c2 = candles.at(-2) || {}; const c3 = candles.at(-3) || {}; const c5 = candles.at(-6) || candles[0] || {};
  const delta1 = pct(last - number(c2.close ?? last), last);
  const delta3 = pct(last - number(c3.close ?? last), last);
  const delta5 = pct(last - number(c5.close ?? last), last);
  const momentum = (delta1 * 0.45) + (delta3 * 0.35) + (delta5 * 0.2);
  const highs = candles.slice(-8).map(c => number(c.high)).filter(Number.isFinite);
  const lows = candles.slice(-8).map(c => number(c.low)).filter(Number.isFinite);
  const localHigh = highs.length ? Math.max(...highs) : price;
  const localLow = lows.length ? Math.min(...lows) : price;
  const range = Math.max(0.000001, localHigh - localLow);
  const rangePos = (price - localLow) / range;
  const body = Math.abs(number(c1.close) - number(c1.open));
  const candleRange = Math.max(0.000001, number(c1.high) - number(c1.low));
  const bodyRatio = body / candleRange;
  const upperWick = Math.max(0, number(c1.high) - Math.max(number(c1.open), number(c1.close))) / candleRange;
  const lowerWick = Math.max(0, Math.min(number(c1.open), number(c1.close)) - number(c1.low)) / candleRange;
  const targetDistance = Number.isFinite(price) && Number.isFinite(target) ? price - target : null;
  const absDistance = Math.abs(targetDistance ?? 0);
  const targetSide = !Number.isFinite(targetDistance) ? 'SKIP' : targetDistance >= 0 ? 'OVER' : 'UNDER';
  const recentMoves = candles.slice(-14).map((c, i, arr) => {
    if (i === 0) return NaN;
    const prev = number(arr[i - 1]?.close); const cur = number(c?.close);
    return Number.isFinite(prev) && Number.isFinite(cur) ? Math.abs(cur - prev) : NaN;
  }).filter(Number.isFinite);
  const avgAbsMove = recentMoves.length ? recentMoves.reduce((a, b) => a + b, 0) / recentMoves.length : meta.warning;
  const pctDistance = Number.isFinite(target) && Math.abs(target) > 0 ? absDistance / Math.abs(target) : 0;
  const pctUnits = meta.idealPct ? pctDistance / meta.idealPct : absDistance / meta.ideal;
  const volatilityDistance = absDistance / Math.max(avgAbsMove * 2.2, meta.warning * 0.55, 0.000001);
  const normalizedCushion = clamp((pctUnits * 0.55) + (volatilityDistance * 0.45), 0, 2.1);
  const momentumSide = momentum > 0.008 ? 'OVER' : momentum < -0.008 ? 'UNDER' : 'WAIT';
  const trendSide = rangePos > 0.66 ? 'OVER' : rangePos < 0.34 ? 'UNDER' : 'WAIT';
  const wickSide = upperWick > 0.42 && number(c1.close) < number(c1.open) ? 'UNDER' : lowerWick > 0.42 && number(c1.close) > number(c1.open) ? 'OVER' : 'WAIT';
  const oddsSide = oddsLean(market);
  const direction = chooseDirection(targetSide, momentumSide, trendSide, wickSide, oddsSide);
  const timeMin = timeRemaining / 60000;
  const rawCushionScore = clamp((absDistance / meta.ideal) * 27, 0, 27);
  const normalizedCushionScore = clamp(normalizedCushion * 14, 0, 27);
  const cushionScore = (rawCushionScore * 0.35) + (normalizedCushionScore * 0.65);
  const momentumScore = clamp(Math.abs(momentum) * 620, 0, 18);
  const bodyScore = clamp(bodyRatio * 13, 0, 13);
  const structureScore = direction === trendSide ? 8 : trendSide === 'WAIT' ? 4 : 1;
  const oddsScore = oddsSide === direction ? 5 : oddsSide === 'WAIT' ? 2.5 : 0;
  const memory = memoryBoost(symbol, direction, absDistance, timeMin);
  const settlementPenalty = settlementDanger(absDistance, meta, timeMin);
  const chopPenalty = (momentumSide === 'WAIT' ? 7 : 0) + (targetSide !== 'SKIP' && targetSide !== direction ? 8 : 0) + (bodyRatio < 0.24 ? 5 : 0);
  const wickPenalty = ((direction === 'OVER' && upperWick > 0.45) || (direction === 'UNDER' && lowerWick > 0.45)) ? 8 : 0;
  const apiPenalty = (!Number.isFinite(target) ? 20 : 0) + (!Number.isFinite(price) ? 40 : 0);
  let edgeScore = Math.round(clamp(35 + cushionScore + momentumScore + bodyScore + structureScore + oddsScore + memory - settlementPenalty - chopPenalty - wickPenalty - apiPenalty, 0, 99));
  if (direction === 'WAIT' || direction === 'SKIP') edgeScore = Math.min(edgeScore, 59);
  const selectorScore = Math.round(clamp(
    edgeScore + clamp((normalizedCushion - 1) * 8, -7, 7) +
    (direction === momentumSide ? 3 : momentumSide === 'WAIT' ? -2 : -6) +
    (direction === trendSide ? 2 : trendSide === 'WAIT' ? 0 : -4) -
    (settlementPenalty > 10 ? 4 : 0), 0, 99));
  const risk = edgeScore >= 82 && settlementPenalty < 8 ? 'Low' : edgeScore >= 68 ? 'Medium' : 'High';
  const distanceBand = distanceBandFor(symbol, absDistance);
  const status = coreLockStatus(edgeScore, timeMin);
  const reasons = buildReasons({ symbol, direction, targetSide, momentumSide, trendSide, wickSide, oddsSide, absDistance, meta, momentum, bodyRatio, settlementPenalty, edgeScore, selectorScore, normalizedCushion, pctDistance, volatilityDistance, target, price });
  const council = buildCouncil({ symbol, direction, targetSide, momentumSide, trendSide, wickSide, oddsSide, market, memory, targetDistance, meta, momentum, settlementPenalty, selectorScore, edgeScore, pctDistance, volatilityDistance });
  return { edgeScore, selectorScore, normalizedCushion, pctDistance, volatilityDistance, rawCushionScore, normalizedCushionScore, direction, risk, status, reasons, council, momentum, momentumSide, trendSide, wickSide, rangePos, bodyRatio, upperWick, lowerWick, targetDistance, absDistance, distanceBand, settlementPenalty, avgAbsMove };
}

function applyProEngine(m) {
  const layers = computeLayers(m);
  const shield = computeReversalShield(m, layers);
  const timing = computeTimingLab(m, layers, shield);
  const fingerprint = lossFingerprint(m, shield);
  const proScore = computeProScore(m, layers, shield, fingerprint);
  const proRisk = proScore >= 82 && shield.score < 38 ? 'Low' : proScore >= 70 && shield.score < 68 ? 'Medium' : 'High';
  const grade = proGrade(proScore, shield.score);
  const proStatus = proLockStatus(m, proScore, shield, timing);
  const proReasons = buildProReasons(m, layers, shield, fingerprint, proScore, proStatus);
  return { ...m, layers, shield, timing, fingerprint, proScore, proRisk, grade, proStatus, proReasons };
}

function computeLayers(m) {
  const directionGood = ['OVER', 'UNDER'].includes(m.direction);
  return {
    direction: directionGood ? clamp(m.edgeScore, 0, 100) : 25,
    distance: Math.round(clamp(m.normalizedCushion * 48, 0, 100)),
    momentum: Math.round(m.momentumSide === m.direction ? 88 : m.momentumSide === 'WAIT' ? 48 : 22),
    range: Math.round(m.trendSide === m.direction ? 84 : m.trendSide === 'WAIT' ? 56 : 25),
    reversalSafety: Math.round(clamp(100 - (m.settlementPenalty * 3) - wickAgainst(m) - (m.bodyRatio < 0.24 ? 14 : 0), 0, 100)),
    timing: timingQuality(m.timeRemaining / 60000),
    symbolReliability: symbolReliability(m.symbol),
    selector: clamp(m.selectorScore, 0, 100)
  };
}

function computeReversalShield(m, layers) {
  const timeMin = m.timeRemaining / 60000;
  const signs = [];
  let score = 0;
  const isBTC = m.symbol === 'BTC';
  const isUnder = m.direction === 'UNDER';
  if (isBTC) { score += 8; signs.push(['BTC weighting', 'BTC has produced most prior losses; require cleaner confirmation.']); }
  if (isBTC && isUnder) { score += 9; signs.push(['BTC UNDER caution', 'Recent loss cluster was mostly BTC UNDER reversing upward.']); }
  if (m.momentumSide === 'WAIT') { score += 14; signs.push(['Momentum not confirmed', 'Momentum is not strong enough yet.']); }
  else if (m.momentumSide !== m.direction) { score += 22; signs.push(['Momentum conflict', 'Momentum is fighting the selected direction.']); }
  if (m.trendSide !== 'WAIT' && m.trendSide !== m.direction) { score += 13; signs.push(['Range conflict', 'Local range position does not support the pick.']); }
  if (m.pctDistance < 0.0015) { score += 12; signs.push(['Thin cushion', `Cushion is ${(m.pctDistance * 100).toFixed(3)}%, close enough for a flip.`]); }
  if (m.settlementPenalty > 10) { score += 12; signs.push(['Settlement pressure', 'Price/time combination creates elevated flip risk.']); }
  if (m.volatilityDistance > 1.8 && m.momentumSide === 'WAIT') { score += 8; signs.push(['Stretched but stalled', 'Move is extended relative to recent movement without momentum confirmation.']); }
  if (m.edgeScore < 76) { score += 7; signs.push(['Core score borderline', `Core score is ${m.edgeScore}, below the stronger BTC confirmation zone.`]); }
  if (m.selectorScore < 80) { score += 6; signs.push(['Selector not elite', `Selector score is ${m.selectorScore}; clean early locks should rank stronger.`]); }
  const wick = wickAgainst(m);
  if (wick > 0) { score += Math.round(wick / 2); signs.push(['Wick/rejection risk', 'Latest candle wick warns of possible reversal.']); }
  if (m.bodyRatio < 0.24) { score += 7; signs.push(['Chop body', 'Small candle body suggests indecision/chop.']); }
  if (timeMin <= 4.1 && m.edgeScore < 72) { score += 8; signs.push(['Late weak backup', '4:00 backup setup is not strong enough.']); }
  const normalized = Math.round(clamp(score, 0, 100));
  const level = normalized >= 70 ? 'High' : normalized >= 45 ? 'Medium' : 'Low';
  return { score: normalized, level, signs: signs.slice(0, 7), action: shieldAction(normalized) };
}

function shieldAction(score) {
  if (score >= 70) return 'Block or choose next clean market';
  if (score >= 45) return 'Wait for confirmation / downgrade';
  return 'Allow';
}

function lossFingerprint(m, shield) {
  const family = setupKey(m.symbol, m.direction, m.absDistance, m.timeRemaining / 60000);
  const memory = state.memory[family] || { wins: 0, losses: 0 };
  const knownLossFamily = m.symbol === 'BTC' && ['BTC:UNDER:mid:t6','BTC:UNDER:far:t6','BTC:OVER:mid:t6','BTC:OVER:far:t6','BTC:UNDER:mid:t4','BTC:OVER:mid:t4'].includes(family);
  let penalty = 0;
  const notes = [];
  if (knownLossFamily) { penalty += 5; notes.push('Known BTC loss family; using soft fingerprint penalty only.'); }
  if (m.symbol === 'BTC' && m.direction === 'UNDER' && m.momentumSide === 'WAIT' && m.pctDistance < 0.0016) { penalty += 10; notes.push('Matches BTC UNDER weak-confirmation reversal fingerprint.'); }
  if (m.symbol === 'BTC' && shield.score >= 55 && m.edgeScore < 80) { penalty += 8; notes.push('BTC risk stack is elevated without elite core score.'); }
  if ((memory.losses || 0) > 0 && memory.wins < memory.losses * 5) { penalty += 5; notes.push('Local browser memory says this setup has not proven enough edge yet.'); }
  return { family, penalty: Math.round(clamp(penalty, 0, 25)), notes, memory };
}

function computeProScore(m, layers, shield, fingerprint) {
  let score = (
    layers.direction * 0.22 + layers.selector * 0.20 + layers.distance * 0.12 + layers.momentum * 0.15 + layers.range * 0.10 + layers.reversalSafety * 0.11 + layers.timing * 0.05 + layers.symbolReliability * 0.05
  );
  score -= shield.score * 0.18;
  score -= fingerprint.penalty;
  if (m.symbol !== 'BTC' && shield.score < 45 && m.selectorScore >= 72) score += 3;
  if (m.momentumSide === m.direction && m.trendSide === m.direction && m.normalizedCushion >= 1) score += 3;
  if (!['OVER', 'UNDER'].includes(m.direction)) score = Math.min(score, 50);
  return Math.round(clamp(score, 0, 99));
}

function computeTimingLab(m, layers, shield) {
  const rules = MODE_RULES[state.mode];
  const timeMin = m.timeRemaining / 60000;
  const windows = [
    { label: '8:00', range: '8:00–7:01', type: 'Shadow', eligible: m.provisionalScore >= 0, threshold: rules.t8, score: Math.round((m.selectorScore + layers.momentum + layers.reversalSafety) / 3) },
    { label: '7:00', range: '7:00–6:01', type: 'Early confirm', threshold: rules.t7, score: Math.round((m.selectorScore * .55) + (layers.momentum * .25) + (layers.reversalSafety * .20)) },
    { label: '6:00', range: '6:00–4:01', type: 'Official', threshold: rules.t6, score: m.edgeScore },
    { label: '4:00', range: '4:00–2:49', type: 'Backup', threshold: rules.t4, score: m.edgeScore }
  ];
  windows.forEach(w => {
    w.clean = w.score >= w.threshold && shield.score <= rules.maxShield && ['OVER','UNDER'].includes(m.direction);
    w.status = w.clean ? (w.type === 'Official' ? 'Official lock eligible' : w.type === 'Backup' ? 'Backup eligible' : 'Shadow pass') : 'Wait';
  });
  const active = timeMin > 7 ? '8:00 shadow' : timeMin > 6 ? '7:00 early' : timeMin > 4 ? '6:00 official' : timeMin > 2.8 ? '4:00 backup' : 'Too late';
  return { active, windows };
}

function proLockStatus(m, proScore, shield, timing) {
  const timeMin = m.timeRemaining / 60000;
  const rules = MODE_RULES[state.mode];
  if (!['OVER','UNDER'].includes(m.direction)) return 'No clear direction';
  if (state.mode !== 'champion' && state.defense !== 'off' && state.defense !== 'shadow' && shield.score > rules.maxShield) return 'Defense says wait';
  if (state.mode !== 'champion' && proScore < rules.minPro) return 'Pro score below threshold';
  if (timeMin > 8) return 'Early observe';
  if (timeMin <= 8 && timeMin > 7) return proScore >= rules.t8 + 2 ? '8:00 shadow pass' : 'Early observe';
  if (timeMin <= 7 && timeMin > 6) return proScore >= rules.t7 && rules.allowEarlyTrade ? '7:00 early lock eligible' : '7:00 shadow only';
  if (timeMin <= 6 && timeMin > 4) return proScore >= rules.t6 ? '6:00 Pro lock eligible' : 'Wait for 6:00 quality';
  if (timeMin <= 4 && timeMin > 2.8) return proScore >= rules.t4 ? '4:00 backup eligible' : 'Late watch';
  return 'Too late';
}

function rankMarkets(rows) {
  if (state.mode === 'champion') return rows.sort((a, b) => b.selectorScore - a.selectorScore || b.edgeScore - a.edgeScore);
  return rows.sort((a, b) => b.proScore - a.proScore || b.selectorScore - a.selectorScore || b.edgeScore - a.edgeScore);
}

function bestLockCandidate() {
  if (!state.markets.length) return null;
  const rules = MODE_RULES[state.mode];
  const timeMin = state.markets[0].timeRemaining / 60000;
  let threshold = Infinity; let window = '';
  if (timeMin <= 7 && timeMin > 6 && rules.allowEarlyTrade) { threshold = rules.t7; window = '7:00'; }
  else if (timeMin <= 6 && timeMin > 4) { threshold = state.mode === 'champion' ? rules.t6 : rules.t6; window = '6:00'; }
  else if (timeMin <= 4 && timeMin > 2.8) { threshold = rules.t4; window = '4:00'; }
  if (!window) return null;
  const candidates = state.markets.filter(m => {
    if (!['OVER','UNDER'].includes(m.direction)) return false;
    if (state.mode === 'champion') return m.edgeScore >= threshold;
    const shieldOk = state.defense === 'off' || state.defense === 'shadow' || m.shield.score <= rules.maxShield;
    return m.proScore >= threshold && m.proScore >= rules.minPro && shieldOk;
  });
  const chosen = candidates[0] || null;
  return chosen ? { market: chosen, window } : null;
}

function maybeLockBest() {
  if (!state.markets.length) return;
  const closeMs = state.markets[0].closeMs;
  const roundKey = getRoundKey(closeMs);
  state.lastRoundKey = roundKey;
  if (state.activeLocks.find(l => l.roundKey === roundKey && l.status === 'pending')) return;
  if (state.record.history.find(h => h.roundKey === roundKey && h.result === 'S')) return;
  const candidate = bestLockCandidate();
  if (candidate) {
    const best = candidate.market;
    const lock = {
      id: `${roundKey}-${best.symbol}-${Date.now()}`,
      roundKey, marketTicker: best.kalshi?.ticker, symbol: best.symbol, pick: best.direction,
      score: best.edgeScore, selectorScore: best.selectorScore, proScore: best.proScore, grade: best.grade, shieldScore: best.shield.score, shieldLevel: best.shield.level,
      risk: best.proRisk || best.risk, window: candidate.window, target: best.target, priceAtLock: best.price, closeMs: best.closeMs, lockedAt: Date.now(),
      reason: [...best.proReasons, ...best.reasons].slice(0, 5).join(' '), setupKey: best.fingerprint.family, engineMode: state.mode, defense: state.defense,
      layers: best.layers, shield: best.shield, status: 'pending'
    };
    state.activeLocks.unshift(lock);
    save(LOCK_KEY, state.activeLocks.slice(0, 50));
  } else if (state.markets[0].timeRemaining / 60000 <= 2.8) {
    state.record.skips += 1;
    state.record.history.unshift({ roundKey, result: 'S', symbol: 'ALL', pick: 'SKIP', ts: Date.now(), note: 'No market passed Pro lock threshold.' });
    state.record.history = state.record.history.slice(0, 400);
    save(STORE_KEY, state.record);
  }
}

async function resolvePendingLocks() {
  const pending = state.activeLocks.filter(l => l.status === 'pending' && l.marketTicker && Date.now() > l.closeMs + 35000);
  for (const lock of pending.slice(0, 5)) {
    try {
      const data = await fetchJson(`/api/kalshi-market?ticker=${encodeURIComponent(lock.marketTicker)}`);
      const m = data?.market || {};
      let outcome = null;
      if (m.result === 'yes') outcome = 'OVER';
      if (m.result === 'no') outcome = 'UNDER';
      if (!outcome && Number.isFinite(number(m.expirationValue)) && Number.isFinite(number(lock.target))) outcome = number(m.expirationValue) >= number(lock.target) ? 'OVER' : 'UNDER';
      if (outcome) markLock(lock.id, outcome === lock.pick ? 'W' : 'L', outcome, m.expirationValue ?? m.expirationValueRaw);
    } catch (err) { console.warn('Pending resolve failed', err); }
  }
}

function markLock(id, result, actual, finalValue) {
  const lock = state.activeLocks.find(l => l.id === id);
  if (!lock || lock.status !== 'pending') return;
  lock.status = result === 'W' ? 'win' : result === 'L' ? 'loss' : 'skip';
  lock.actual = actual; lock.finalValue = finalValue; lock.resolvedAt = Date.now();
  if (result === 'W') state.record.wins += 1; else if (result === 'L') state.record.losses += 1; else state.record.skips += 1;
  const row = { roundKey: lock.roundKey, result, symbol: lock.symbol, pick: lock.pick, actual, score: lock.score, selectorScore: lock.selectorScore, proScore: lock.proScore, shieldScore: lock.shieldScore, window: lock.window, ts: Date.now(), setupKey: lock.setupKey, engineMode: lock.engineMode, defense: lock.defense };
  state.record.history.unshift(row); state.record.history = state.record.history.slice(0, 400);
  state.record.proHistory = state.record.proHistory || []; state.record.proHistory.unshift(row); state.record.proHistory = state.record.proHistory.slice(0, 400);
  updateMemory(lock.setupKey, result === 'W');
  save(STORE_KEY, state.record); save(LOCK_KEY, state.activeLocks.slice(0, 50)); save(MEMORY_KEY, state.memory); render();
}

function exportRecord() {
  const payload = {
    app: 'Edge15 AI Oracle Pro', version: 'pro-v2-6min-normalized-adaptive-defense', exportedAt: new Date().toISOString(),
    selectedMode: state.mode, selectedDefense: state.defense, selectedMarkets: selectedSymbols(), officialRecord: state.record, activeLocks: state.activeLocks, learningMemory: state.memory,
    latestMarkets: state.markets.map(m => ({
      symbol: m.symbol, direction: m.direction, edgeScore: m.edgeScore, selectorScore: m.selectorScore, proScore: m.proScore, grade: m.grade, proStatus: m.proStatus,
      proRisk: m.proRisk, shieldScore: m.shield.score, shieldLevel: m.shield.level, shieldSigns: m.shield.signs, fingerprint: m.fingerprint,
      layers: m.layers, timing: m.timing, normalizedCushion: m.normalizedCushion, pctDistance: m.pctDistance, volatilityDistance: m.volatilityDistance,
      target: m.target, price: m.price, closeMs: m.closeMs, risk: m.risk, status: m.status, reasons: m.reasons, proReasons: m.proReasons
    }))
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `edge15-ai-oracle-pro-v2-export-${stamp}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}

function render() {
  const rules = MODE_RULES[state.mode];
  els.modePill.textContent = rules.label; els.engineLabel.textContent = rules.label; els.defenseLabel.textContent = defenseLabel(state.defense);
  renderRecord(); renderMarkets(); renderBest(); renderCouncil(); renderMemory(); renderPending(); renderProPanels(); renderTimingLab(); renderCleanSelector(); updateTimerOnly();
}

function renderBest() {
  const best = state.markets[0];
  const pending = state.activeLocks.find(l => l.roundKey === state.lastRoundKey && l.status === 'pending');
  els.lockBox.classList.toggle('locked', Boolean(pending)); els.lockBox.classList.toggle('waiting', !pending);
  if (pending) {
    els.bestPick.textContent = `LOCKED ${pending.symbol} ${pending.pick}`;
    els.bestReason.textContent = pending.reason || `Official ${pending.window} lock. Waiting for result.`;
    els.bestProScore.textContent = pending.proScore ?? '--'; els.bestScore.textContent = pending.score; els.bestRisk.textContent = pending.risk; els.bestWindow.textContent = pending.window; return;
  }
  if (!best) { els.bestPick.textContent = 'Scanning...'; els.bestReason.textContent = 'Waiting for live feeds.'; els.bestProScore.textContent = '--'; els.bestScore.textContent = '--'; els.bestRisk.textContent = '--'; els.bestWindow.textContent = '--'; return; }
  const word = best.direction === 'WAIT' ? 'WAIT' : best.direction === 'SKIP' ? 'SKIP' : best.direction;
  els.bestPick.textContent = `${best.symbol} ${word}`;
  els.bestReason.textContent = [...best.proReasons, ...best.reasons].slice(0, 3).join(' ');
  els.bestProScore.textContent = best.proScore; els.bestScore.textContent = best.edgeScore; els.bestRisk.textContent = best.proRisk; els.bestWindow.textContent = best.proStatus;
}

function renderMarkets() {
  els.marketGrid.innerHTML = '';
  state.markets.forEach((m, idx) => {
    const card = document.createElement('article'); card.className = `market-card ${idx === 0 ? 'best' : ''}`;
    card.innerHTML = `
      <div class="market-top"><div><h4>${m.symbol}</h4><span class="muted">${m.meta.label}</span></div><span class="rank">#${idx + 1}</span></div>
      <div class="pick-line"><span class="pick ${m.direction.toLowerCase()}">${m.direction}</span><span class="pill">${m.proScore}/100 Pro • ${m.selectorScore}/100 selector • ${m.edgeScore}/100 core</span></div>
      <div class="edge-meter"><span style="width:${m.proScore}%"></span></div>
      <div class="metrics">
        <div class="metric"><b>${formatMoney(m.price, m.meta.decimals)}</b><small>Coinbase spot</small></div><div class="metric"><b>${formatMoney(m.target, m.meta.decimals)}</b><small>Kalshi target</small></div>
        <div class="metric"><b>${formatSigned(m.targetDistance, m.meta.decimals)}</b><small>Distance</small></div><div class="metric"><b>${(m.pctDistance * 100).toFixed(3)}%</b><small>Cushion</small></div>
        <div class="metric"><b class="risk-${m.shield.level.toLowerCase()}">${m.shield.level}</b><small>Reversal shield</small></div><div class="metric"><b>${m.grade}</b><small>Grade</small></div>
        <div class="metric"><b>${m.proStatus}</b><small>Pro status</small></div><div class="metric"><b>${m.kalshi?.yesBid ?? '--'}/${m.kalshi?.yesAsk ?? '--'}</b><small>Yes bid/ask</small></div>
      </div>
      <canvas class="spark" width="420" height="92" data-symbol="${m.symbol}"></canvas>
      <div class="tag-row"><span class="tag">${m.timing.active}</span><span class="tag">${m.fingerprint.family}</span><span class="tag">Shield ${m.shield.score}</span><span class="tag">${m.proRisk} risk</span></div>
      <ul class="market-reasons">${[...m.proReasons, ...m.reasons].slice(0, 6).map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`;
    els.marketGrid.appendChild(card); drawSpark(card.querySelector('canvas'), m.coinbase?.candles || [], m.target);
  });
}

function renderProPanels() {
  const best = state.markets[0];
  if (!best) { els.scoreStack.innerHTML = '<p class="small-note">No market data yet.</p>'; els.proGrade.textContent = '--'; els.shieldPill.textContent = '--'; els.shieldDetails.innerHTML = '<p class="small-note">No shield reading yet.</p>'; els.holdQuality.textContent = '--'; els.postLockMonitor.innerHTML = '<p class="small-note">No pending lock.</p>'; return; }
  els.proGrade.textContent = best.grade;
  els.scoreStack.innerHTML = Object.entries(best.layers).map(([k, v]) => `<div class="stack-row"><label>${labelize(k)}</label><div class="bar"><span style="width:${Math.round(v)}%"></span></div><strong>${Math.round(v)}</strong></div>`).join('');
  els.shieldPill.textContent = `${best.shield.level} • ${best.shield.score}`;
  els.shieldDetails.innerHTML = best.shield.signs.length ? best.shield.signs.map(([a,b]) => `<div class="shield-item"><strong>${escapeHtml(a)}</strong><span>${escapeHtml(b)}</span></div>`).join('') : '<div class="shield-item"><strong>No major reversal stack</strong><span>Current setup is not matching the main BTC reversal warning pattern.</span></div>';
  const lock = state.activeLocks.find(l => l.status === 'pending') || null;
  const hold = lock ? holdQualityFor(lock, best) : null;
  els.holdQuality.textContent = hold ? hold.grade : best.shield.level === 'High' ? 'Watch' : 'Clean';
  els.postLockMonitor.innerHTML = hold ? hold.rows.map(r => `<div class="monitor-item"><strong>${escapeHtml(r[0])}</strong><span>${escapeHtml(r[1])}</span></div>`).join('') : `<div class="monitor-item"><strong>No active lock</strong><span>When a lock fires, this panel monitors cushion, direction conflict, and deterioration until settlement.</span></div><div class="monitor-item"><strong>Current read</strong><span>${best.symbol} ${best.direction} has shield ${best.shield.score}/100 and Pro score ${best.proScore}/100.</span></div>`;
}

function renderTimingLab() {
  const best = state.markets[0];
  if (!best) { els.timingLab.innerHTML = '<p class="small-note">No timing data yet.</p>'; return; }
  els.timingLab.innerHTML = `<table class="timing-table"><thead><tr><th>Window</th><th>Role</th><th>Score</th><th>Threshold</th><th>Status</th></tr></thead><tbody>${best.timing.windows.map(w => `<tr><td>${w.label}</td><td>${w.type}</td><td>${w.score}</td><td>${w.threshold}</td><td>${w.status}</td></tr>`).join('')}</tbody></table>`;
}

function renderCleanSelector() {
  const best = state.markets[0];
  if (!best) { els.cleanMarketPill.textContent = '--'; els.cleanMarketNotes.innerHTML = '<p class="small-note">No ranked markets yet.</p>'; return; }
  const clean = state.markets.filter(m => ['OVER','UNDER'].includes(m.direction) && (state.defense === 'off' || state.defense === 'shadow' || m.shield.score <= MODE_RULES[state.mode].maxShield)).slice(0, 4);
  els.cleanMarketPill.textContent = clean[0] ? `${clean[0].symbol} ${clean[0].direction}` : 'None';
  els.cleanMarketNotes.innerHTML = clean.map(m => `<div class="clean-market-row"><div><strong>${m.symbol} ${m.direction}</strong><span>${m.grade} • Shield ${m.shield.score} • ${m.fingerprint.family}</span></div><strong>${m.proScore}</strong></div>`).join('') || '<p class="small-note">No clean candidate passed the adaptive shield.</p>';
}

function renderCouncil() { const best = state.markets[0]; const list = best?.council || []; els.councilList.innerHTML = list.map(row => `<div class="council-row"><div><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.note)}</span></div><strong class="${row.vote.toLowerCase()}">${row.vote}</strong></div>`).join('') || '<p class="small-note">No council data yet.</p>'; }
function renderMemory() { const items = Object.entries(state.memory).map(([key, v]) => ({ key, ...v, total: v.wins + v.losses, rate: v.wins / Math.max(1, v.wins + v.losses) })).sort((a,b)=>b.total-a.total).slice(0, 8); els.memorySummary.innerHTML = items.length ? items.map(i => `<div class="memory-item"><span>${escapeHtml(i.key)}</span><strong>${Math.round(i.rate*100)}% (${i.wins}-${i.losses})</strong></div>`).join('') : '<p class="small-note">No local learned setup history yet. It adapts after completed locks.</p>'; }
function renderPending() { const pending = state.activeLocks.filter(l => l.status === 'pending').slice(0, 8); if (!pending.length) { els.pendingList.innerHTML = '<p class="small-note">No pending official locks.</p>'; return; } els.pendingList.innerHTML = pending.map(lock => `<div class="pending-item"><div><strong>${lock.symbol} ${lock.pick}</strong><span>${lock.window} • Pro ${lock.proScore ?? '--'} • Core ${lock.score} • closes ${new Date(lock.closeMs).toLocaleTimeString()}</span></div><div class="pending-actions"><button data-result="W" data-id="${lock.id}">Win</button><button data-result="L" data-id="${lock.id}">Loss</button><button data-result="S" data-id="${lock.id}">Skip</button></div></div>`).join(''); els.pendingList.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => markLock(btn.dataset.id, btn.dataset.result, 'manual', null))); }
function renderRecord() { const { wins, losses, skips, history } = state.record; els.wins.textContent = wins; els.losses.textContent = losses; els.skips.textContent = skips; const total = wins + losses; els.accuracy.textContent = total ? `${Math.round((wins / total) * 1000) / 10}%` : '--'; els.last10.innerHTML = history.slice(0,10).map(h => `<span title="${h.symbol} ${h.pick || ''}" class="dot ${h.result === 'W' ? 'win' : h.result === 'L' ? 'loss' : 'skip'}">${h.result}</span>`).join(''); }

function holdQualityFor(lock, best) {
  const same = best && best.symbol === lock.symbol;
  const rows = [];
  let score = 100;
  if (same) {
    const distanceNow = Math.abs(best.targetDistance || 0);
    const distanceThen = Math.abs((lock.priceAtLock || 0) - (lock.target || 0));
    const cushionChange = distanceThen ? (distanceNow - distanceThen) / distanceThen : 0;
    if (best.direction !== lock.pick) { score -= 36; rows.push(['Direction flip warning', `Current engine now reads ${best.direction}, while lock is ${lock.pick}.`]); }
    else rows.push(['Direction intact', `Current engine still supports ${lock.pick}.`]);
    if (cushionChange < -0.45) { score -= 22; rows.push(['Cushion shrinking', 'Distance from target has shrunk sharply since lock.']); }
    else rows.push(['Cushion check', 'Distance from target has not collapsed badly.']);
    if (best.shield.score > 65) { score -= 18; rows.push(['Shield deteriorating', `Reversal shield is now ${best.shield.score}/100.`]); }
    rows.push(['Current Pro score', `${best.proScore}/100 with ${best.proRisk} risk.`]);
  } else rows.push(['Monitoring waiting', 'Locked symbol is not currently top ranked; check its card for live deterioration.']);
  const grade = score >= 80 ? 'Strong' : score >= 60 ? 'Watch' : 'Danger';
  return { grade, rows };
}

function updateMemory(key, win) { if (!key) return; const item = state.memory[key] || { wins: 0, losses: 0 }; if (win) item.wins += 1; else item.losses += 1; state.memory[key] = item; }
function memoryBoost(symbol, direction, absDistance, timeMin) { const key = setupKey(symbol, direction, absDistance, timeMin); const item = state.memory[key]; if (!item) return 0; const total = item.wins + item.losses; if (total < 3) return 0; const rate = item.wins / total; return clamp((rate - 0.55) * 18, -8, 8); }
function setupKey(symbol, direction, absDistance, timeMin) { const d = distanceBandFor(symbol, absDistance); const t = timeMin > 6 ? 't7' : timeMin > 4 ? 't6' : 't4'; return `${symbol}:${direction}:${d}:${t}`; }
function chooseDirection(...votes) { let over = 0, under = 0; votes.forEach((vote, idx) => { const weight = idx === 0 ? 2.2 : idx === 1 ? 1.45 : idx === 2 ? 1.0 : idx === 3 ? 1.15 : .65; if (vote === 'OVER') over += weight; if (vote === 'UNDER') under += weight; }); if (over - under > 0.8) return 'OVER'; if (under - over > 0.8) return 'UNDER'; return 'WAIT'; }
function oddsLean(market) { if (!market) return 'WAIT'; const yes = number(market.yesAsk ?? market.lastPrice); const no = number(market.noAsk); if (Number.isFinite(yes) && Number.isFinite(no)) { if (yes <= 42 && no >= 58) return 'OVER'; if (no <= 42 && yes >= 58) return 'UNDER'; } if (Number.isFinite(yes)) { if (yes >= 62) return 'OVER'; if (yes <= 38) return 'UNDER'; } return 'WAIT'; }
function oddsText(market) { const parts = []; if (Number.isFinite(number(market.yesBid)) || Number.isFinite(number(market.yesAsk))) parts.push(`Yes ${market.yesBid ?? '--'}/${market.yesAsk ?? '--'}`); if (Number.isFinite(number(market.noBid)) || Number.isFinite(number(market.noAsk))) parts.push(`No ${market.noBid ?? '--'}/${market.noAsk ?? '--'}`); return parts.join(' • ') || 'Odds unavailable'; }
function distanceBandFor(symbol, absDistance) { const meta = SYMBOLS[symbol]; if (!meta || !Number.isFinite(absDistance)) return 'unknown'; if (absDistance > meta.ideal) return 'far'; if (absDistance > meta.warning) return 'mid'; return 'close'; }
function settlementDanger(absDistance, meta, timeMin) { if (!Number.isFinite(absDistance)) return 20; const closeness = clamp(1 - absDistance / meta.warning, 0, 1); const timePressure = timeMin < 5 ? (5 - timeMin) / 5 : 0; return clamp(closeness * 15 + timePressure * 8, 0, 22); }
function coreLockStatus(score, timeMin) { const rules = MODE_RULES.champion; if (timeMin > 7) return score >= rules.t7 + 8 ? 'Elite early watch' : 'Observe'; if (timeMin <= 7 && timeMin > 6) return score >= rules.t7 ? '7:00 elite eligible' : 'Wait'; if (timeMin <= 6 && timeMin > 4) return score >= rules.t6 ? '6:00 main eligible' : 'Wait'; if (timeMin <= 4 && timeMin > 2.8) return score >= rules.t4 ? '4:00 backup eligible' : 'Late watch'; if (timeMin <= 2.8) return score >= rules.t7 ? 'Emergency only' : 'Too late'; return 'Wait'; }
function timingQuality(timeMin) { if (timeMin <= 6 && timeMin > 4) return 92; if (timeMin <= 7 && timeMin > 6) return 78; if (timeMin <= 4 && timeMin > 2.8) return 70; if (timeMin <= 8 && timeMin > 7) return 62; return 40; }
function symbolReliability(symbol) { return ({ BTC: 70, ETH: 76, SOL: 72, BNB: 78, XRP: 74 }[symbol] || 70); }
function wickAgainst(m) { if (m.direction === 'OVER' && m.upperWick > 0.45) return 16; if (m.direction === 'UNDER' && m.lowerWick > 0.45) return 16; return 0; }
function proGrade(score, shieldScore) { if (shieldScore >= 70) return 'DANGER'; if (score >= 88) return 'A+'; if (score >= 82) return 'A'; if (score >= 76) return 'B+'; if (score >= 70) return 'B'; if (score >= 63) return 'C'; return 'WAIT'; }
function defenseLabel(v) { return ({ adaptive: 'Adaptive', balanced: 'Balanced', shadow: 'Shadow', off: 'Off' }[v] || v); }
function labelize(k) { return String(k).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }

function buildReasons(input) {
  const { direction, targetSide, momentumSide, trendSide, wickSide, oddsSide, absDistance, meta, momentum, bodyRatio, settlementPenalty, edgeScore, selectorScore, normalizedCushion, pctDistance, volatilityDistance, target, price } = input;
  const reasons = [];
  if (!Number.isFinite(price)) reasons.push('Coinbase price feed unavailable.');
  if (!Number.isFinite(target)) reasons.push('Kalshi target not detected yet; app will keep scanning.');
  if (Number.isFinite(target)) reasons.push(`${direction} lean: price is ${format(absDistance, meta.decimals)} away from Kalshi target.`);
  if (Number.isFinite(normalizedCushion)) reasons.push(`Normalized selector: ${(pctDistance * 100).toFixed(3)}% cushion, ${volatilityDistance.toFixed(2)}x recent move, selector ${selectorScore}.`);
  if (momentumSide === direction) reasons.push('Momentum agrees with the target-side read.'); else if (momentumSide === 'WAIT') reasons.push('Momentum is not strong yet.'); else reasons.push('Momentum is fighting the target-side read.');
  if (trendSide === direction) reasons.push('Local range position supports the pick.');
  if (wickSide !== 'WAIT') reasons.push(`${wickSide} wick/rejection signal detected.`);
  if (oddsSide === direction) reasons.push('Kalshi pricing agrees with the chart lean.');
  if (settlementPenalty > 10) reasons.push('Settlement/flip risk is elevated because price is close to target or time is late.');
  if (bodyRatio < 0.24) reasons.push('Small candle bodies suggest chop; confidence reduced.');
  if (edgeScore >= 80) reasons.push('Strong enough for higher-confidence timing if defense agrees.');
  return reasons.slice(0, 6);
}
function buildProReasons(m, layers, shield, fingerprint, proScore, proStatus) { const reasons = []; reasons.push(`Pro v2 score ${proScore}/100: ${proStatus}.`); if (shield.level === 'High') reasons.push(`Adaptive shield warning: ${shield.action}.`); else if (shield.level === 'Medium') reasons.push('Adaptive shield says confirm before trusting this setup fully.'); else reasons.push('Adaptive shield has no major reversal stack.'); if (fingerprint.notes.length) reasons.push(fingerprint.notes[0]); if (m.symbol !== 'BTC' && m.proScore >= 70) reasons.push('Next-clean-market selector allows this non-BTC setup to outrank borderline BTC.'); if (m.timing?.active) reasons.push(`Timing layer: ${m.timing.active}.`); return reasons.slice(0, 5); }
function buildCouncil(x) { return [
  { name: 'Champion Core', vote: x.targetSide, note: Number.isFinite(x.targetDistance) ? `${formatSigned(x.targetDistance, x.meta.decimals)} from target` : 'No target yet' },
  { name: 'Momentum Hunter', vote: x.momentumSide, note: `${(x.momentum * 100).toFixed(3)}% weighted move` },
  { name: 'Reversal Detector', vote: x.wickSide, note: x.wickSide === 'WAIT' ? 'No major wick reversal' : 'Wick rejection detected' },
  { name: 'Settlement Guard', vote: x.settlementPenalty > 12 ? 'SKIP' : x.direction, note: `Settlement risk ${Math.round(x.settlementPenalty)}/20` },
  { name: 'Kalshi Odds Reader', vote: x.oddsSide, note: x.market ? oddsText(x.market) : 'No odds data' },
  { name: 'Historical Match', vote: x.memory > 0 ? x.direction : 'WAIT', note: `${x.memory >= 0 ? '+' : ''}${x.memory.toFixed(1)} memory boost` },
  { name: 'Normalized Selector', vote: x.selectorScore >= x.edgeScore ? x.direction : 'WAIT', note: `${x.selectorScore}/100 selector • ${(x.pctDistance * 100).toFixed(3)}% cushion • ${x.volatilityDistance.toFixed(2)}x move` }
]; }

function updateTimerOnly() { const closeMs = state.markets[0]?.closeMs || nextQuarterHour(Date.now()); els.roundTimer.textContent = formatTime(Math.max(0, closeMs - Date.now())); }
function drawSpark(canvas, candles, target) { if (!canvas || !candles.length) return; const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height; ctx.clearRect(0,0,w,h); const values = candles.slice(-40).map(c => c.close).filter(Number.isFinite); if (!values.length) return; const min = Math.min(...values, Number.isFinite(target) ? target : Infinity); const max = Math.max(...values, Number.isFinite(target) ? target : -Infinity); const pad = Math.max((max-min)*.12, 0.000001); const y = v => h - ((v - (min-pad)) / ((max+pad)-(min-pad))) * h; ctx.lineWidth=3; ctx.strokeStyle='#66a6ff'; ctx.beginPath(); values.forEach((v,i)=>{ const x=(i/Math.max(1,values.length-1))*w; if(i===0) ctx.moveTo(x,y(v)); else ctx.lineTo(x,y(v)); }); ctx.stroke(); if (Number.isFinite(target)) { ctx.setLineDash([8,7]); ctx.strokeStyle='#ffd166'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,y(target)); ctx.lineTo(w,y(target)); ctx.stroke(); ctx.setLineDash([]); } }
async function fetchJson(url) { const res = await fetch(url, { cache:'no-store', signal: state.abort?.signal }); if (!res.ok) throw new Error(`${url} failed: ${res.status}`); return res.json(); }
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function number(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function clamp(v,min,max) { return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)); }
function pct(delta, base) { return Number.isFinite(delta) && Number.isFinite(base) && base ? delta / base : 0; }
function nextQuarterHour(ms) { const d = new Date(ms); d.setSeconds(0,0); const m = d.getMinutes(); d.setMinutes(Math.floor(m/15)*15 + 15); return d.getTime(); }
function getRoundKey(closeMs) { return new Date(closeMs).toISOString().slice(0,16); }
function formatTime(ms) { const s = Math.ceil(ms/1000); const m = Math.floor(s/60); const r = String(s%60).padStart(2,'0'); return `${m}:${r}`; }
function format(v, decimals=2) { return Number.isFinite(number(v)) ? number(v).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals > 0 ? Math.min(decimals,2) : 0 }) : '--'; }
function formatMoney(v, decimals=2) { return Number.isFinite(number(v)) ? `$${format(v, decimals)}` : '--'; }
function formatSigned(v, decimals=2) { if (!Number.isFinite(number(v))) return '--'; const n = number(v); return `${n >= 0 ? '+' : ''}${format(n, decimals)}`; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
