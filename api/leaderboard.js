import { Redis } from '@upstash/redis';

// Support both legacy KV_REST_API_* and new UPSTASH_REDIS_REST_* env vars
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

const CLASSIC_LEADERBOARD_KEY = 'hoops:leaderboard';
const CLASSIC_DAILY_PREFIX = 'hoops:daily:';
const DISTANCE_LEADERBOARD_KEY = 'hoops:leaderboard:distance';
const DISTANCE_DAILY_PREFIX = 'hoops:daily:distance:';
const MAX_ENTRIES = 100;
const MAX_DAILY = 50;
const NAME_MAX_LEN = 12;

function boardConfig(mode = 'classic') {
  if (mode === 'distance') {
    return {
      mode: 'distance',
      key: DISTANCE_LEADERBOARD_KEY,
      dailyPrefix: DISTANCE_DAILY_PREFIX,
      reverse: false,
      maxScore: 30 * 60 * 1000,
    };
  }
  return {
    mode: 'classic',
    key: CLASSIC_LEADERBOARD_KEY,
    dailyPrefix: CLASSIC_DAILY_PREFIX,
    reverse: true,
    maxScore: 99999,
  };
}

function todayKey(prefix) {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${prefix}${yyyy}-${mm}-${dd}`;
}

function sanitizeName(name) {
  return String(name || 'AAA')
    .replace(/[^A-Za-z0-9_ -]/g, '')
    .trim()
    .slice(0, NAME_MAX_LEN) || 'AAA';
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    }
    if (req.method === 'POST') {
      return await handlePost(req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req, res) {
  const { type = 'alltime', limit = '20', mode = 'classic' } = req.query;
  const config = boardConfig(mode);
  const count = Math.min(parseInt(limit, 10) || 20, MAX_ENTRIES);

  let key;
  if (type === 'daily') {
    key = todayKey(config.dailyPrefix);
  } else {
    key = config.key;
  }

  const entries = await kv.zrange(key, 0, count - 1, { rev: config.reverse, withScores: true });

  // entries comes as [member, score, member, score, ...]
  const results = [];
  for (let i = 0; i < entries.length; i += 2) {
    const data = typeof entries[i] === 'string' ? JSON.parse(entries[i]) : entries[i];
    results.push({
      name: data.name,
      stage: data.stage,
      date: data.date,
      mode: data.mode || 'classic',
      meta: data.meta || {},
      score: entries[i + 1],
    });
  }

  return res.status(200).json({ type, mode: config.mode, entries: results });
}

async function handlePost(req, res) {
  const { name, score, stage, mode = 'classic', meta = {} } = req.body || {};
  const config = boardConfig(mode);

  if (typeof score !== 'number' || score <= 0 || score > config.maxScore) {
    return res.status(400).json({ error: 'Invalid score' });
  }
  if (typeof stage !== 'number' || stage < 1 || stage > 999) {
    return res.status(400).json({ error: 'Invalid stage' });
  }

  const cleanName = sanitizeName(name);
  const date = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const member = JSON.stringify({ name: cleanName, stage, date, id, mode: config.mode, meta });

  await kv.zadd(config.key, { score, member });

  const dailyKey = todayKey(config.dailyPrefix);
  await kv.zadd(dailyKey, { score, member });
  // Set TTL of 25 hours on daily key so it auto-expires
  await kv.expire(dailyKey, 25 * 60 * 60);

  // Trim all-time to top MAX_ENTRIES (remove lowest scores beyond limit)
  const totalCount = await kv.zcard(config.key);
  if (totalCount > MAX_ENTRIES) {
    if (config.reverse) {
      await kv.zremrangebyrank(config.key, 0, totalCount - MAX_ENTRIES - 1);
    } else {
      await kv.zremrangebyrank(config.key, MAX_ENTRIES, -1);
    }
  }

  // Trim daily
  const dailyCount = await kv.zcard(dailyKey);
  if (dailyCount > MAX_DAILY) {
    if (config.reverse) {
      await kv.zremrangebyrank(dailyKey, 0, dailyCount - MAX_DAILY - 1);
    } else {
      await kv.zremrangebyrank(dailyKey, MAX_DAILY, -1);
    }
  }

  // Get the player's rank (0-based, from top)
  const rank = config.reverse
    ? await kv.zrevrank(config.key, member)
    : await kv.zrank(config.key, member);

  return res.status(200).json({
    success: true,
    rank: rank !== null ? rank + 1 : null,
    name: cleanName,
    score,
  });
}
