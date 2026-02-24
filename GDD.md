# Determined - Game Design Document

## 1. Overview

**Title:** Determined
**Genre:** Absurdist Action Platformer / Mad-Lib Sandbox
**Platform:** HTML5 (Web Browser - Desktop & Mobile)
**Engine:** Vanilla HTML5 Canvas + JavaScript (no framework)
**Inspiration:** Scribblenauts meets classic arcade, powered by an LLM
**Tone:** Absurdist, silly, creative -- lean into the chaos of player-chosen words creating ridiculous scenarios
**Deployment:** Vercel (static site + serverless API routes), auto-deployed on every commit
**Repository:** https://github.com/Randroids-Dojo/Determined

---

## 2. Concept

Players are prompted with three mad-lib style inputs at the start of each round. These words are fed into a predetermined prompt template and sent to a fast LLM (Groq). The LLM returns structured JSON that defines the obstacle, weapon, environment effect, and their associated game mechanics. The game then programmatically generates/composes visual assets and gameplay behaviors from that JSON.

The result: every round is unique, absurd, and shaped by the player's imagination.

**Tagline:** *"Your words. Your chaos. Your problem."*

---

## 3. Core Loop

```
┌─────────────────────────────────────────────────────┐
│  1. WORD ENTRY                                       │
│     Player enters 3 category-constrained words       │
│                         │                            │
│                         ▼                            │
│  2. GENERATION                                       │
│     Words → LLM prompt → Structured JSON             │
│     Loading screen with random flavor text            │
│                         │                            │
│                         ▼                            │
│  3. PLAY                                             │
│     Side-scroll single screen: get to the flag!      │
│     Use weapon to defeat obstacle                    │
│     Use environment item strategically               │
│     Die? Retry instantly. Death counter goes up.     │
│                         │                            │
│                         ▼                            │
│  4. VICTORY                                          │
│     Reach the flagpole (Mario-style)                 │
│     Enter 3-letter initials                          │
│     Score posted to global leaderboard               │
│     Option: Play again with new words                │
└─────────────────────────────────────────────────────┘
```

---

## 4. The Three Words (Mad-Lib System)

Each round, the player fills in three category-constrained slots:

| Slot | Category Hint | What It Becomes | Level 1 Example |
|------|--------------|-----------------|-----------------|
| 1 | "Enter a creature" | The obstacle blocking the path | "Lion" |
| 2 | "Enter a weapon" | The player's attack tool | "Sword" |
| 3 | "Enter a weather or force of nature" | A one-time-use environment item | "Lightning" |

### Input Rules
- Each input is a single word or short phrase (max 30 characters)
- Inputs are trimmed, lowercased, and sanitized before being sent to the LLM
- Profanity filter on input (basic blocklist)
- If a word has been generated before (exact match, case-insensitive), the cached result is returned instead of calling the LLM

### Prompt Template (Level 1)

The three words fill into a predetermined prompt template:

```
You are a creative game designer for an absurdist action game.
Given these three player-chosen words, generate game content as structured JSON.

CREATURE: {word_1}
WEAPON: {word_2}
ENVIRONMENT EFFECT: {word_3}

Generate a JSON response with the following structure:
{schema}
```

