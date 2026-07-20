# Edge15 AI Oracle v1 — Coinbase OAuth Spot Trader

This build keeps the **Edge15 AI Oracle v1 — 6 Minute Lock + Normalized Selector** prediction engine and adds an optional **Coinbase OAuth spot-trading panel**.

## What changed

- Added a **Connect Coinbase** button using Coinbase OAuth2.
- Added Coinbase status/test/disconnect controls.
- Added an OVER-only spot signal trader.
- Added paper mode so the app can log Coinbase signals without placing real orders.
- Added a server-side live-trading lock: live orders are blocked unless `COINBASE_LIVE_TRADING_ENABLED=true` is set in Vercel.
- Added encrypted, HttpOnly browser-session token storage for OAuth tokens.
- Added PKCE + state validation for the OAuth redirect flow.
- Added XRP to the Coinbase public feed allowlist.
- Pinned Node to `20.x`.

## Important trading behavior

This is **not** a Kalshi prediction-contract trader.

Coinbase spot mode works like this:

```text
Oracle locks OVER  -> Coinbase spot BUY
Oracle locks UNDER -> signal-only skip
```

UNDER is not automatically traded because regular Coinbase spot buying cannot profit from price going down unless you already own the asset, add sell-owned-asset logic, or add a short/derivatives system later.

## Required Vercel environment variables

Add these in Vercel project settings:

```text
COINBASE_OAUTH_CLIENT_ID
COINBASE_OAUTH_CLIENT_SECRET
OAUTH_SESSION_SECRET
PUBLIC_APP_URL
COINBASE_OAUTH_REDIRECT_URI
COINBASE_OAUTH_SCOPES
COINBASE_LIVE_TRADING_ENABLED
```

Recommended values:

```text
PUBLIC_APP_URL=https://YOUR-VERCEL-APP.vercel.app
COINBASE_OAUTH_REDIRECT_URI=https://YOUR-VERCEL-APP.vercel.app/api/coinbase-oauth-callback
COINBASE_OAUTH_SCOPES=wallet:accounts:read wallet:trades:create wallet:trades:read offline_access
COINBASE_LIVE_TRADING_ENABLED=false
```

`OAUTH_SESSION_SECRET` should be a long random string. Example PowerShell command:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Coinbase developer setup

1. Go to the Coinbase Developer Platform.
2. Register a new Coinbase OAuth2 application.
3. Add your redirect URL:

```text
https://YOUR-VERCEL-APP.vercel.app/api/coinbase-oauth-callback
```

4. Request the scopes you intend to use:

```text
wallet:accounts:read
wallet:trades:create
wallet:trades:read
offline_access
```

5. Copy the OAuth client ID and client secret into Vercel.
6. Redeploy after saving environment variables.

## First safe test

1. Deploy the app.
2. Set `COINBASE_LIVE_TRADING_ENABLED=false`.
3. Open the app and click **Connect Coinbase**.
4. Approve the Coinbase OAuth request.
5. Click **Test Coinbase**.
6. Set Coinbase order mode to **Paper signal — no real order**.
7. Wait for an Oracle OVER lock.
8. Confirm the Coinbase event log shows a paper BUY signal.

## Live trading unlock

Only after paper mode works:

1. Keep USD size at `$1`.
2. Set Coinbase mode in the UI to **Live spot buy**.
3. In Vercel, set:

```text
COINBASE_LIVE_TRADING_ENABLED=true
```

4. Redeploy.
5. Wait for one OVER lock.
6. Confirm the order inside Coinbase.
7. Turn live mode back off until logs are reviewed.

## Files added

```text
api/_coinbaseSession.js
api/coinbase-oauth-start.js
api/coinbase-oauth-callback.js
api/coinbase-oauth-status.js
api/coinbase-oauth-disconnect.js
api/coinbase-order.js
```

## Safety notes

- No Coinbase private key is pasted into the frontend.
- OAuth tokens are stored in an encrypted HttpOnly cookie.
- Live trading is blocked unless the server env explicitly unlocks it.
- Only OVER locks can create spot buys in this first version.
- Browser-based scanning still requires the app page to remain open. A true 24/7 bot still needs an always-on worker.
