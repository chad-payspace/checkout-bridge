const axios = require('axios');
const { getCodeConfig, setCodeConfig } = require('./_store');

const PAYPER_CHECKOUT_URL = process.env.PAYPER_CHECKOUT_URL || 'https://checkout-staging.payper.ca/api/v2/checkout-session';

function extractBearer(envHeader, provided) {
  const token = provided || envHeader || '';
  if (!token) return null;
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const code = qs.code || (event.path || '').split('/').pop();
    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: 'missing_code' }) };
    }

    const config = await getCodeConfig(code);
    if (!config) {
      return { statusCode: 404, body: JSON.stringify({ error: 'code_not_found' }) };
    }

    // amount handling: allow override via `a` only if enabled
    let amount = config.amount;
    if (config.allow_amount_override && qs.a) {
      const override = Number(qs.a);
      if (!Number.isNaN(override) && override > 0) amount = override;
    }

    // Prefer code-level token; else query token; else env PAYPER_TOKEN
    const bearer = extractBearer(process.env.PAYPER_TOKEN, config.token || qs.token);
    if (!bearer) {
      return { statusCode: 401, body: JSON.stringify({ error: 'missing_token' }) };
    }

    const host = event.headers.host || 'hollandcheckout.netlify.app';
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const return_url = `${proto}://${host}/payment-return`;
    const failed_return_url = `${proto}://${host}/checkout-failed`;

    const payload = {
      customer: {
        email: 'placeholder@example.com'
      },
      session_info: {
        session_type: 'payment',
        session_methods: [
          { method: 'wire_transfer', preferred: false },
          { method: 'etransfer_request_money', preferred: true }
        ]
      },
      checkout_items: [
        {
          name: config.product,
          quantity: 1,
          description: 'Secure deposit payment',
          SKU: 'deposit',
          unit_price: amount,
          item_type: 'physical'
        }
      ],
      convenience_fee: 0.0,
      currency: config.currency || 'CAD',
      udfs: [
        `deposit_${Date.now()}`,
        'deposit',
        'holland_leasing',
        Date.now().toString(),
        'Holland Leasing Inc',
        new Date().toLocaleDateString(),
        'TD'
      ],
      return_url,
      failed_return_url,
      merchant_ntf_url: process.env.MERCHANT_NTF_URL
    };

    const { data } = await axios.post(PAYPER_CHECKOUT_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': bearer,
      }
    });

    const url = data && data.data && data.data.url;
    if (!url) {
      return { statusCode: 502, body: JSON.stringify({ error: 'bad_gateway', details: data }) };
    }

    // Update usage count for analytics (not a consumption lock)
    try {
      await setCodeConfig(code, { ...config, usage_count: (config.usage_count || 0) + 1, last_used_at: Date.now() });
    } catch {}

    return {
      statusCode: 302,
      headers: { Location: url },
      body: ''
    };
  } catch (err) {
    const status = err.response && err.response.status || 500;
    const details = err.response && err.response.data || { message: err.message };
    return { statusCode: status, body: JSON.stringify({ error: 'redeem_failed', details }) };
  }
};


