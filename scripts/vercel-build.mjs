import fs from 'node:fs';

const required = ['index.html', 'app.js', 'styles.css', 'api/coinbase-oauth-start.js', 'api/coinbase-oauth-callback.js'];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error('Missing required files for Edge15 static/API deployment:', missing.join(', '));
  process.exit(1);
}
console.log('Edge15 static/API build check passed. No Next.js build required.');