See [Section 8: LLM Integration](#8-llm-integration) for the full schema.

---

## 5. Gameplay - Level 1

### 5.1 Screen Layout

Single screen, no scrolling. The player must cross from the left side to the right side.

```
┌──────────────────────────────────────────────────┐
│  [weather/sky]                            🚩FLAG │
│                                           ┃      │
│                                           ┃      │
│                              ┌────┐       ┃      │
│  ╭─╮                        │OBST│       ┃      │
│  │P│                        │ACLE│       ┃      │
│──┴─┴────────────────────────┴────┴───────┸──────│
│  GROUND                                          │
│  [HP BAR]  [WEAPON ICON]  [ITEM: weather]        │
│  Deaths: 0   Time: 0:00                          │
└──────────────────────────────────────────────────┘
```

- **Player** starts on the far left
- **Obstacle** (creature) patrols a small area in the middle-right portion of the screen
- **Flagpole** is at the far right edge
- **HUD** shows health, weapon, environment item, death count, and elapsed time

### 5.2 Player Character

A stick figure. Simple, charming, intentionally lo-fi.

- **Visual:** Programmatically drawn on Canvas -- circle head, line body, line limbs
- **Animations:** Simple frame-based: idle (subtle bob), walk (leg alternation), jump (arms up), attack (weapon swing), death (ragdoll collapse), victory (arms raised)
  - *Implemented:* idle, walk, jump, attack, and victory poses all render. **Death ragdoll collapse is not yet implemented** — the stick figure freezes in its last pose. However, a "YOU DIED" overlay with red vignette and incrementing death count now displays during the 800ms death pause before restart.
  - *Hit feedback (implemented):* On taking damage the player receives directional knockback (pushed away from the damage source) and a 150ms red flash on the stick figure, in addition to the existing invincibility blink.
- **No customization** in Level 1 (future levels could allow this)

### 5.3 Control Scheme Philosophy

**Standard mappings used across all levels — new levels must follow these conventions:**

| Key | Role | Notes |
|-----|------|-------|
| `WASD` / Arrow keys | Movement | All 4 directions. In 2D levels left/right only. |
| `Space` | Jump (platformer) / Fire (shooter) | Context-dependent: jumps in L1/L2, fires in L3+ shooters |
| `Z` / `J` | Attack / Primary action | Both keys mapped identically. `Z` is canonical; `J` is an ergonomic alias. |
| `X` | Use Item / Secondary action | Environment item, bomb, special ability |
| `Q` / `E` | Camera rotate | 3D levels only |
| `R` | Reset/Retry | All levels |

**Design rules:**
- `Z` = primary action, `X` = secondary action. `J` is an alias for `Z` for players who prefer it.
- `W`/`↑` move forward in 3D levels — **never bind them to jump in any level with forward movement**.
- `Space` jumps in platformer levels and fires in shooter levels. Do not add jump to shooter levels.
- Touch controls mirror keyboard: `⚔` = Z/J, `★` = X, `▲` = Space (context-appropriate label per level).

### 5.3a Level 1 Controls (2D Platformer)

| Action | Keyboard | Touch | Description |
|--------|----------|-------|-------------|
| Move Left/Right | `A`/`D` or `←`/`→` | `◀` `▶` | Walk |
| Jump | `W` or `↑` or `Space` | `▲` | Gravity-based arc |
| Attack | `Z` / `J` | `⚔` | Use weapon on nearby obstacle |
| Use Item | `X` | `★` | Trigger environment effect (one-time, pick up first) |
| Reset | `R` | `↺` | Restart round, increment death counter |

### 5.3b Level 2 Controls (3D Arena)

| Action | Keyboard | Touch | Description |
|--------|----------|-------|-------------|
| Move (all dirs) | `WASD` or Arrows | Left joystick | Camera-relative 8-dir movement |
| Jump | `Space` | `▲` | **Space only** — W/↑ move forward, not jump |
| Attack | `Z` / `J` | `⚔` | Weapon swing toward obstacle |
| Use Item | `X` | `★` | Trigger environment effect |
| Rotate Camera | `Q` / `E` | Right joystick / drag | Orbit camera left/right |
| Reset | `R` | `↺` | Restart round |

### 5.3c Level 3 Controls (2D Space Shooter)

| Action | Keyboard | Touch | Description |
|--------|----------|-------|-------------|
| Move (all dirs) | `WASD` or Arrows | `◀` `▶` `▲` `▼` | 8-directional thrust |
| Fire | `Z` / `J` or `Space` | `⚔` | Shoot toward nearest enemy (cooldown-gated) |
| Bomb | `X` | `★` | One-use: destroys all enemies on screen |

### 5.3d Level 4 Controls (Isometric Voxel Farm)

| Action | Keyboard | Touch | Description |
|--------|----------|-------|-------------|
| Move (all dirs) | `WASD` or Arrows | `◀` `▶` `▲` `▼` | Isometric 8-dir (W=NW, S=SE, A=SW, D=NE on screen) |
| Milk | `Z` / `J` (hold) | `⚔` (hold) | Hold near a cow to fill a bottle (~2 seconds) |
| Deliver | Walk to farmhouse door | — | Auto-delivers when player steps into the glowing doorway |

Touch controls display as on-screen button overlays. Only rendered on devices with touch support.

### 5.4 The Obstacle (Creature)

Generated from Word 1. The creature:

- **Patrols** a small area (paces back and forth within a ~20% section of the screen)
- **Attacks** the player if they get close (enters aggro range)
- **Has health** that must be depleted to defeat it (or player can try to sneak past)
- **Blocks the path** -- positioned such that the player must deal with it to reach the flag
- **Death animation (implemented):** On death, the obstacle plays a 600ms fade-out + shrink animation (shrinks to 40% scale while fading to transparent) instead of disappearing instantly

**LLM-Generated Properties:**
- Name and visual description (used to programmatically compose the sprite)
- Health points
- Attack damage
- Attack pattern (melee swipe, charge, projectile, etc.)
  - *Note:* `charge` is listed in the schema but currently treated identically to `melee` in `obstacle.js`. No distinct rushing behavior exists yet.
- Movement speed
- Aggro range
- Weakness (ties to potential weapon effectiveness)
- Flavor text (displayed on first encounter)
- Color palette (primary, secondary, accent)

### 5.5 The Weapon

Generated from Word 2. The weapon:

- **Equips automatically** when the round starts
- **Has an attack pattern** determined by the LLM (melee swing, projectile, area-of-effect, etc.)
- **Deals damage** of a specific type (fire, ice, blunt, sharp, electric, etc.)
- **May have special properties** (knockback, poison, stun, etc.)

**Visual feedback (implemented):**
- Melee and area attacks display a fading slash arc in the weapon's primary colour during the attack cooldown window
- Projectile weapons render projectiles using the weapon's `visual` data (scaled to 50%) instead of plain circles
- The weapon sprite is shown next to the player during the attack pose

**LLM-Generated Properties:**
- Name and visual description
- Damage amount
- Damage type (fire, ice, electric, blunt, sharp, poison, holy, dark, etc.)
- Attack pattern: `melee` | `projectile` | `area`
- Range
- Cooldown (seconds between attacks)
- Special effect (knockback, stun, burn, freeze, etc.)
  - *Note:* `knockback`, `stun`, and `freeze` are handled by `applySpecialEffect()` in `weapon.js`. `burn` is listed in the schema but currently has no effect handler — it falls through silently.
- Effectiveness multiplier against the obstacle's weakness
- Color palette

### 5.6 The Environment Item (Weather/Force of Nature)

Generated from Word 3. This is a **one-time-use item** that:

- **Must be picked up first (implemented):** The player must walk to the item's position on the field before it can be used. Pressing X does nothing until the item has been collected.
- **Pickup cue (implemented):** A floating, bobbing icon with a pulsing glow appears on the play field (at ~35% of canvas width) showing the item name and `[X]` key hint. The icon is an **LLM-generated shape visual** based on the environment keyword (e.g., a lightning bolt shape for "Lightning", a flame shape for "Fire") — rendered with `drawVisual()` just like creature and weapon sprites. Falls back to the first letter of the keyword if no visual is available. Disappears once picked up.
- **HUD states (implemented):** Before pickup the HUD shows `⚡ [Keyword] (find it!)` in gray. After pickup it shows `⚡ [Item Name] [X]` in blue. After use it shows `⚡ [Item Name] (used)` in gray.
- **Pickup sound (implemented):** A short ascending two-tone triangle wave plays when the player walks over the item.
- When activated, triggers a **keyword-matched targeted effect** aimed at the obstacle's position
- **Targeted effect system (implemented):** Instead of a generic full-screen flash, effects are now matched to the environment keyword using a `style` field. Seven styles are supported:
  - `bolt` — Lightning zigzag from sky to obstacle with flickering segments + spark particles at impact
  - `flames` — Fire particles rising from under the obstacle, continuously respawning during the effect
  - `freeze` — Diamond-shaped ice crystal particles radiating outward + expanding frost ring
  - `wind` — Debris particles spiraling around the obstacle
  - `explosion` — Expanding shockwave ring + debris particles with gravity (default/fallback)
  - `beam` — Vertical glowing column of light from sky to obstacle
  - `rain` — Dense falling streak particles across the screen, continuously respawning
- The ambient overlay (flash/weather/particles/overlay) still plays as a subtle background tint behind the targeted effect
- **Affects both the player AND the obstacle** -- strategic timing matters
- **Resets on death** -- the player gets the item back each retry (must pick it up again)
- Can be the key to victory or cause the player's own demise (absurdist chaos)

**LLM-Generated Properties:**
- Name and visual description
- Effect type (damage, stun, terrain change, buff/debuff, etc.)
- Damage amount (if applicable)
- Area of effect: `full_screen` | `targeted` | `zone`
- Duration (seconds, 0 for instant)
- Affects player: true/false + how
- Affects obstacle: true/false + how
- Visual effect: ambient overlay type + targeted animation style + color palette
- Pickup icon visual (44-50px shape-based icon composed from 6-10 features)
- Screen shake intensity (0-10)

**Examples of targeted effects in action:**
- "Lightning" → A jagged bolt shoots from the sky to the creature, sparks fly at impact
- "Earthquake" → Expanding shockwave ring + debris fly outward from the creature
- "Blizzard" → Ice crystals radiate outward from the creature, frost ring expands
- "Tornado" → Debris spirals around the creature in a vortex

---

## 6. Art Direction

### 6.1 Philosophy

**Janky is a feature, not a bug.** The art is programmatically generated/composed from LLM-output JSON. It will look lo-fi, weird, and sometimes hilariously wrong. This aligns with the absurdist tone.

Based on research from the GoDig project (which found AI image generation unreliable for game sprites), we use a **fully programmatic approach**:

- The LLM outputs structured descriptions (shapes, colors, sizes, behaviors)
- The game engine renders these descriptions using Canvas 2D drawing primitives
- Sprites are composed from basic shapes: circles, rectangles, lines, arcs, polygons

### 6.2 Visual Style

- **Player:** Stick figure (black lines, circle head, simple limbs)
- **Obstacles:** Composed from primitive shapes based on LLM description (e.g., a "lion" might be an orange circle body, smaller circle head, triangle ears, line tail, dot eyes)
- **Weapons:** Simple iconic shapes (sword = line + rectangle, gun = L-shape, etc.)
- **Environment Effects:** Keyword-matched targeted particle animations (bolt, flames, freeze, wind, explosion, beam, rain) layered over subtle full-screen ambient overlays, plus screen shake
- **Background:** Simple gradient sky, flat ground plane, flag at the end
- **Color:** LLM specifies color palettes per entity; the game renders with those colors
- **UI:** Clean, minimal, retro-pixel-font aesthetic

### 6.3 Sprite Composition System

The LLM returns a `visual` object for each entity containing:

```json
{
  "visual": {
    "base_shape": "circle",
    "width": 60,
    "height": 40,
    "color_primary": "#D4760A",
    "color_secondary": "#F5D070",
    "color_accent": "#2B1B0E",
    "features": [
      { "type": "circle", "x": 30, "y": -15, "radius": 15, "color": "#D4760A", "label": "head" },
      { "type": "triangle", "points": [[25, -28], [30, -38], [35, -28]], "color": "#D4760A", "label": "ear_left" },
      { "type": "triangle", "points": [[45, -28], [50, -38], [55, -28]], "color": "#D4760A", "label": "ear_right" },
      { "type": "circle", "x": 35, "y": -18, "radius": 2, "color": "#2B1B0E", "label": "eye_left" },
      { "type": "circle", "x": 45, "y": -18, "radius": 2, "color": "#2B1B0E", "label": "eye_right" },
      { "type": "arc", "x": 0, "y": 20, "radius": 30, "startAngle": 0, "endAngle": 3.14, "color": "#F5D070", "label": "tail" }
    ]
  }
}
```

A Canvas renderer interprets this JSON and draws the entity. Results will be charmingly imperfect.

---

## 7. Audio

### 7.1 Sound Effects

Simple retro beeps and boops. All sounds are generated programmatically using the **Web Audio API** (no audio files to load).

| Event | Sound |
|-------|-------|
| Jump | Short ascending beep |
| Attack | Quick noise burst / swoosh |
| Hit (deal damage) | Satisfying impact blip |
| Hit (take damage) | Low descending tone |
| Death | Sad descending scale + small explosion |
| Item Pickup | Short ascending two-tone (triangle wave) |
| Item Use | Dramatic rising tone |
| Victory (reach flag) | Ascending fanfare jingle (4-5 notes) |
| Menu Select | Click blip |

### 7.2 Music

No music in MVP. Future consideration: procedurally generated background loops using Web Audio API oscillators.

---

## 8. LLM Integration

### 8.1 Provider: Groq

**Model:** `llama-3.1-8b-instant`
- Speed: ~840 tokens/sec
- Cost: $0.05 input / $0.08 output per 1M tokens
- Context: 128K tokens
- Supports JSON mode (`response_format: { type: "json_object" }`)
- Free tier: 14,400 requests/day, 500K tokens/day

**Why Groq:** Extremely fast inference (sub-second responses), near-zero cost, free tier is generous enough for an indie game, OpenAI-compatible API.

### 8.2 API Architecture

The LLM is **never called directly from the browser**. All calls go through Vercel serverless functions to protect the API key and enforce rate limiting.

```
Browser → Vercel API Route (/api/generate) → Groq API
                    │
                    ├── Rate limit check (per-IP + global)
                    ├── Cache check (exact word match)
                    ├── If cached: return cached result
                    ├── If not cached: call Groq, cache result, return
                    └── Sanitize + validate response before returning
```

### 8.3 Rate Limiting

Two independent rate limits apply:

**Our own limits (Vercel KV):**

| Limit | Value | Window |
|-------|-------|--------|
| Per-IP | 10 generations | Rolling 1 hour |
| Global (all IPs) | 50 generations | Rolling 1 hour |

When hit, returns HTTP 429 with: *"The creative spirits are resting. Try again later, or use words that have been imagined before!"*

**Groq's token-per-minute (TPM) limit:**

| Model | TPM limit (free tier) |
|-------|----------------------|
| llama-3.1-8b-instant | 6,000 tokens/min |

Each generation request uses ~3,500–4,500 tokens. Two rapid back-to-back calls (e.g. initial generation immediately followed by REGENERATE) can exhaust the window. When Groq returns 429, the API surfaces it as HTTP 429 with the exact retry-after time: *"The creative spirits are recharging — try again in Xs!"*

Cached results (previously generated words) do **not** count against either limit.

### 8.4 Full JSON Schema

The LLM is asked to return the following structure:

```json
{
  "obstacle": {
    "name": "string - display name for the creature",
    "description": "string - short humorous flavor text shown on encounter",
    "health": "number - 50 to 200",
    "attack_damage": "number - 5 to 30",
    "attack_pattern": "melee | charge | projectile",
    "attack_cooldown": "number - seconds between attacks, 0.5 to 3.0",
    "movement_speed": "number - 1 to 5 (relative scale)",
    "aggro_range": "number - pixels, 80 to 200",
    "weakness": "string - damage type this creature is weak to",
    "visual": {
      "base_shape": "circle | rectangle | triangle",
      "width": "number",
      "height": "number",
      "color_primary": "string - hex color",
      "color_secondary": "string - hex color",
      "color_accent": "string - hex color",
      "features": [
        {
          "type": "circle | rectangle | triangle | line | arc | polygon",
          "label": "string - what this feature represents",
          "...shape-specific properties"
        }
      ]
    }
  },
  "weapon": {
    "name": "string - display name",
    "description": "string - short humorous description",
    "damage": "number - 10 to 50",
    "damage_type": "fire | ice | electric | blunt | sharp | poison | holy | dark | arcane",
    "attack_pattern": "melee | projectile | area",
    "range": "number - pixels, 30 to 200",
    "cooldown": "number - seconds, 0.2 to 2.0",
    "special_effect": "knockback | stun | burn | freeze | none",
    "special_effect_duration": "number - seconds, 0 to 3",
    "effectiveness_vs_obstacle": "number - multiplier, 0.5 to 3.0",
    "visual": {
      "base_shape": "line | rectangle | circle",
      "width": "number",
      "height": "number",
      "color_primary": "string - hex color",
      "color_secondary": "string - hex color",
      "features": [
        {
          "type": "circle | rectangle | triangle | line | arc | polygon",
          "label": "string",
          "...shape-specific properties"
        }
      ]
    }
  },
  "environment_item": {
    "name": "string - display name",
    "description": "string - what happens when activated",
    "effect_type": "damage | stun | terrain | buff | debuff | mixed",
    "damage": "number - 0 to 100 (0 if non-damaging)",
    "area_of_effect": "full_screen | targeted | zone",
    "duration": "number - seconds, 0 for instant effects",
    "affects_player": {
      "active": "boolean",
      "effect": "string - description of effect on player"
    },
    "affects_obstacle": {
      "active": "boolean",
      "effect": "string - description of effect on obstacle"
    },
    "screen_shake": "number - intensity 0 to 10",
    "visual_effect": {
      "type": "overlay | particles | flash | weather",
      "style": "bolt | flames | freeze | wind | explosion | beam | rain",
      "color_primary": "string - hex color",
      "color_secondary": "string - hex color",
      "description": "string - what it looks like"
    },
    "visual": {
      "base_shape": "circle | rectangle | triangle",
      "width": "number - 44 to 50",
      "height": "number - 44 to 50",
      "color_primary": "string - hex color",
      "color_secondary": "string - hex color",
      "features": [
        {
          "type": "circle | rectangle | triangle | line | arc | polygon",
          "label": "string",
          "...shape-specific properties"
        }
      ]
    }
  }
}
```

### 8.5 Validation & Fallbacks

The API route validates the LLM response against the schema. If the response is malformed:
1. Retry once with a stricter prompt
2. If still malformed, return fallback defaults with `"fallback": true` in the response body
3. Log the failure for debugging

**Groq rate limit (429):** Returned as HTTP 429 to the client (not a silent fallback). The error message embeds the exact retry-after seconds from Groq's response. The client displays a friendly error banner and preserves the user's existing asset.

**Fallback defaults:** Pre-defined defaults ensure the game is always playable even when the LLM fails. Fallback responses are intentionally **not** saved to `localStorage` — this prevents dummy content from appearing in the Asset Viewer and polluting previously generated assets.

**Deep sanitization (implemented):** After passing top-level structure validation, `sanitizeData()` in `api/generate.js` processes every field before returning the response to the client:
- All numeric fields are clamped to their schema ranges (e.g. `health` 50–200, `attack_damage` 5–30)
- Enum fields validated against allowed values (attack patterns, damage types, effect types, base shapes)
- Hex colour strings validated with regex; invalid values replaced with defaults
- String fields length-limited (names 60 chars, descriptions 200 chars)
- `visual.features` arrays capped at 8 items for creatures/weapons, 12 for environment item icons; each feature sanitized per shape type (circle gets `radius`, rectangle gets `width`/`height`, triangle/polygon get validated `points` arrays, etc.)
- Environment item `visual_effect.style` validated against 7 allowed styles (`bolt`, `flames`, `freeze`, `wind`, `explosion`, `beam`, `rain`); defaults to `explosion`
- Environment item `visual` (pickup icon) dimensions clamped to 30-60px, colours validated, features capped at 12

This runs server-side before caching, so cached results are also sanitized. Client-side clamping in `createObstacle()`, `createWeapon()`, and `createEnvironmentItem()` provides a second layer of defense.

---

## 9. Caching System

### 9.1 Strategy

Every unique word generates a unique game entity. Once generated, it is cached permanently (until the cache is explicitly cleared).

**Cache key format:** `{category}:{normalized_word}`
- Category: `obstacle`, `weapon`, `environment`
- Normalized: trimmed, lowercased
- Example: `obstacle:lion`, `weapon:sword`, `environment:lightning`

**Cache storage:** Vercel KV (Upstash Redis)
- Fast key-value lookups
- TTL: No expiration (persist until manually cleared or storage limit reached)
- Included in Vercel's Hobby plan (limited storage)

### 9.2 Cache Flow

```
Player enters "Lion" for creature
    │
    ▼
Normalize → "lion"
    │
    ▼
Check cache: GET obstacle:lion
    │
    ├── HIT → Return cached JSON (no LLM call, no rate limit cost)
    │
    └── MISS → Call LLM → Store result: SET obstacle:lion {json}
                                         → Return JSON
```

### 9.3 Benefits

- **Cost:** Repeated words cost $0 after first generation
- **Speed:** Cache hits return instantly vs. ~1s for LLM calls
- **Rate limits:** Cache hits don't count against generation limits
- **Consistency:** Same word always produces the same result
- **Community effect:** As more players use the game, the cache grows -- popular words become instant

---

## 10. Leaderboard

### 10.1 Data Stored Per Entry

| Field | Type | Description |
|-------|------|-------------|
| initials | string (3 chars) | Player's initials (entered on victory) |
| deaths | number | Total deaths across all 4 levels |
| time | number | Total elapsed time in seconds across all 4 levels |
| score | number | Level 3 space shooter kill score |
| bottles | number | Level 4 milk bottles delivered |
| word_1 | string | The creature word |
| word_2 | string | The weapon word |
| word_3 | string | The environment word |
| timestamp | ISO 8601 | When the run was completed |

### 10.2 Scoring & Ranking

One single global leaderboard. Entries are submitted after completing all 4 levels. Ranked by:
1. **Fewest deaths** (primary, across all levels)
2. **Fastest total time** (tiebreaker)

Score formula: `deaths * 10000 + time` (lower is better).

The `score` (L3 kills) and `bottles` (L4 deliveries) are displayed as bonus stats but do not affect ranking order.

### 10.3 Display

- Shown after completing Level 4
- Top 50 entries displayed
- Player's own entry highlighted — **not yet implemented**
- Columns: Rank, Initials, Deaths, Time, Score (L3), Bottles (L4), Words Used
- Also accessible from the main menu

### 10.4 Storage

Vercel KV (same Redis instance as the generation cache, different key prefix).

Key format: `leaderboard:entries` (sorted set, scored by deaths * 10000 + time)

### 10.5 Anti-Abuse

- Rate limit on leaderboard submissions: 1 per minute per IP, 20 per day per IP
- Maximum 5 leaderboard entries stored per IP
- Initials filtered for profanity
- No duplicate submissions for identical word combos from the same IP within 1 minute

---

## 11. Technical Architecture

### 11.1 Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | HTML5 Canvas + vanilla JS | Game rendering and logic |
| 3D (Level 2) | Three.js | Arena scene, OrbitControls |
| Styling | CSS | Menus, HUD overlay, responsive layout |
| Audio | Web Audio API | Retro sound effects (no audio files) |
| API | Vercel Serverless Functions (Node.js) | LLM proxy, rate limiting, cache |
| Cache/DB | Vercel KV (Upstash Redis) | Generation cache + leaderboard |
| LLM | Groq API (Llama 3.1 8B) | Content generation |
| Hosting | Vercel | CDN, auto-deploy on commit |

### 11.2 Project Structure

```
Determined/
├── index.html
├── styles.css
├── vercel.json
├── package.json
├── GDD.md
├── PRIORITIES.md
├── README.md
│
├── src/
│   ├── game.js             # Main state machine + game loop
│   ├── player.js           # L1 stick figure player
│   ├── obstacle.js         # L1 creature AI
│   ├── weapon.js           # L1 weapon mechanics
│   ├── environment.js      # L1 environment item effects
│   ├── renderer.js         # 2D canvas renderer / sprite composer
│   ├── physics.js          # AABB collision, gravity
│   ├── input.js            # Keyboard + touch input
│   ├── audio.js            # Web Audio API sound effects
│   ├── hud.js              # L1 HUD
│   ├── ui.js               # All menu/screen HTML overlays
│   ├── constants.js        # Balance constants, 102 flavor texts
│   ├── assetStore.js       # localStorage asset persistence
│   ├── assetViewer.js      # 4-panel asset detail viewer (2D/3D/Vector/Voxel)
│   │
│   ├── level2/
│   │   ├── level2.js       # L2 orchestration
│   │   ├── arena.js        # 3D arena geometry
│   │   ├── scene.js        # Three.js scene setup
│   │   ├── environment3d.js
│   │   ├── obstacle3d.js
│   │   ├── player3d.js
│   │   ├── weapon3d.js
│   │   └── hud3d.js
│   │
│   ├── level3/
│   │   ├── level3.js       # L3 orchestration
│   │   ├── spaceArena.js
│   │   ├── playerShip.js
│   │   ├── enemySwarm.js
│   │   ├── vectorRenderer.js  # Neon wireframe renderer
│   │   └── hud3.js
│   │
│   └── level4/
│       ├── level4.js       # L4 orchestration
│       ├── farmEnvironment.js  # 14×10 isometric farm map
│       ├── cowObstacle.js  # Voxel cow AI + drawing
│       ├── player4.js      # Isometric player movement
│       ├── voxelRenderer.js   # Isometric voxel engine
│       └── hud4.js
│
└── api/
    ├── generate.js         # Groq proxy, cache, rate limit
    ├── leaderboard.js      # Leaderboard CRUD (Vercel KV)
    └── random-words.js     # Random word suggestions
```

### 11.3 Deployment

- Vercel connected to GitHub repo (Randroids-Dojo/Determined)
- Auto-deploys on every push to `main`
- Preview deployments on PRs
- Environment variables set in Vercel dashboard:
  - `GROQ_API_KEY` -- Groq API key
  - `KV_REST_API_URL` -- Vercel KV connection URL
  - `KV_REST_API_TOKEN` -- Vercel KV auth token

### 11.4 API Routes

#### `POST /api/generate`

**Request:**
```json
{
  "words": {
    "creature": "lion",
    "weapon": "sword",
    "environment": "lightning"
  }
}
```

**Response (200):**
```json
{
  "obstacle": { "...generated obstacle data" },
  "weapon": { "...generated weapon data" },
  "environment_item": { "...generated environment item data" },
  "cached": false
}
```

**Error Responses:**
- `429` -- Rate limited; two sources: (1) our own per-IP/global limits, (2) Groq's token-per-minute limit. Both include a `retryAfter` field (seconds). Groq 429s embed the retry time directly in the `error` message string.
- `400` -- Invalid input (missing words)
- `200` with `"fallback": true` -- LLM validation failure after retry; fallback data returned so the game is always playable. Fallback responses are **not** saved to `localStorage`.

#### `GET /api/leaderboard`

Returns top 50 leaderboard entries.

#### `POST /api/leaderboard`

Submits a new leaderboard entry.

#### `GET /api/random-words`

Returns a set of random suggested words for creature, weapon, and environment categories. Used by the word entry screen to populate suggestion chips.

---

## 12. Loading Screen

While the LLM generates content (or cache is retrieved), the player sees a loading screen with randomly chosen flavor text.

### Flavor Text (102 pre-written messages)

Randomly selected from a pool of 102 messages in `constants.js`. Examples:

1. "Consulting the ancient word spirits..."
2. "Your words are being forged into reality..."
3. "Assembling pixels with questionable intent..."
4. "The universe is judging your word choices..."
5. "Generating chaos in 3... 2... 1..."
6. "Your stick figure is stretching and preparing..."
7. "Somewhere, a game designer is crying..."
8. "Warning: results may vary. Dramatically."
9. "The LLM is doing its best. No promises."
10. "Stand by for procedurally generated regret..."

---

## 13. Game Balance (Level 1 Defaults)

### Player Stats
| Stat | Value |
|------|-------|
| Health | 100 HP |
| Move Speed | 3 (relative) |
| Jump Height | ~120 pixels |
| Invincibility after hit | 1.0 seconds |

### LLM Output Constraints (enforced by validation)
| Property | Min | Max |
|----------|-----|-----|
| Obstacle Health | 50 | 200 |
| Obstacle Attack Damage | 5 | 30 |
| Obstacle Aggro Range | 80px | 200px |
| Weapon Damage | 10 | 50 |
| Weapon Cooldown | 0.2s | 2.0s |
| Environment Damage | 0 | 100 |
| Effectiveness Multiplier | 0.5x | 3.0x |

### Balance Intent
The game should be beatable in 1-5 attempts for a skilled player, even with a "bad" word combo. The fun comes from the absurdity, not frustration. The LLM is prompted to make things interesting but not impossible.

---

## 14. Future Levels & Expansion

All four planned levels are implemented. The table below reflects their actual implementations:

| Level | Status | Style | Description |
|-------|--------|-------|-------------|
| 1 | IMPLEMENTED | 2D side-scrolling platformer | Stick figure vs creature; get to the flagpole |
| 2 | IMPLEMENTED | 3D arena (Three.js) | Same LLM data, scaled stats; defeat creature in 3D |
| 3 | IMPLEMENTED | Neon vector wireframe space shooter | 90-second survival; kill as many as possible |
| 4 | IMPLEMENTED | Isometric voxel farm | Milk cows, deliver bottles, no combat |

### Future Feature Ideas
- **Word combos:** Certain word combinations trigger easter eggs or bonus content
- **Multiplayer:** Two players enter words -- one generates the level, one plays it
- **Daily challenge:** Pre-selected words, everyone competes on the same generated level
- **Word of the day:** Featured word that's free (doesn't count against rate limit)
- **Achievement system:** "Defeat a Dragon with a Banana" etc.
- **User-generated levels:** Players can craft custom prompt templates for new level types

