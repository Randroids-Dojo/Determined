# Determined — Next Priorities

All four levels are fully implemented and deployed to Vercel. This document tracks what comes next, ordered by impact.

---

## Priority 1 — Production Hardening ✅

The game is deployed and has been battle-tested in a real environment.

### 1a. Verify Vercel deployment end-to-end ✅
- **Done:** `GROQ_API_KEY` confirmed set in Vercel environment variables
- **Done:** Vercel KV store provisioned and connected (caching + leaderboard + rate limiting all working)
- **Done:** Full loop tested: menu → word entry → LLM generation → gameplay → victory → leaderboard
- **Done:** Fallback path confirmed: returns pre-defined defaults when LLM fails; fallback data is not saved to localStorage
- **Done:** Groq TPM rate limit (6000 tokens/min) handled — rapid back-to-back calls now surface a proper 429 with retry-after seconds instead of silently serving fallback content

### 1b. Input validation hardening ✅
- **Done:** Added `sanitizeData()` with deep validation of all obstacle, weapon, and environment fields — numeric clamping, enum validation, hex colour checks, string length limits, and per-feature-type shape property sanitization

### 1c. Cross-browser and mobile testing
- Test on Safari (Canvas 2D quirks), Firefox, and Chrome
- Test touch controls on iOS Safari and Android Chrome
- Verify the responsive layout handles narrow screens (< 400px wide)

---

## Priority 2 — Gameplay Polish ✅

All Level 1 polish items are complete. Level 2, 3, and 4 polish is ongoing (see Priority 6).

### 2a. Obstacle death animation ✅
- **Done:** Obstacle plays a 600ms fade-out + shrink animation on death before disappearing

### 2b. Player feedback on hit ✅
- **Done:** Player receives directional knockback away from the damage source, plus a 150ms red flash on the stick figure. Existing invincibility blink still active.

### 2c. Weapon visual feedback ✅
- **Done:** Melee/area attacks show a fading slash arc in the weapon's primary colour. Projectiles render using the weapon's visual data (scaled down) instead of plain circles.

### 2d. Environment item pickup cue ✅
- **Done:** A floating, bobbing icon with a pulsing glow appears on the play field showing the item name and [X] hint. Player must walk to the icon to pick it up. Icon is an LLM-generated shape visual based on the environment keyword.

### 2e. Death/restart screen ✅
- **Done:** Red vignette overlay fades in on death with "YOU DIED" text and the incrementing death count before auto-restart.

### 2f. Keyword-matched environment effects ✅
- **Done:** Effects now target the obstacle's position with keyword-matched animations: bolt, flames, freeze, wind, explosion, beam, rain. The LLM picks the style via `visual_effect.style`.

---

## Priority 3 — Share & Virality

The game's appeal is showing people the absurd combinations. Sharing makes the game spread.

### 3a. Victory screenshot / share card
- After victory, generate a canvas-based share image showing: the creature name, weapon name, environment name, death count, time, and the creature's visual
- Add a "Share" button that uses `navigator.share()` (with clipboard fallback) to share the image or a text summary

### 3b. Shareable replay link
- Encode the three words into a URL parameter (e.g. `?c=dragon&w=banana&e=tornado`)
- When the game loads with these params, skip word entry and go straight to loading/generation
- This lets players challenge friends with the same combo

---

## Priority 4 — Analytics & Insights

Understanding what players actually do guides all future decisions.

### 4a. Track popular word combinations
- Log each generation request (words + timestamp) to Vercel KV or a simple analytics store
- Build a simple `/api/stats` endpoint that returns: total generations, top 10 creatures, top 10 weapons, top 10 environments, cache hit rate

### 4b. Track gameplay outcomes
- On victory/leaderboard submission, include: was it a cache hit or fresh generation, was fallback used, how many deaths before winning
- This data reveals whether certain word combos produce unbeatable or trivially easy levels

---

## Priority 5 — Daily Challenge

A recurring reason to come back — and a shared experience for the community.

### 5a. Word of the Day
- Pre-select three words daily (could be a simple rotating list stored in KV, or hardcoded for launch)
- Show a "Daily Challenge" button on the main menu alongside "Play"
- Daily challenge uses the same words for all players → same generated content (cache hit for everyone after the first player)
- Separate daily leaderboard that resets at midnight UTC

---

## Priority 6 — Level Polish

All four levels are implemented. This priority covers quality-of-life improvements and polish across L2, L3, and L4.

### 6a. Level 2 — Obstacle pathfinding
- The 3D obstacle currently uses simple patrol behavior; add proper 3D pathfinding so it navigates around the arena to reach the player
- Consider obstacle variety: 1-2 smaller secondary creatures patrolling alongside the main one

### 6b. Level 3 — Difficulty tuning
- Tune enemy spawn rates and wave composition for a better 90-second difficulty curve
- Add distinct enemy types (fast/fragile vs. slow/tanky) to vary the challenge

### 6c. Level 4 — LLM-generated farm layout
- Currently the 14×10 farm map is hardcoded; use the LLM environment data to influence tile placement, cow count, and path layout
- Add more variety to farmhouse and fence geometry based on the environment word

### 6d. Asset Viewer improvements
- Add filtering and sorting to the asset list (by type, by date generated)
- Add a "Compare" mode showing two assets side by side in the same render style
- Improve 3D panel lighting and shadow quality

---

## Priority 7 — Nice to Have

Lower urgency but noted for completeness:

- **Animated sprite composition** — Idle/walk/attack animations for generated creatures and weapons
- **More weapon attack patterns** — Expand beyond melee/projectile/area with ricochet, homing, etc.
- **Sound effects that vary by damage type** — Different tones for fire vs. ice vs. electric hits
- **Share results** — Screenshot and link sharing (see Priority 3)
- **PWA support** — Service worker for offline play with cached content
- **Analytics dashboard** — Popular words, cache hit rate (see Priority 4)
- **Achievement system** — "Defeat a Dragon with a Banana" etc.
- **Multiplayer** — Two players enter words; one generates the level, one plays it
- **Daily challenge** — Shared word combo with separate leaderboard (see Priority 5)

---

## How to read this list

- **Priorities 1–2** are complete. The game is solid and playable for a real audience.
- **Priority 3** is about growth. Do this before any marketing push.
- **Priorities 4–5** are about retention and learning. Do these as the player base grows.
- **Priority 6** is about deepening the existing four levels. Do this when players ask for more from L2/3/4.
- **Priority 7** is expansion and polish with no fixed timeline.
