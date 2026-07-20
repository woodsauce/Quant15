# Super Easy Coinbase Setup

## Step 1 — Deploy

Upload this zip to Vercel.

If Vercel asks for settings:

```txt
Framework Preset: Other
Build Command: npm run build
Output Directory: .
Install Command: npm install --ignore-scripts
Node.js Version: 24.x
```

## Step 2 — Open the app

Open your Vercel app URL.

Find:

```txt
Easy Coinbase setup
```

Open:

```txt
One-time setup helper
```

## Step 3 — Create Coinbase key

Create a Coinbase Advanced Trade / CDP API key with:

```txt
View: ON
Trade: ON
Transfer: OFF
```

Copy:

```txt
API key name
Private key
```

## Step 4 — Use the setup helper

Paste the API key name and private key into the helper.

Click:

```txt
Prepare Vercel values
```

Copy the generated values.

Do not paste the key into chat.

## Step 5 — Add to Vercel

Add these environment variables:

```txt
COINBASE_API_KEY_NAME
COINBASE_PRIVATE_KEY_B64
COINBASE_LIVE_TRADING_ENABLED=false
```

Redeploy.

## Step 6 — Test

Click:

```txt
Test Coinbase Key
```

Good result:

```txt
Coinbase key works
```

## Step 7 — Paper mode

Set:

```txt
Coinbase order mode: Paper signal — no real order
USD per OVER lock: 1
```

Wait for an OVER lock.

## Step 8 — Live later

Only after paper works, change Vercel env:

```txt
COINBASE_LIVE_TRADING_ENABLED=true
```

Redeploy.

Then use:

```txt
Coinbase order mode: Live spot buy
USD per OVER lock: 1
```
