/**
 * POST /api/generate
 * Accepts { words: { creature, weapon, environment } }
 * Returns LLM-generated game content JSON.
 * - Rate limits per-IP (10/hr) and global (50/hr)
 * - Caches results by normalized word in Vercel KV
 * - Falls back to defaults on LLM failure
 */

// Vercel KV may not be configured yet — graceful fallback
let kv = null;
try {
  kv = require('@vercel/kv').kv;
} catch {
  // KV not available — will skip caching/rate limiting
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

const RATE_LIMIT_PER_IP = 10;
const RATE_LIMIT_GLOBAL = 50;
const RATE_WINDOW_SEC = 3600; // 1 hour

// ── JSON schema for the LLM prompt ──

const JSON_SCHEMA = `{
  "obstacle": {
    "name": "string",
    "description": "string - short humorous flavor text",
    "health": "number 50-200",
    "attack_damage": "number 5-30",
    "attack_pattern": "melee | charge | projectile",
    "attack_cooldown": "number 0.5-3.0",
    "movement_speed": "number 1-5",
    "aggro_range": "number 80-200",
    "weakness": "string - a damage type",
    "visual": {
      "base_shape": "circle | rectangle | triangle",
      "width": "number 30-80",
      "height": "number 30-80",
      "color_primary": "hex color",
      "color_secondary": "hex color",
      "color_accent": "hex color",
      "features": [ { "type": "circle|rectangle|triangle|line|arc", "label": "string", ...shape props } ]
    }
  },
  "weapon": {
    "name": "string",
    "description": "string - short humorous description",
    "damage": "number 10-50",
    "damage_type": "fire|ice|electric|blunt|sharp|poison|holy|dark|arcane",
    "attack_pattern": "melee | projectile | area",
    "range": "number 30-200",
    "cooldown": "number 0.2-2.0",
    "special_effect": "knockback|stun|burn|freeze|none",
    "special_effect_duration": "number 0-3",
    "effectiveness_vs_obstacle": "number 0.5-3.0",
    "visual": {
      "base_shape": "line | rectangle | circle",
      "width": "number",
      "height": "number",
      "color_primary": "hex color",
      "color_secondary": "hex color",
      "features": [ { "type": "circle|rectangle|triangle|line|arc", "label": "string", ...shape props } ]
    }
  },
  "environment_item": {
    "name": "string",
    "description": "string - what happens when activated",
    "effect_type": "damage|stun|terrain|buff|debuff|mixed",
    "damage": "number 0-100",
    "area_of_effect": "full_screen|targeted|zone",
    "duration": "number seconds, 0 for instant",
    "affects_player": { "active": "boolean", "effect": "string" },
    "affects_obstacle": { "active": "boolean", "effect": "string" },
    "screen_shake": "number 0-10",
    "visual_effect": {
      "type": "overlay|particles|flash|weather",
      "color_primary": "hex color",
      "color_secondary": "hex color",
      "description": "string"
    }
  }
}`;

function buildPrompt(words) {
  return `You are a creative game designer for an absurdist action game called "Determined".
Given these three player-chosen words, generate game content as structured JSON.

CREATURE: ${words.creature}
WEAPON: ${words.weapon}
ENVIRONMENT EFFECT: ${words.environment}

Generate a JSON response matching this exact structure:
${JSON_SCHEMA}

Rules:
- Make it fun, absurd, and creative. Lean into humor.
- The creature's weakness should relate to the weapon's damage type when it makes sense.
- The environment effect should affect BOTH player and obstacle for strategic gameplay.
- Visual features use canvas primitives. Keep features to 3-8 items per entity.
- All numbers must be within the specified ranges.
- Color values must be valid hex colors (e.g. "#FF0000").
- Return ONLY valid JSON, no markdown or explanation.`;
}

// ── Fallback defaults ──

const FALLBACK = {
  obstacle: {
    name: 'Mystery Blob',
    description: 'It showed up uninvited and seems angry about it.',
    health: 80, attack_damage: 10, attack_pattern: 'melee',
    attack_cooldown: 1.5, movement_speed: 2, aggro_range: 120, weakness: 'sharp',
    visual: {
      base_shape: 'circle', width: 50, height: 45,
      color_primary: '#CC3333', color_secondary: '#FF6666', color_accent: '#220000',
      features: [
        { type: 'circle', x: 15, y: -8, radius: 5, color: '#FFFFFF', label: 'eye_left' },
        { type: 'circle', x: 35, y: -8, radius: 5, color: '#FFFFFF', label: 'eye_right' },
        { type: 'circle', x: 15, y: -8, radius: 2, color: '#220000', label: 'pupil_left' },
        { type: 'circle', x: 35, y: -8, radius: 2, color: '#220000', label: 'pupil_right' },
      ],
    },
  },
  weapon: {
    name: 'Improvised Whacker',
    description: 'It looks like it could hurt. Probably.',
    damage: 20, damage_type: 'blunt', attack_pattern: 'melee', range: 55,
    cooldown: 0.5, special_effect: 'none', special_effect_duration: 0,
    effectiveness_vs_obstacle: 1.0,
    visual: {
      base_shape: 'rectangle', width: 30, height: 8,
      color_primary: '#8B4513', color_secondary: '#A0522D',
      features: [
        { type: 'rectangle', x: 0, y: 0, width: 30, height: 8, color: '#8B4513', label: 'body' },
      ],
    },
  },
  environment_item: {
    name: 'Shockwave',
    description: 'A pulse of energy rattles everything on screen.',
    effect_type: 'mixed', damage: 40, area_of_effect: 'full_screen', duration: 0.5,
    affects_player: { active: true, effect: 'Knocked back slightly' },
    affects_obstacle: { active: true, effect: 'Takes damage and is stunned briefly' },
    screen_shake: 6,
    visual_effect: {
      type: 'flash', color_primary: '#FFFFFF', color_secondary: '#FFD700',
      description: 'A bright shockwave radiates outward',
    },
  },
};

// ── Helpers ──

function normalize(word) {
  return word.trim().toLowerCase().replace(/[^a-z0-9 '-]/g, '');
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown';
}

async function checkRateLimit(ip) {
  if (!kv) return { allowed: true };

  const ipKey = `ratelimit:ip:${ip}`;
  const globalKey = 'ratelimit:global';

  try {
    const [ipCount, globalCount] = await Promise.all([
      kv.incr(ipKey),
      kv.incr(globalKey),
    ]);

    // Set expiry on first increment
    if (ipCount === 1) await kv.expire(ipKey, RATE_WINDOW_SEC);
    if (globalCount === 1) await kv.expire(globalKey, RATE_WINDOW_SEC);

    if (ipCount > RATE_LIMIT_PER_IP || globalCount > RATE_LIMIT_GLOBAL) {
      return { allowed: false, retryAfter: RATE_WINDOW_SEC };
    }
  } catch (err) {
    console.warn('Rate limit check failed:', err);
    // Fail open
  }

  return { allowed: true };
}

async function getCached(words) {
  if (!kv) return null;
  try {
    const keys = [
      `obstacle:${normalize(words.creature)}`,
      `weapon:${normalize(words.weapon)}`,
      `environment:${normalize(words.environment)}`,
    ];
    const [obstacle, weapon, environment_item] = await Promise.all(
      keys.map(k => kv.get(k))
    );
    if (obstacle && weapon && environment_item) {
      return { obstacle, weapon, environment_item, cached: true };
    }
  } catch (err) {
    console.warn('Cache read failed:', err);
  }
  return null;
}

async function cacheResults(words, data) {
  if (!kv) return;
  try {
    await Promise.all([
      kv.set(`obstacle:${normalize(words.creature)}`, data.obstacle),
      kv.set(`weapon:${normalize(words.weapon)}`, data.weapon),
      kv.set(`environment:${normalize(words.environment)}`, data.environment_item),
    ]);
  } catch (err) {
    console.warn('Cache write failed:', err);
  }
}

async function callGroq(words) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const resp = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a game content generator. Return only valid JSON.' },
        { role: 'user', content: buildPrompt(words) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: 2000,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq API error ${resp.status}: ${text}`);
  }

  const result = await resp.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Groq');

  return JSON.parse(content);
}

function validateData(data) {
  // Basic structure check — ensure required top-level keys exist
  return data &&
    typeof data.obstacle === 'object' &&
    typeof data.weapon === 'object' &&
    typeof data.environment_item === 'object';
}

// ── Handler ──

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { words } = req.body || {};
  if (!words?.creature || !words?.weapon || !words?.environment) {
    return res.status(400).json({ error: 'Missing required words (creature, weapon, environment)' });
  }

  // Check cache first (free, no rate limit cost)
  const cached = await getCached(words);
  if (cached) {
    return res.status(200).json(cached);
  }

  // Rate limit
  const ip = getClientIP(req);
  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    return res.status(429).json({
      error: 'The creative spirits are resting. Try again later, or use words that have been imagined before!',
      retryAfter: rl.retryAfter,
    });
  }

  // Call LLM
  try {
    let data = await callGroq(words);

    if (!validateData(data)) {
      // Retry once
      console.warn('Invalid LLM response, retrying...');
      data = await callGroq(words);
    }

    if (validateData(data)) {
      await cacheResults(words, data);
      return res.status(200).json({ ...data, cached: false });
    }

    // Still invalid — fallback
    console.warn('LLM returned invalid data after retry, using fallback');
    return res.status(200).json({ ...FALLBACK, fallback: true });
  } catch (err) {
    console.error('Generation error:', err);
    return res.status(200).json({ ...FALLBACK, fallback: true });
  }
}