---

## 15. MVP Scope (Level 1)

### Must Have (MVP)
- [x] Word entry screen (3 constrained category inputs)
- [x] Groq LLM integration via Vercel serverless function
- [x] Rate limiting (10/hr per IP, 50/hr global)
- [x] Exact-match caching via Vercel KV
- [x] Stick figure player with move, jump, attack, use item, reset
- [x] Programmatic sprite composition from LLM JSON
- [x] Single-screen level with obstacle, weapon, environment item
- [x] Obstacle with patrol, aggro, and attack behavior
- [x] Environment item as one-time use, resets on death
- [x] Flagpole victory trigger
- [x] Death counter and timer
- [x] Global leaderboard (Vercel KV)
- [x] Loading screen with flavor text
- [x] Retro sound effects (Web Audio API)
- [x] Keyboard controls (Arrows + WASD + attack/item keys)
- [x] Touch/mobile controls
- [x] Responsive layout (playable on mobile browsers)
- [x] Auto-deploy to Vercel on commit
- [x] Fallback defaults if LLM fails

All "Must Have" items have code implemented and deployed to Vercel. The Groq API key, Vercel KV, and auto-deploy are all confirmed working.

### Nice to Have (Post-MVP)
- [ ] More nuanced sprite composition (animations on generated entities)
- [x] Particle effects system — implemented for environment item activation (7 keyword-matched styles: bolt, flames, freeze, wind, explosion, beam, rain)
- [ ] More weapon attack patterns
- [ ] Sound effects that vary based on damage type
- [ ] Share results (screenshot / link)
- [ ] PWA support (offline play with cached content)
- [ ] Analytics dashboard for popular words
- [x] Additional levels (2-5) — L2, L3, and L4 all implemented
- [x] Asset viewer improvements — 4-panel viewer (2D/3D/Vector/Voxel) added

