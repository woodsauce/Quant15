# Edge15 AI Oracle Pro v2

**6-Minute Lock + Normalized Selector + Adaptive Defense Engine**

This is the professional next-generation version of **Edge15 AI Oracle v1 — 6 Minute Lock + Normalized Selector**.

## What stayed protected

The original champion core is still available as a selectable mode:

- 6:00 official lock engine
- 4:00 backup lock window
- normalized multi-coin selector
- BTC / ETH / SOL / BNB / XRP scanning
- local browser record keeping
- exportable JSON history
- QR phone link
- manual result correction buttons

## What is new in Pro v2

### 1. Champion Core mode
Runs the original v1 normalized selector behavior as closely as possible.

### 2. Pro Balanced mode
The new default. It keeps the 6-minute champion core but adds:

- Pro Score
- Adaptive BTC Reversal Shield
- next-clean-market selector
- timing quality layer
- loss-fingerprint penalty
- post-lock danger monitor

### 3. Adaptive BTC Reversal Shield
This is not a blunt BTC ban. It looks for the conditions inside the prior losses:

- BTC UNDER reversal risk
- weak or missing momentum confirmation
- thin cushion near target
- high settlement/flip pressure
- stalled extended move
- weak selector/core score
- wick/rejection risk
- chop candles

It can allow clean BTC setups while downgrading or skipping dangerous BTC setups.

### 4. Next-clean-market selector
If BTC is top-ranked but has a bad reversal stack, the engine can choose the next clean market instead of forcing BTC or skipping the whole round.

### 5. Timing Lab
Tracks:

- 8:00 shadow
- 7:00 early confirmation
- 6:00 official champion lock
- 4:00 backup lock

8:00 and 7:00 are intentionally shadow/diagnostic by default until data proves they should be trusted.

### 6. Pro Score Stack
Shows the component scores behind the final decision:

- direction confidence
- normalized selector
- distance quality
- momentum quality
- local range quality
- reversal safety
- timing quality
- symbol reliability

### 7. Post-lock monitor
After a lock, the app keeps watching for:

- direction flip
- shrinking cushion
- shield deterioration
- current Pro score degradation

### 8. Better exports
Exports now include:

- Pro Score
- Pro grade
- shield score/signs
- timing lab status
- loss fingerprint
- component layers
- next-clean-market information

That makes future analysis much more useful than simply seeing W/L setup keys.

## Recommended starting settings

Use:

```text
Engine mode: Pro Balanced
Defense engine: Adaptive BTC Reversal Shield
Markets: BTC, ETH, SOL, BNB, XRP
```

Use **Champion Core** when you want to compare against the original model.

## Deploy on Vercel

1. Upload this folder to your GitHub repo or Vercel project.
2. In Vercel project settings:
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `.`
   - Node.js Version: 24.x
3. Deploy.

No environment variables are required for this prediction-only version.

## Important

This is a decision-support and research tool. It is not financial advice and it does not guarantee future wins. Crypto and prediction markets are risky. APIs can lag, and settlement can differ from visible spot ticks.
