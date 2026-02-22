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

const FEATURE_SHAPE_DOCS = `
Feature shape types and their required properties:
  - circle:      { "type":"circle",      "label":"string", "x":number, "y":number, "radius":number, "color":"hex" }
  - ellipse:     { "type":"ellipse",     "label":"string", "x":number, "y":number, "radiusX":number, "radiusY":number, "rotation":radians(default 0), "color":"hex" }
  - rectangle:   { "type":"rectangle",   "label":"string", "x":number, "y":number, "width":number, "height":number, "color":"hex" }
  - roundedRect: { "type":"roundedRect", "label":"string", "x":number, "y":number, "width":number, "height":number, "cornerRadius":number, "color":"hex" }
  - triangle:    { "type":"triangle",    "label":"string", "points":[[x1,y1],[x2,y2],[x3,y3]], "color":"hex" }
  - line:        { "type":"line",        "label":"string", "x1":number, "y1":number, "x2":number, "y2":number, "lineWidth":1-10, "color":"hex" }
  - arc:         { "type":"arc",         "label":"string", "x":number, "y":number, "radius":number, "startAngle":radians, "endAngle":radians, "color":"hex" }
  - polygon:     { "type":"polygon",     "label":"string", "points":[[x1,y1],[x2,y2],...], "color":"hex" }

SHAPE TIPS:
- Use "ellipse" for organic shapes (bodies, heads, paws) — it looks much more natural than circle/rectangle.
- Use "roundedRect" for limbs and thick body parts — softer than plain rectangles.
- All shapes automatically get a subtle dark outline for definition, so parts are visually distinct even with similar colors.
- x/y for circle and ellipse is the CENTER of the shape. x/y for rectangle and roundedRect is the TOP-LEFT corner.
- All x/y positions are RELATIVE to the entity's top-left corner (0,0). The base_shape fills from (0,0) to (width,height).`;

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
      "base_shape": "ellipse | circle | rectangle | triangle",
      "width": "number 30-80",
      "height": "number 30-80",
      "color_primary": "hex color - body color",
      "color_secondary": "hex color",
      "color_accent": "hex color",
      "features": "array of 12-18 shape objects (see feature shape docs)"
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
      "features": "array of shape objects (see feature shape docs)"
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
      "style": "bolt|flames|freeze|wind|explosion|beam|rain",
      "color_primary": "hex color",
      "color_secondary": "hex color",
      "description": "string"
    },
    "visual": {
      "base_shape": "circle | rectangle | triangle",
      "width": "number 20-30",
      "height": "number 20-30",
      "color_primary": "hex color",
      "color_secondary": "hex color",
      "features": "array of 2-5 shape objects (see feature shape docs) — small iconic logo"
    }
  }
}`;

const VISUAL_EXAMPLE = `
COORDINATE GUIDE (for a creature with width:70, height:50):
- (0,0) is TOP-LEFT of bounding box. (70,50) is BOTTOM-RIGHT.
- For circle/ellipse, x,y is the CENTER. For rectangle/roundedRect, x,y is the TOP-LEFT corner.
- Side-view layout for quadrupeds: HEAD on the LEFT (x ≈ 10-20), BODY in the CENTER (x ≈ 35-40), TAIL on the RIGHT (x ≈ 60-75). LEGS at the BOTTOM (y ≈ 34-50).
- HEAD should be LARGE (radius 12-16) — this is a game sprite, not a realistic drawing. Big expressive heads look better.
- EYES should be placed ON the head (inside the head circle/ellipse at same y or slightly above head center).

