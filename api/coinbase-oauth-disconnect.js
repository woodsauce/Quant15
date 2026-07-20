const { json, clearCookie, SESSION_COOKIE } = require('./_coinbaseSession');

module.exports = async function handler(req, res) {
  res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
  json(res, 200, { ok: true, disconnected: true });
};
