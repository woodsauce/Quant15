# Edge15 Coinbase OAuth deployment fix

This build fixes the Vercel error where the project was being treated as a Next.js app.

## What changed

- Node engine moved from `20.x` to `24.x`.
- Added `packageManager` to stop the Corepack warning.
- Added `build` and `vercel-build` scripts so Vercel does not try to run `next build`.
- Added explicit static/API Vercel builders in `vercel.json`.

## Correct Vercel settings

If Vercel still tries to run Next.js after this patch, open the Vercel project settings and set:

- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: leave blank or `.`
- Install Command: `npm install --ignore-scripts`
- Node.js Version: 24.x

Then redeploy.