Example: if the creature is "lion", a good visual would be:
{
  "base_shape": "ellipse", "width": 70, "height": 50,
  "color_primary": "#D4A030", "color_secondary": "#C08A20", "color_accent": "#3A2000",
  "features": [
    { "type": "ellipse", "label": "body", "x": 40, "y": 24, "radiusX": 26, "radiusY": 15, "color": "#D4A030" },
    { "type": "circle", "label": "mane", "x": 16, "y": 14, "radius": 22, "color": "#8B5E10" },
    { "type": "circle", "label": "head", "x": 16, "y": 16, "radius": 14, "color": "#E0B040" },
    { "type": "circle", "label": "eye_left", "x": 10, "y": 13, "radius": 3.5, "color": "#FFFFFF" },
    { "type": "circle", "label": "eye_right", "x": 20, "y": 13, "radius": 3.5, "color": "#FFFFFF" },
    { "type": "circle", "label": "pupil_left", "x": 11, "y": 13, "radius": 2, "color": "#1A1000" },
    { "type": "circle", "label": "pupil_right", "x": 21, "y": 13, "radius": 2, "color": "#1A1000" },
    { "type": "ellipse", "label": "snout", "x": 15, "y": 22, "radiusX": 7, "radiusY": 5, "color": "#E0B848" },
    { "type": "ellipse", "label": "nose", "x": 15, "y": 20, "radiusX": 3, "radiusY": 2, "color": "#3A2000" },
    { "type": "arc", "label": "mouth", "x": 15, "y": 24, "radius": 4, "startAngle": 0.2, "endAngle": 2.94, "color": "#3A2000" },
    { "type": "triangle", "label": "ear_left", "points": [[4,5],[1,-5],[11,1]], "color": "#C09020" },
    { "type": "triangle", "label": "ear_right", "points": [[28,5],[19,1],[29,-5]], "color": "#C09020" },
    { "type": "roundedRect", "label": "front_leg_left", "x": 20, "y": 34, "width": 9, "height": 18, "cornerRadius": 4, "color": "#C08A20" },
    { "type": "roundedRect", "label": "front_leg_right", "x": 32, "y": 34, "width": 9, "height": 18, "cornerRadius": 4, "color": "#B87A10" },
    { "type": "roundedRect", "label": "back_leg_left", "x": 48, "y": 34, "width": 9, "height": 18, "cornerRadius": 4, "color": "#C08A20" },
    { "type": "roundedRect", "label": "back_leg_right", "x": 58, "y": 34, "width": 9, "height": 18, "cornerRadius": 4, "color": "#B87A10" },
    { "type": "line", "label": "tail", "x1": 64, "y1": 18, "x2": 76, "y2": 6, "lineWidth": 3, "color": "#B87A10" },
    { "type": "circle", "label": "tail_tuft", "x": 77, "y": 5, "radius": 5, "color": "#8B5E0A" }
  ]
}
KEY ANATOMY RULES:
- This is a SIDE-VIEW sprite. Head on the LEFT, body in the CENTER, tail on the RIGHT. Legs at the BOTTOM.
- Make the HEAD BIG — radius 12-16 for a 70px wide creature. Game sprites need oversized, expressive heads.
- Eyes go ON the head: their x,y should be INSIDE the head circle/ellipse, at the same y or slightly above the head center.
- ALWAYS use "ellipse" for organic body parts (body, head, snout/muzzle, paws). Ellipses create natural, rounded shapes.
- ALWAYS use "roundedRect" for legs/limbs with cornerRadius 3-5 for a smooth look.
- Use "circle" for mane, head (when roughly round), eyes, and tufts.
- The base_shape is a bounding hint — the REAL body shape is the large "body" ellipse feature.
- Legs should be positioned at the BOTTOM of the body (y ≈ 34+ for a 50px tall creature), spread evenly under the body.
- Use 3-4 related colors: primary for body, slightly darker for legs/back features, lighter for belly/snout, dark accent for nose/pupils.
- IMPORTANT: When features overlap (like a mane behind a head), use clearly DIFFERENT colors so both are visible. The mane must be noticeably darker or lighter than the head — if they're too similar, the mane disappears.
- For EARS: use short, wide triangles (base ≈ 8px, height ≈ 10px) sitting on top of the head. NOT tall narrow spikes — those look like antennae.
- Add creature-specific features: mane for lion, shell for turtle, wings for bird, horns for bull, tentacles for octopus, fins for fish, stripes as extra ellipses.`;

function buildPrompt(words) {
  return `You are a creative game designer for an absurdist action game called "Determined".
Given these three player-chosen words, generate game content as structured JSON.

CREATURE: ${words.creature}
WEAPON: ${words.weapon}
ENVIRONMENT EFFECT: ${words.environment}

Generate a JSON response matching this exact structure:
${JSON_SCHEMA}

${FEATURE_SHAPE_DOCS}

${VISUAL_EXAMPLE}

