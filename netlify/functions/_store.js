const axios = require('axios');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

// Fallback in-memory store (ephemeral, for local/dev only)
const memory = new Map();

async function redisGet(key) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  const url = `${UPSTASH_URL}/get/${encodeURIComponent(key)}`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  return data && data.result ? data.result : null;
}

async function redisSet(key, value) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return false;
  const url = `${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const { data } = await axios.post(url, null, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  return data && data.result === 'OK';
}

async function getCodeConfig(code) {
  const key = `code:${code}`;
  const val = await redisGet(key);
  if (val) {
    try { return JSON.parse(val); } catch { return null; }
  }
  if (memory.has(key)) return memory.get(key);
  return null;
}

async function setCodeConfig(code, config) {
  const key = `code:${code}`;
  const str = JSON.stringify(config);
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    await redisSet(key, str);
  } else {
    memory.set(key, config);
  }
  return true;
}

module.exports = {
  getCodeConfig,
  setCodeConfig,
};