### Known Issues

No critical issues at this time. Previously, triggering REGENERATE immediately after a fresh generation would silently replace the asset with fallback content ("Shockwave") due to Groq's 6000 TPM limit being exceeded. This is now handled — the error is surfaced and the original asset is preserved.

### Remaining Work (within MVP features)

These items are part of features that are otherwise implemented but have gaps compared to what this GDD describes:

- **Death ragdoll collapse (Section 5.2):** The GDD describes a "ragdoll collapse" animation for the stick figure. The stick figure still freezes in its last pose on death. The "YOU DIED" overlay provides visual feedback, but the stick figure itself has no collapse/ragdoll animation.
- **Player leaderboard highlight (Section 10.3):** The player's own entry is not highlighted on the leaderboard.
- **Obstacle "charge" attack pattern (Section 8.4):** Listed as a valid `attack_pattern` in the JSON schema, but `obstacle.js` treats it identically to `melee`. No distinct rushing/charge behavior exists.
- **Weapon "burn" special effect (Section 8.4):** Listed in the schema but `applySpecialEffect()` in `weapon.js` only handles `stun`, `freeze`, and `knockback`. `burn` falls through with no effect.
- **Reset animation (Section 5.3):** The GDD originally described "Stick figure explodes" on reset. The current implementation restarts the round instantly with no explosion visual.