Rules:
- The creature's visual MUST be recognizable as a "${words.creature}". Use features to build distinctive body parts (head, eyes, ears, limbs, tail, horns, wings, etc.) that look like the named creature. Choose colors appropriate to the creature.
- PREFER "ellipse" for all organic/curved parts (body, head, snout, paws, cheeks). PREFER "roundedRect" for limbs. AVOID plain "rectangle" for body parts — it looks boxy and unnatural.
- Make it fun, absurd, and creative. Lean into humor.
- The creature's weakness should relate to the weapon's damage type when it makes sense.
- The environment effect should affect BOTH player and obstacle for strategic gameplay.
- Use 12-18 features per creature. The FIRST feature should be a large "body" ellipse. Then add head, eyes (with pupils), nose, mouth, ears, 4 legs (use roundedRect with cornerRadius 3-5), and creature-specific features (mane, wings, horns, tail, shell, tentacles, etc.).
- Use a color palette: primary body color, slightly darker shade for limbs, lighter shade for belly/snout, dark accent for nose/pupils.
- The environment item's visual is a small 20-30px pickup icon. Use 2-5 features to build a simple, recognizable symbol of "${words.environment}" (e.g. a lightning bolt, snowflake, flame, raindrop, tornado shape). Keep it compact.
- The environment item's visual_effect.style controls the targeted animation when the item is activated. Choose the best match for "${words.environment}": "bolt" for lightning/electricity/energy, "flames" for fire/heat/lava/magma, "freeze" for ice/snow/cold/frost, "wind" for tornado/hurricane/gust/storm, "explosion" for earthquake/shockwave/meteor/bomb, "beam" for laser/light/solar/radiation, "rain" for rain/hail/acid/flood.
- Position features relative to the base shape (0,0 is top-left, width/height is bottom-right). Remember: circle/ellipse x,y is the CENTER, rectangle/roundedRect x,y is the TOP-LEFT.
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
      base_shape: 'ellipse', width: 50, height: 45,
      color_primary: '#CC3333', color_secondary: '#FF6666', color_accent: '#220000',
      features: [
        { type: 'ellipse', x: 25, y: 22, radiusX: 24, radiusY: 20, color: '#CC3333', label: 'body' },
        { type: 'circle', x: 15, y: 10, radius: 5, color: '#FFFFFF', label: 'eye_left' },
        { type: 'circle', x: 35, y: 10, radius: 5, color: '#FFFFFF', label: 'eye_right' },
        { type: 'circle', x: 16, y: 10, radius: 2.5, color: '#220000', label: 'pupil_left' },
        { type: 'circle', x: 36, y: 10, radius: 2.5, color: '#220000', label: 'pupil_right' },
        { type: 'arc', x: 25, y: 20, radius: 6, startAngle: 0.2, endAngle: 2.94, color: '#220000', label: 'mouth' },
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
      type: 'flash', style: 'explosion', color_primary: '#FFFFFF', color_secondary: '#FFD700',
      description: 'A bright shockwave radiates outward',
    },
    visual: {
      base_shape: 'circle', width: 24, height: 24,
      color_primary: '#FFD700', color_secondary: '#FFFFFF',
      features: [
        { type: 'circle', label: 'ring_outer', x: 12, y: 12, radius: 10, color: '#FFD700' },
        { type: 'circle', label: 'ring_inner', x: 12, y: 12, radius: 6, color: '#FFFFFF' },
        { type: 'circle', label: 'core', x: 12, y: 12, radius: 3, color: '#FF8800' },
      ],
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
      temperature: 0.7,
      max_tokens: 3500,
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

/** Ensure val is a finite number; if not, return fallback. */
function num(val, fallback) {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

/** Clamp a number to [min, max] with a fallback for non-numbers. */
function clampNum(val, min, max, fallback) {
  const n = num(val, fallback);
  return Math.max(min, Math.min(max, n));
}

/** Validate a hex colour string; return fallback if invalid. */
function hexColor(val, fallback) {
  if (typeof val === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(val)) return val;
  return fallback;
}

/** Ensure val is one of the allowed strings; return fallback otherwise. */
function oneOf(val, allowed, fallback) {
  return allowed.includes(val) ? val : fallback;
}

/** Sanitize a single visual feature object. */
function sanitizeFeature(f) {
  if (!f || typeof f !== 'object') return null;
  const validTypes = ['circle', 'ellipse', 'rectangle', 'roundedRect', 'triangle', 'line', 'arc', 'polygon'];
  const type = oneOf(f.type, validTypes, 'rectangle');
  const base = { type, label: typeof f.label === 'string' ? f.label : '', color: hexColor(f.color, '#888888') };
  switch (type) {
    case 'circle':
      return { ...base, x: num(f.x, 0), y: num(f.y, 0), radius: clampNum(f.radius, 1, 200, 10) };
    case 'ellipse':
      return { ...base, x: num(f.x, 0), y: num(f.y, 0), radiusX: clampNum(f.radiusX, 1, 200, 10), radiusY: clampNum(f.radiusY, 1, 200, 10), rotation: num(f.rotation, 0) };
    case 'rectangle':
      return { ...base, x: num(f.x, 0), y: num(f.y, 0), width: clampNum(f.width, 1, 200, 20), height: clampNum(f.height, 1, 200, 20) };
    case 'roundedRect':
      return { ...base, x: num(f.x, 0), y: num(f.y, 0), width: clampNum(f.width, 1, 200, 20), height: clampNum(f.height, 1, 200, 20), cornerRadius: clampNum(f.cornerRadius, 1, 50, 4) };
    case 'triangle':
    case 'polygon':
      if (Array.isArray(f.points) && f.points.length >= 3) {
        return { ...base, points: f.points.slice(0, 12).map(p => Array.isArray(p) ? [num(p[0], 0), num(p[1], 0)] : [0, 0]) };
      }
      return { ...base, x: num(f.x, 0), y: num(f.y, 0), width: clampNum(f.width, 1, 200, 20), height: clampNum(f.height, 1, 200, 20), type: 'rectangle' };
    case 'line':
      return { ...base, x1: num(f.x1, 0), y1: num(f.y1, 0), x2: num(f.x2, 20), y2: num(f.y2, 20), lineWidth: clampNum(f.lineWidth, 1, 10, 2) };
    case 'arc':
      return { ...base, x: num(f.x, 0), y: num(f.y, 0), radius: clampNum(f.radius, 1, 200, 10), startAngle: num(f.startAngle, 0), endAngle: num(f.endAngle, Math.PI) };
    default:
      return base;
  }
}

/**
 * Deep-sanitize LLM output: clamp all numeric fields, validate enums,
 * ensure visual.features items have required shape properties.
 * Mutates and returns the data object.
 */
function sanitizeData(data) {
  const o = data.obstacle;
  if (o) {
    o.name = typeof o.name === 'string' ? o.name.slice(0, 60) : 'Mysterious Creature';
    o.description = typeof o.description === 'string' ? o.description.slice(0, 200) : '';
    o.health = clampNum(o.health, 50, 200, 100);
    o.attack_damage = clampNum(o.attack_damage, 5, 30, 15);
    o.attack_pattern = oneOf(o.attack_pattern, ['melee', 'charge', 'projectile'], 'melee');
    o.attack_cooldown = clampNum(o.attack_cooldown, 0.5, 3.0, 1.5);
    o.movement_speed = clampNum(o.movement_speed, 1, 5, 2);
    o.aggro_range = clampNum(o.aggro_range, 80, 200, 120);
    o.weakness = typeof o.weakness === 'string' ? o.weakness.slice(0, 30) : 'sharp';
    if (o.visual && typeof o.visual === 'object') {
      o.visual.base_shape = oneOf(o.visual.base_shape, ['circle', 'ellipse', 'rectangle', 'triangle'], 'ellipse');
      o.visual.width = clampNum(o.visual.width, 30, 80, 50);
      o.visual.height = clampNum(o.visual.height, 30, 80, 50);
      o.visual.color_primary = hexColor(o.visual.color_primary, '#CC3333');
      o.visual.color_secondary = hexColor(o.visual.color_secondary, '#FF6666');
      o.visual.color_accent = hexColor(o.visual.color_accent, '#220000');
      if (Array.isArray(o.visual.features)) {
        o.visual.features = o.visual.features.slice(0, 20).map(sanitizeFeature).filter(Boolean);
      } else {
        o.visual.features = [];
      }
    }
  }

  const w = data.weapon;
  if (w) {
    w.name = typeof w.name === 'string' ? w.name.slice(0, 60) : 'Pointy Stick';
    w.description = typeof w.description === 'string' ? w.description.slice(0, 200) : '';
    w.damage = clampNum(w.damage, 10, 50, 20);
    w.damage_type = oneOf(w.damage_type, ['fire', 'ice', 'electric', 'blunt', 'sharp', 'poison', 'holy', 'dark', 'arcane'], 'blunt');
    w.attack_pattern = oneOf(w.attack_pattern, ['melee', 'projectile', 'area'], 'melee');
    w.range = clampNum(w.range, 30, 200, 55);
    w.cooldown = clampNum(w.cooldown, 0.2, 2.0, 0.5);
    w.special_effect = oneOf(w.special_effect, ['knockback', 'stun', 'burn', 'freeze', 'none'], 'none');
    w.special_effect_duration = clampNum(w.special_effect_duration, 0, 3, 0);
    w.effectiveness_vs_obstacle = clampNum(w.effectiveness_vs_obstacle, 0.5, 3.0, 1.0);
    if (w.visual && typeof w.visual === 'object') {
      w.visual.base_shape = oneOf(w.visual.base_shape, ['line', 'rectangle', 'circle'], 'rectangle');
      w.visual.width = clampNum(w.visual.width, 4, 80, 30);
      w.visual.height = clampNum(w.visual.height, 2, 80, 8);
      w.visual.color_primary = hexColor(w.visual.color_primary, '#8B4513');
      w.visual.color_secondary = hexColor(w.visual.color_secondary, '#A0522D');
      if (Array.isArray(w.visual.features)) {
        w.visual.features = w.visual.features.slice(0, 8).map(sanitizeFeature).filter(Boolean);
      } else {
        w.visual.features = [];
      }
    }
  }

  const e = data.environment_item;
  if (e) {
    e.name = typeof e.name === 'string' ? e.name.slice(0, 60) : 'Mysterious Force';
    e.description = typeof e.description === 'string' ? e.description.slice(0, 200) : '';
    e.effect_type = oneOf(e.effect_type, ['damage', 'stun', 'terrain', 'buff', 'debuff', 'mixed'], 'damage');
    e.damage = clampNum(e.damage, 0, 100, 30);
    e.area_of_effect = oneOf(e.area_of_effect, ['full_screen', 'targeted', 'zone'], 'full_screen');
    e.duration = clampNum(e.duration, 0, 10, 0.5);
    e.screen_shake = clampNum(e.screen_shake, 0, 10, 5);
    if (e.affects_player && typeof e.affects_player === 'object') {
      e.affects_player.active = !!e.affects_player.active;
      e.affects_player.effect = typeof e.affects_player.effect === 'string' ? e.affects_player.effect.slice(0, 100) : '';
    } else {
      e.affects_player = { active: true, effect: 'Takes minor damage' };
    }
    if (e.affects_obstacle && typeof e.affects_obstacle === 'object') {
      e.affects_obstacle.active = !!e.affects_obstacle.active;
      e.affects_obstacle.effect = typeof e.affects_obstacle.effect === 'string' ? e.affects_obstacle.effect.slice(0, 100) : '';
    } else {
      e.affects_obstacle = { active: true, effect: 'Takes major damage' };
    }
    if (e.visual_effect && typeof e.visual_effect === 'object') {
      e.visual_effect.type = oneOf(e.visual_effect.type, ['overlay', 'particles', 'flash', 'weather'], 'flash');
      e.visual_effect.style = oneOf(e.visual_effect.style, ['bolt', 'flames', 'freeze', 'wind', 'explosion', 'beam', 'rain'], 'explosion');
      e.visual_effect.color_primary = hexColor(e.visual_effect.color_primary, '#FFFFFF');
      e.visual_effect.color_secondary = hexColor(e.visual_effect.color_secondary, '#FFFF00');
      e.visual_effect.description = typeof e.visual_effect.description === 'string' ? e.visual_effect.description.slice(0, 200) : '';
    } else {
      e.visual_effect = { type: 'flash', style: 'explosion', color_primary: '#FFFFFF', color_secondary: '#FFFF00', description: '' };
    }
    if (e.visual && typeof e.visual === 'object') {
      e.visual.base_shape = oneOf(e.visual.base_shape, ['circle', 'ellipse', 'rectangle', 'triangle'], 'circle');
      e.visual.width = clampNum(e.visual.width, 16, 40, 24);
      e.visual.height = clampNum(e.visual.height, 16, 40, 24);
      e.visual.color_primary = hexColor(e.visual.color_primary, '#FFD700');
      e.visual.color_secondary = hexColor(e.visual.color_secondary, '#FFFFFF');
      if (Array.isArray(e.visual.features)) {
        e.visual.features = e.visual.features.slice(0, 5).map(sanitizeFeature).filter(Boolean);
      } else {
        e.visual.features = [];
      }
    }
  }

  return data;
}

// ── Handler ──

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { words, nocache } = req.body || {};
  if (!words?.creature || !words?.weapon || !words?.environment) {
    return res.status(400).json({ error: 'Missing required words (creature, weapon, environment)' });
  }

  // Check cache first (free, no rate limit cost) — skip if nocache
  if (!nocache) {
    const cached = await getCached(words);
    if (cached) {
      return res.status(200).json(cached);
    }
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
      sanitizeData(data);
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
