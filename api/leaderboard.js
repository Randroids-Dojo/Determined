/**
 * /api/leaderboard
 * GET  — returns top 50 leaderboard entries
 * POST — submits a new entry
 */

let kv = null;
try {
  kv = require('@vercel/kv').kv;
} catch {
  // KV not available
}

const LB_KEY = 'leaderboard:entries';
const MAX_ENTRIES = 50;

const PROFANITY_LIST = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'dick', 'pussy', 'cock',
  'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'slut', 'whore',
];

function hasProfanity(str) {
  const lower = str.toLowerCase();
  return PROFANITY_LIST.some(p => lower.includes(p));
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── GET: Retrieve leaderboard ──
  if (req.method === 'GET') {
    if (!kv) return res.status(200).json([]);

    try {
      // Get all entries sorted by score (ascending — lower is better)
      const raw = await kv.zrange(LB_KEY, 0, MAX_ENTRIES - 1, { withScores: false });
      const entries = raw.map(entry => {
        if (typeof entry === 'string') return JSON.parse(entry);
        return entry;
      });
      return res.status(200).json(entries);
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
      return res.status(200).json([]);
    }
  }

  // ── POST: Submit entry ──
  if (req.method === 'POST') {
    if (!kv) {
      return res.status(503).json({ error: 'Leaderboard not available' });
    }

    const { initials, deaths, time, word_1, word_2, word_3 } = req.body || {};

    // Validate
    if (!initials || typeof deaths !== 'number' || typeof time !== 'number') {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cleanInitials = initials.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (cleanInitials.length < 1) {
      return res.status(400).json({ error: 'Invalid initials' });
    }

    if (hasProfanity(cleanInitials)) {
      return res.status(400).json({ error: 'Invalid initials' });
    }

    // Rate limit: 1 submission per minute per IP
    const ip = getClientIP(req);
    const rlKey = `lb_ratelimit:${ip}`;
    try {
      const count = await kv.incr(rlKey);
      if (count === 1) await kv.expire(rlKey, 60);
      if (count > 1) {
        return res.status(429).json({ error: 'Too many submissions. Wait a minute.' });
      }
    } catch (err) {
      console.warn('Leaderboard rate limit check failed:', err);
    }

    // Score: deaths * 10000 + time (so fewer deaths always wins, time is tiebreaker)
    const score = deaths * 10000 + Math.round(time);

    const entry = {
      initials: cleanInitials,
      deaths,
      time: Math.round(time * 10) / 10,
      word_1: (word_1 || '').slice(0, 30),
      word_2: (word_2 || '').slice(0, 30),
      word_3: (word_3 || '').slice(0, 30),
      timestamp: new Date().toISOString(),
    };

    try {
      await kv.zadd(LB_KEY, { score, member: JSON.stringify(entry) });

      // Trim to max entries
      const count = await kv.zcard(LB_KEY);
      if (count > MAX_ENTRIES) {
        await kv.zremrangebyrank(LB_KEY, MAX_ENTRIES, -1);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Leaderboard submit error:', err);
      return res.status(500).json({ error: 'Failed to save entry' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
