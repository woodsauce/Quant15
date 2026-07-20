# Edge15 AI Oracle v1 — Coinbase Simple Key Trader

This build keeps the Edge15 AI Oracle v1 — 6 Minute Lock + Normalized Selector logic and adds the easiest Coinbase spot-trading path I can safely build:

- No Coinbase OAuth login
- No redirect URL
- No session secret
- Coinbase API-key mode only
- Built-in setup helper to generate Vercel env values
- Coinbase key test button
- Paper mode first
- Live trading locked server-side until explicitly enabled
- OVER-only spot buys
- UNDER locks stay signal-only

## Important

Coinbase spot trading is not the same as Kalshi prediction-contract trading.

- OVER lock = buy spot crypto on Coinbase
- UNDER lock = signal-only by default

Do not enable live trading until paper mode and the Coinbase key test work.

## Vercel setup

Deploy the zip to Vercel. Then open the dashboard and expand **One-time setup helper**.

The helper will generate these Vercel environment variables:

```txt
COINBASE_API_KEY_NAME=organizations/.../apiKeys/...
COINBASE_PRIVATE_KEY_B64=...
COINBASE_LIVE_TRADING_ENABLED=false
```

Add them in Vercel:

```txt
Project → Settings → Environment Variables
```

Then redeploy.

## Testing

1. Open the dashboard.
2. Click **Test Coinbase Key**.
3. Leave `COINBASE_LIVE_TRADING_ENABLED=false`.
4. Set Coinbase order mode to **Paper signal — no real order**.
5. Wait for an OVER lock.
6. Confirm the paper buy signal appears in the Coinbase event log.

## Live mode

Only after successful testing:

```txt
COINBASE_LIVE_TRADING_ENABLED=true
```

Recommended first live settings:

```txt
Mode: Live spot buy
USD per OVER lock: 1
Max open behavior: one lock at a time by client order ID
UNDER locks: signal-only
```
