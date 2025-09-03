const axios = require('axios');

const PAYPER_CHECKOUT_URL = process.env.PAYPER_CHECKOUT_URL || 'https://checkout-staging.payper.ca/api/v2/checkout-session';

function extractBearerToken(header, fallbackToken) {
  const token = fallbackToken || header || '';
  if (!token) return null;
  const trimmed = token.trim();
  return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

function parseAmount(value) {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) throw new Error('Invalid amount');
  return num;
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod || 'GET';
    const headers = event.headers || {};
    const qs = event.queryStringParameters || {};

    const isPost = method.toUpperCase() === 'POST';
    const body = isPost && event.body ? JSON.parse(event.body) : {};

    const amount = parseAmount(isPost ? body.amount : qs.amount);
    const product = (isPost ? body.product : qs.product) || 'Holland Deposit';
    const currency = (isPost ? body.currency : qs.currency) || 'CAD';
    const return_url = (isPost ? body.return_url : qs.return_url) || `${headers['x-forwarded-proto'] || 'https'}://${headers.host}/payment-return`;
    const failed_return_url = (isPost ? body.failed_return_url : qs.failed_return_url) || `${headers['x-forwarded-proto'] || 'https'}://${headers.host}/checkout-failed`;

    const providedToken = (isPost ? body.token : qs.token) || null;
    const bearer = extractBearerToken(headers['authorization'], providedToken);
    if (!bearer) {
      return {
        statusCode: 401,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'missing_authorization', message: 'Provide Authorization header or token param' })
      };
    }

    const payload = {
      customer: {
        email: 'placeholder@example.com',
        billing_info: {
          first_name: 'Holland',
          last_name: 'Customer',
          address: '123 Main Street',
          city: 'Toronto',
          state: 'ON',
          zip_code: 'M5V 3A8',
          country: 'CA',
          company: 'Holland Leasing',
          phone: '+14160000000'
        }
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
          name: product,
          quantity: 1,
          description: 'Secure deposit payment',
          SKU: 'deposit',
          unit_price: amount,
          item_type: 'physical',
          image_url: 'https://static.vecteezy.com/system/resources/previews/035/662/363/non_2x/luxury-car-front-view-icon-free-vector.jpg'
        }
      ],
      convenience_fee: 0.0,
      currency,
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
      merchant_ntf_url: process.env.MERCHANT_NTF_URL,
      notification_info: process.env.NOTIFY_EMAIL || process.env.NOTIFY_PHONE ? {
        email_addresses: process.env.NOTIFY_EMAIL ? [process.env.NOTIFY_EMAIL] : undefined,
        phone_numbers: process.env.NOTIFY_PHONE ? [process.env.NOTIFY_PHONE] : undefined,
      } : undefined,
    };

    const { data } = await axios.post(PAYPER_CHECKOUT_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': bearer,
      }
    });

    const url = data && data.data && data.data.url;
    if (!url) {
      return {
        statusCode: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'bad_gateway', details: data })
      };
    }

    if (!isPost) {
      return {
        statusCode: 302,
        headers: { Location: url },
        body: ''
      };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, session_id: data?.data?.session_id, raw: data })
    };
  } catch (err) {
    const status = err.response && err.response.status || 500;
    const details = err.response && err.response.data || { message: err.message };
    return {
      statusCode: status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'checkout_failed', details })
    };
  }
};


