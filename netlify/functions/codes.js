const crypto = require('crypto');
const { setCodeConfig } = require('./_store');

function randomCode(length = 8) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch { return {}; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'allow': 'POST' }, body: '' };
  }

  // Simple admin protection via API key
  const apiKey = process.env.ADMIN_API_KEY || '';
  if (apiKey && event.headers['x-api-key'] !== apiKey) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const body = parseBody(event);
  const amount = Number(body.amount);
  const product = body.product || 'Holland Deposit';
  const currency = (body.currency || 'CAD').toUpperCase();
  const token = body.token || null; // optional per-code token
  const allowAmountOverride = !!body.allow_amount_override;
  const code = body.code || randomCode(8);

  if (!amount || amount <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_amount' }) };
  }

  const config = {
    amount,
    product,
    currency,
    allow_amount_override: allowAmountOverride,
    token, // stored if provided
    usage_count: 0,
    created_at: Date.now(),
  };

  await setCodeConfig(code, config);

  const host = event.headers.host || 'hollandcheckout.netlify.app';
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const shortUrl = `${proto}://${host}/c/${code}`;

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, shortUrl, config })
  };
};