---

## 5.7 Level 2 — 3D Arena

Level 2 uses the same three words and the same LLM-generated JSON as Level 1, but renders the world in 3D using Three.js.

### Renderer
- Three.js scene with a procedurally built arena (walls, floor, ceiling geometry in `arena.js`)
- Meshes are constructed from the creature's `visual.features` data using semantic body-part mapping (head, body, limbs, etc.)
- OrbitControls with auto-rotate enabled; player can manually orbit with Q/E keys

### Stat Scaling
Obstacle stats are scaled up relative to Level 1 to account for the 3D space and camera perspective:
- **Health:** 1.8× the Level 1 value
- **Attack damage:** 1.5× the Level 1 value
- Movement and aggro range adjusted for 3D coordinate space

### Camera
- Third-person orbit camera centered on the player
- Q/E rotate camera left/right around the player
- Auto-rotate slowly pans when the player is idle
- OrbitControls prevent the camera from going below the floor plane

---

## 5.8 Level 3 — Space Shooter

Level 3 is a 90-second survival arcade shooter with a neon vector wireframe aesthetic.

### Renderer
- Canvas 2D with a dark space background and procedural starfield
- All entities drawn with `drawVectorVisual()` — neon glow wireframe outlines instead of filled shapes
- Environment item icons use `'#AAFF44'` as their vector color
- Ship, enemies, and projectiles are all rendered as glowing vector outlines

