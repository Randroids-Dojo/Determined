/**
 * GET /api/random-words
 * Returns LLM-generated creative word suggestions for each category.
 * Falls back to a curated word list if the LLM is unavailable.
 */

let kv = null;
try {
  kv = require('@vercel/kv').kv;
} catch {
  // KV not available
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

// ── Fallback word lists ──

const CREATURES = [
  'Jellyfish', 'Griffin', 'Tardigrade', 'Pangolin', 'Axolotl',
  'Minotaur', 'Capybara', 'Kraken', 'Platypus', 'Chimera',
  'Narwhal', 'Basilisk', 'Opossum', 'Phoenix', 'Mantis Shrimp',
  'Hydra', 'Quokka', 'Wyvern', 'Sloth', 'Kitsune',
  'Armadillo', 'Cerberus', 'Flamingo', 'Goblin', 'Sea Cucumber',
  'Moth', 'Centaur', 'Pufferfish', 'Dire Wolf', 'Salamander',
];

const WEAPONS = [
  'Banana', 'Trident', 'Rubber Duck', 'Boomerang', 'Frying Pan',
  'Chainsaw', 'Yo-Yo', 'Halberd', 'Cactus', 'Tennis Racket',
  'Slingshot', 'Nunchucks', 'Spork', 'Morningstar', 'Baguette',
  'Flamethrower', 'Umbrella', 'Shuriken', 'Rolled-up Newspaper', 'Crossbow',
  'Pickaxe', 'Whip', 'Stapler', 'Javelin', 'Toilet Plunger',
  'Katana', 'Crowbar', 'Blowdart', 'Hockey Stick', 'Lightsaber',
];

const ENVIRONMENTS = [
  'Hailstorm', 'Aurora', 'Earthquake', 'Tornado', 'Solar Flare',
  'Tsunami', 'Blizzard', 'Meteor Shower', 'Sandstorm', 'Lightning',
  'Volcanic Eruption', 'Monsoon', 'Avalanche', 'Wildfire', 'Acid Rain',
  'Thunderstorm', 'Whirlpool', 'Ice Storm', 'Dust Devil', 'Supernova',
  'Geyser', 'Fog', 'Heat Wave', 'Mudslide', 'Cosmic Radiation',
  'Tidal Wave', 'Permafrost', 'Ball Lightning', 'Flash Flood', 'Magnetic Storm',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Light rate limiting (share the generate endpoint's counters)
  if (kv) {
    try {
      const ip = getClientIP(req);
      const key = `ratelimit:randomwords:${ip}`;
      const count = await kv.incr(key);
      if (count === 1) await kv.expire(key, 60);
      if (count > 10) {
        // Over 10 requests/min — just use fallback list silently
        return res.status(200).json({
          creature: pick(CREATURES),
          weapon: pick(WEAPONS),
          environment: pick(ENVIRONMENTS),
        });
      }
    } catch {
      // Fail open
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      creature: pick(CREATURES),
      weapon: pick(WEAPONS),
      environment: pick(ENVIRONMENTS),
    });
  }

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'You generate creative word suggestions for an absurdist action game. Return only valid JSON.' },
          {
            role: 'user',
            content: `Pick one creative, fun, and unexpected word for each category. Be imaginative and surprising — avoid common/boring choices.

Return JSON: { "creature": "...", "weapon": "...", "environment": "..." }

- creature: any real, mythical, or absurd creature or animal
- weapon: any weapon, tool, or everyday object repurposed as a weapon
- environment: any weather phenomenon or force of nature

Return ONLY valid JSON, no explanation.`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 1.3,
        max_tokens: 80,
      }),
    });

    if (!resp.ok) throw new Error(`Groq ${resp.status}`);

    const result = await resp.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    const data = JSON.parse(content);

    // Validate all three fields are non-empty strings
    if (typeof data.creature === 'string' && data.creature.trim() &&
        typeof data.weapon === 'string' && data.weapon.trim() &&
        typeof data.environment === 'string' && data.environment.trim()) {
      return res.status(200).json({
        creature: data.creature.trim().slice(0, 30),
        weapon: data.weapon.trim().slice(0, 30),
        environment: data.environment.trim().slice(0, 30),
      });
    }

    throw new Error('Invalid response shape');
  } catch (err) {
    console.warn('Random words LLM failed, using fallback:', err.message);
    return res.status(200).json({
      creature: pick(CREATURES),
      weapon: pick(WEAPONS),
      environment: pick(ENVIRONMENTS),
    });
  }
};
