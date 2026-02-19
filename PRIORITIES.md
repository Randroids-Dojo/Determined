# Determined — Next Priorities

The MVP is complete: word entry, LLM generation (Groq), stick-figure gameplay, leaderboard, and auto-deploy to Vercel are all implemented. This document lays out what to tackle next, ordered by impact.

---

## Priority 1 — Production Hardening

The game is built but hasn't been battle-tested in a real environment. These items make it reliably playable for real users.

### 1a. Verify Vercel deployment end-to-end
- Confirm `GROQ_API_KEY` is set in Vercel environment variables
- Confirm Vercel KV store is provisioned and connected (caching + leaderboard + rate limiting all depend on it)
- Test the full loop: menu → word entry → LLM generation → gameplay → victory → leaderboard
- Test the fallback path: what happens when `GROQ_API_KEY` is missing or KV is down

### 1b. Input validation hardening ✅
- ~~The `validateData()` function in `api/generate.js` only checks that top-level keys exist — it doesn't validate ranges, types, or visual structure. Malformed LLM output (e.g. `health: "lots"`, missing `visual.features`) could crash the client~~
- ~~Add numeric clamping on all LLM-output fields before returning to the client~~
- ~~Validate `visual.features` array items have required shape properties~~
- **Done:** Added `sanitizeData()` with deep validation of all obstacle, weapon, and environment fields — numeric clamping, enum validation, hex colour checks, string length limits, and per-feature-type shape property sanitization

### 1c. Cross-browser and mobile testing
- Test on Safari (Canvas 2D quirks), Firefox, and Chrome
- Test touch controls on iOS Safari and Android Chrome
- Verify the responsive layout handles narrow screens (< 400px wide)

---

## Priority 2 — Gameplay Polish

These improvements make the existing Level 1 feel more complete without adding new systems.

### 2a. Obstacle death animation ✅
- ~~Currently obstacles just disappear (`obstacle.dead = true` hides them). Add a brief death sequence: flash, shrink, or fade out, so defeating the creature feels satisfying.~~
- **Done:** Obstacle now plays a 600ms fade-out + shrink animation on death before disappearing

### 2b. Player feedback on hit ✅
- ~~The player has an invincibility window after being hit (`PLAYER_INVINCIBILITY_TIME`), but there's no visual flash or knockback. Add a brief blink/flash during invincibility frames so the player knows they got hit.~~
- **Done:** Player now receives directional knockback away from the damage source, plus a 150ms red flash on the stick figure. Existing invincibility blink still active.

### 2c. Weapon visual feedback ✅
- ~~Melee attacks only show the weapon sprite briefly. Consider a small slash arc or impact effect to make attacks feel more impactful.~~
- ~~Projectile weapons fire a plain circle — draw them using the weapon's `visual` data instead.~~
- **Done:** Melee/area attacks now show a fading slash arc in the weapon's primary colour. Projectiles render using the weapon's visual data (scaled down) instead of plain circles.

### 2d. Environment item pickup cue ✅
- ~~The environment item exists in game state but there's no visual indicator on the play field showing where it is or that it's available. Add a floating icon or glow at a fixed location the player can see.~~
- **Done:** A floating, bobbing icon with a pulsing glow appears on the play field showing the item name and [K] hint.
- **Extended:** Icon is now an LLM-generated shape visual based on the environment keyword (not a generic star). Player must walk to the icon to pick it up before it can be used (pickup sound plays, HUD updates). Disappears once collected.

### 2f. Keyword-matched environment effects ✅
- ~~Environment item activation was always a generic screen flash/overlay regardless of the keyword.~~
- **Done:** Effects now target the obstacle's position with keyword-matched animations: bolt (lightning zigzag), flames (rising fire particles), freeze (ice crystals + frost ring), wind (spiraling debris), explosion (shockwave ring + debris), beam (vertical light column), rain (falling streaks). The LLM picks the style via `visual_effect.style`. Ambient overlay still plays as subtle background tint.

### 2e. Death/restart screen ✅
- ~~On death, the game pauses 800ms then silently restarts. Consider a brief "You died" flash or the death counter incrementing visually, so the player understands what happened.~~
- **Done:** Red vignette overlay fades in on death with "YOU DIED" text and the incrementing death count before auto-restart.

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

## Priority 6 — Level 2 Expansion

Per the GDD, Level 2 introduces multiple obstacles and a new word category ("Sidekick").

### 6a. Multiple obstacles
- Generate 1-3 additional smaller creatures that patrol alongside the main obstacle
- Requires changes to: LLM prompt schema, `game.js` (loop over obstacles array), collision detection, rendering

### 6b. Sidekick word category
- Add a 4th word input: "Sidekick"
- LLM generates a friendly NPC that follows the player and assists (e.g. heals, distracts, blocks projectiles)
- New module: `src/sidekick.js`

---

## Priority 7 — Nice to Have (Post-MVP from GDD)

Lower urgency but noted for completeness:

- **Animated sprite composition** — Idle/walk/attack animations for generated creatures and weapons
- **Particle effects system** — ✅ Implemented for environment item effects (7 styles with spawning, physics, respawning). Remaining: dust on landing, sparks on hit
- **Dynamic sound effects** — Vary pitch/tone based on damage type and weapon
- **PWA support** — Service worker for offline play with cached content
- **Achievement system** — Track memorable combos ("Defeat a Dragon with a Banana")
- **Terrain generation** (Level 3) — Platforms, gaps, hazards
- **Boss battles** (Level 4) — Multi-phase creatures with pattern changes
- **Player transformation** (Level 5) — Become the creature

---

## How to read this list

- **Priorities 1–2** are about making the existing game solid. Do these before showing it to a wider audience.
- **Priority 3** is about growth. Do this before any marketing push.
- **Priorities 4–5** are about retention and learning. Do these as the player base grows.
- **Priorities 6–7** are about expansion. Do these when Level 1 is polished and you have data on what players enjoy.