### Gameplay
- **Duration:** 90 seconds; the level ends when the timer expires
- **Lives:** 3 lives; losing all lives ends the run early
- **Enemies:** Spawned continuously from the edges of the screen in waves; inspired by Asteroids
- **Objective:** Survive the full 90 seconds and kill as many enemies as possible
- **Bomb:** X key destroys all enemies currently on screen (one-use per life)

### Score
- Each enemy killed increments the score counter
- Final score is saved to the leaderboard as the `score` field
- Score is displayed in the HUD during play and on the victory screen

---

## 5.9 Level 4 — Enchanted Farm

Level 4 is a peaceful isometric voxel farming level with no combat.

### Renderer
- Isometric voxel engine in `voxelRenderer.js`
- Voxels drawn as 3-face parallelogram cubes (top face, left-side face, right-side face)
- `drawVoxelAt(x, y, z, color)` is the core primitive
- `drawCow()` renders the voxel cow creature using LLM `color_primary`, `color_secondary`, and `color_accent`

### Map
- **Grid:** 14×10 isometric voxel tile map
- **Layout:** Pasture tiles, fence border, farmhouse (with golden delivery door), and stone paths
- **Cows:** Fantasy cows (generated from Word 1) roam peacefully; no aggro, no combat
- Cow visual colors are taken from the LLM creature `visual.color_primary`, `color_secondary`, and `color_accent` fields

