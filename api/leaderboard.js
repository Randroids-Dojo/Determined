/**
 * /api/leaderboard
 * GET  — returns top 50 leaderboard entries
 * POST — submits a new entry (with spam protection)
 */

let kv = null;
try {
  kv = require('@vercel/kv').kv;
} catch {
  // KV not available
}

const LB_KEY = 'leaderboard:entries';
const MAX_ENTRIES = 50;

// ── Spam protection constants ──
const RATE_LIMIT_WINDOW = 60;          // seconds — per-minute cooldown
const DAILY_LIMIT = 20;               // max submissions per IP per day
const DAILY_LIMIT_WINDOW = 86400;     // seconds in a day
const MAX_ENTRIES_PER_IP = 5;         // max leaderboard entries kept per IP
const MIN_PLAUSIBLE_TIME = 5;         // seconds — minimum realistic completion time
const MAX_PLAUSIBLE_TIME = 7200;      // seconds — 2 hours max
const MAX_PLAUSIBLE_DEATHS = 999;     // nobody dies 1000+ times and keeps playing

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
        const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
        // Strip internal fields before sending to client
        const { ip: _ip, ...publicEntry } = parsed;
        return publicEntry;
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

    const { initials, deaths, time, word_1, word_2, word_3, score: rawScore, bottles: rawBottles } = req.body || {};

    // ── Field presence & type validation ──
    if (!initials || typeof deaths !== 'number' || typeof time !== 'number') {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ── Numeric bounds validation ──
    if (!Number.isFinite(deaths) || !Number.isFinite(time)) {
      return res.status(400).json({ error: 'Invalid numeric values' });
    }
    if (!Number.isInteger(deaths) || deaths < 0 || deaths > MAX_PLAUSIBLE_DEATHS) {
      return res.status(400).json({ error: 'Invalid death count' });
    }
    if (time < MIN_PLAUSIBLE_TIME || time > MAX_PLAUSIBLE_TIME) {
      return res.status(400).json({ error: 'Invalid time value' });
    }

    // ── Initials validation ──
    const cleanInitials = initials.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (cleanInitials.length < 1) {
      return res.status(400).json({ error: 'Invalid initials' });
    }
    if (hasProfanity(cleanInitials)) {
      return res.status(400).json({ error: 'Invalid initials' });
    }

    // ── Word fields: sanitize + profanity check ──
    const cleanWord1 = (word_1 || '').slice(0, 30);
    const cleanWord2 = (word_2 || '').slice(0, 30);
    const cleanWord3 = (word_3 || '').slice(0, 30);
    if (hasProfanity(cleanWord1) || hasProfanity(cleanWord2) || hasProfanity(cleanWord3)) {
      return res.status(400).json({ error: 'Invalid word entry' });
    }

    // ── Rate limiting ──
    const ip = getClientIP(req);

    // Per-minute rate limit
    const rlKey = `lb_ratelimit:${ip}`;
    try {
      const count = await kv.incr(rlKey);
      if (count === 1) await kv.expire(rlKey, RATE_LIMIT_WINDOW);
      if (count > 1) {
        return res.status(429).json({ error: 'Too many submissions. Wait a minute.' });
      }
    } catch (err) {
      console.warn('Rate limit check failed:', err);
    }

    // Daily submission cap
    const dailyKey = `lb_daily:${ip}`;
    try {
      const dailyCount = await kv.incr(dailyKey);
      if (dailyCount === 1) await kv.expire(dailyKey, DAILY_LIMIT_WINDOW);
      if (dailyCount > DAILY_LIMIT) {
        return res.status(429).json({ error: 'Daily submission limit reached. Try again tomorrow.' });
      }
    } catch (err) {
      console.warn('Daily limit check failed:', err);
    }

    // ── Per-IP entry cap (prevent one person from flooding the board) ──
    try {
      const raw = await kv.zrange(LB_KEY, 0, -1, { withScores: false });
      const entries = raw.map(e => typeof e === 'string' ? JSON.parse(e) : e);
      const ipEntries = entries.filter(e => e.ip === ip);
      if (ipEntries.length >= MAX_ENTRIES_PER_IP) {
        // Remove the worst (highest-scored) entry from this IP to make room
        const worst = ipEntries[ipEntries.length - 1];
        await kv.zrem(LB_KEY, JSON.stringify(worst));
      }
    } catch (err) {
      console.warn('IP entry cap check failed:', err);
    }

    // Score: deaths * 10000 + time (so fewer deaths always wins, time is tiebreaker)
    const score = deaths * 10000 + Math.round(time);

    const l3Score = (typeof rawScore === 'number' && Number.isFinite(rawScore) && rawScore >= 0)
      ? Math.round(rawScore)
      : 0;

    const bottles = (typeof rawBottles === 'number' && Number.isFinite(rawBottles) && rawBottles >= 0)
      ? Math.min(Math.round(rawBottles), 999)
      : 0;

    const entry = {
      initials: cleanInitials,
      deaths,
      time: Math.round(time * 10) / 10,
      score: l3Score,
      bottles,
      word_1: cleanWord1,
      word_2: cleanWord2,
      word_3: cleanWord3,
      ip,
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