### Gameplay Loop
1. Player walks through the pasture to reach a cow
2. Hold Z near a cow to fill a milk bottle (~2 seconds to fill)
3. Walk to the farmhouse's golden glowing door to deliver the bottle
4. Repeat until time runs out

### Scoring
- **Duration:** 90 seconds
- **Bottles delivered** are counted and saved to the leaderboard as the `bottles` field
- There is no health or combat — the challenge is efficiency and navigation

---

## 16. Asset Viewer

The Asset Viewer is accessible from the main menu via the **ASSETS** button. It lets players browse all creatures, weapons, and environments they have previously generated.

### Asset Storage

Generated assets are stored in the browser's `localStorage` via `assetStore.js`. Assets are keyed and deduplicated by `word + type` (e.g., `obstacle:lion`). The store persists across sessions until the browser storage is cleared. Assets are added automatically whenever a new generation is completed.

### Asset List

The viewer shows a scrollable list of all stored assets grouped by type (Creatures, Weapons, Environments). Selecting any entry opens the detail view.

### Detail View — 4 Panels

Each asset is shown in four rendering panels simultaneously:

| Panel | Style | Description |
|-------|-------|-------------|
| **2D** | Canvas 2D primitives | Rendered with `drawVisual()` exactly as seen in Level 1 |
| **3D** | Three.js with OrbitControls | Meshes built from `visual.features`; creature uses semantic body-part mapping; environment panel uses handcrafted effect-specific geometry (bolt shape, snowflake spikes, torus tornado, etc.) |
| **VECTOR** | Neon wireframe | Rendered with `drawVectorVisual()`; neon glow outlines on dark background, matching Level 3 style |
| **VOXEL** | Isometric voxel | Rendered with isometric voxel engine; creatures use `drawCow()` with LLM colors; weapons use a voxel sword shape; environments use a glowing voxel stack |

### REGENERATE Button

Each asset detail view includes a REGENERATE button that re-calls the LLM (with `nocache: true`) to produce fresh art for that word.

**On success:** The new result overwrites the cached version in both Vercel KV and `localStorage`.

**On failure:** The original asset is preserved in `localStorage`. A red error banner is shown above the asset header explaining what went wrong:
- Groq TPM rate limit → *"The creative spirits are recharging — try again in Xs!"*
- LLM validation failure → *"Generation failed — your original asset is preserved. Try again!"*
- Network or unexpected error → *"Something went wrong — your original asset is preserved. Try again!"*

Fallback data is never saved on regenerate failure, so other assets from the same word set are unaffected.

---

## 17. References

- **Scribblenauts** -- Primary gameplay inspiration (words create objects with real game behaviors)
- **Block-You** -- Deployment pattern reference (https://github.com/Randroids-Dojo/Block-You)
- **GoDig Art Research** -- Art generation learnings (https://github.com/Randroids-Dojo/GoDig/tree/main/Docs)
- **Groq API** -- LLM provider (https://console.groq.com)
