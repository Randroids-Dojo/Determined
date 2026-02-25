/**
 * level3.js — Main Level 3 orchestrator.
 * Asteroids-style vector wireframe space shooter on the 2D game-canvas.
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import { initArena, updateArena, drawArena, addGridRipple } from './spaceArena.js';
import {
  drawPlayerShip, drawBullet, drawEngineGlow, drawExplosion,
  createExplosion, updateExplosion, drawVectorVisual,
} from './vectorRenderer.js';
import {
  createPlayerShip, updatePlayerShip,
  shootIfReady, hitPlayerShip, isPlayerDead,
} from './playerShip.js';
import {
  createEnemySwarm, updateEnemies, killEnemy,
  checkBulletHits, checkPlayerHit, checkEnemyPlayerCollision,
  respawnEnemies, drawEnemy,
} from './enemySwarm.js';
import { drawHUD3 } from './hud3.js';
import { pollInput, showTouchL3Controls } from '../input.js';

// ── Constants ──
const ENEMY_TARGET_COUNT = 8;
const ENEMY_RESPAWN_THRESHOLD = 6;
const GAME_DURATION = 90;          // seconds
const PLAYER_RADIUS = 10;

// ── Module-level state ──
let canvas = null;
let ctx = null;
let animFrameId = null;
let running = false;

let ship = null;
let enemies = [];
let playerBullets = [];
let enemyBullets = [];
let explosions = [];   // Array of particle arrays
let shipTrail = [];    // Recent ship positions for engine trail

let score = 0;
let timeRemaining = GAME_DURATION;
let lives = 3;
let gameOver = false;
let gameOverTimer = 0;
let won = false;

let lastTimestamp = 0;
let elapsedSec = 0;    // total elapsed for wobble/animations

let enemyVisual = null;   // LLM visual for enemies
let weaponVisual = null;  // LLM visual for player bullets
let envItemData = null;   // Full environment_item data for bomb
let bombAvailable = true; // One bomb per game
let bombActive = false;   // Currently animating
let bombTimer = 0;        // Animation progress (ms)
const BOMB_DURATION = 800; // ms for the flash animation
let onVictoryCallback = null;
let prevDeaths = 0;
let prevTimeMs = 0;
let startTime = 0;

/**
 * Initialize and start Level 3.
 *
 * @param {Object} data — LLM-generated content (obstacle, weapon, environment_item)
 * @param {number} _prevDeaths — death count from previous levels
 * @param {number} _prevTimeMs — elapsed time from previous levels
 * @param {Object} words — { creature, weapon, environment }
 * @param {Function} onVictory — callback(totalDeaths, totalTimeMs, score)
 */
export function startLevel3(data, _prevDeaths, _prevTimeMs, _words, onVictory) {
  // Grab the 2D canvas (game-canvas is already visible after Level 2 cleanup)
  canvas = document.getElementById('game-canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  ctx = canvas.getContext('2d');

  onVictoryCallback = onVictory;
  prevDeaths = _prevDeaths || 0;
  prevTimeMs = _prevTimeMs || 0;
  startTime = Date.now();

  // Extract visuals from data
  enemyVisual = data?.obstacle?.visual || null;
  weaponVisual = data?.weapon?.visual || null;
  envItemData = data?.environment_item || null;

  // Init subsystems
  initArena(CANVAS_WIDTH, CANVAS_HEIGHT, envItemData);

  ship = createPlayerShip();
  enemies = createEnemySwarm(ENEMY_TARGET_COUNT, CANVAS_WIDTH, CANVAS_HEIGHT);
  playerBullets = [];
  enemyBullets = [];
  explosions = [];
  shipTrail = [];

  score = 0;
  timeRemaining = GAME_DURATION;
  lives = 3;
  gameOver = false;
  gameOverTimer = 0;
  won = false;
  elapsedSec = 0;
  lastTimestamp = 0;
  bombAvailable = true;
  bombActive = false;
  bombTimer = 0;

  running = true;

  // Show Level 3 touch controls (d-pad + fire/bomb buttons, no jump)
  showTouchL3Controls();

  requestAnimationFrame(gameLoop);
}

// ── Game loop ──

function gameLoop(timestamp) {
  if (!running) return;
  animFrameId = requestAnimationFrame(gameLoop);

  if (lastTimestamp === 0) lastTimestamp = timestamp;
  const dtMs = Math.min(timestamp - lastTimestamp, 100); // cap at 100ms to avoid spiral of death
  lastTimestamp = timestamp;
  const dt = dtMs / 1000;

  elapsedSec += dt;

  update(dt, dtMs);
  render();
}

// ── Update ──

function update(dt, dtMs) {
  const actions = pollInput(dt);

  if (gameOver || won) {
    gameOverTimer += dtMs;
    if (gameOverTimer >= 3000) {
      triggerVictory();
    }
    return;
  }

  // 1. Decrement timer
  timeRemaining -= dt;
  if (timeRemaining < 0) timeRemaining = 0;

  // 2. Update player ship
  updatePlayerShip(ship, actions, dt, CANVAS_WIDTH, CANVAS_HEIGHT, enemies);

  // Record ship trail for engine streak effect
  if (!ship.dead) {
    const spd = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    if (spd > 0.3) {
      shipTrail.unshift({ x: ship.x, y: ship.y });
      if (shipTrail.length > 18) shipTrail.pop();
    }
  }

  // 3. Fire on attack button press (respects cooldown — no auto-fire)
  if (actions.attack) {
    const bullet = shootIfReady(ship, enemies);
    if (bullet) playerBullets.push(bullet);
  }

  // Bomb (K/X) — kills all living enemies, screen flash
  if (actions.item && bombAvailable && !bombActive) {
    triggerBomb();
  }

  // Tick bomb animation
  if (bombActive) {
    bombTimer += dtMs;
    if (bombTimer >= BOMB_DURATION) {
      bombActive = false;
    }
  }

  // 4. Update player bullets (move, age, remove dead)
  for (const b of playerBullets) {
    b.x += b.vx;
    b.y += b.vy;
    b.life -= dtMs;
  }
  playerBullets = playerBullets.filter(b =>
    b.life > 0 &&
    b.x > -20 && b.x < CANVAS_WIDTH + 20 &&
    b.y > -20 && b.y < CANVAS_HEIGHT + 20,
  );

  // 5. Update enemies (move, get new enemy bullets)
  const newEnemyBullets = updateEnemies(enemies, ship.x, ship.y, dt, CANVAS_WIDTH, CANVAS_HEIGHT);
  enemyBullets.push(...newEnemyBullets);

  // Update enemy bullets
  for (const b of enemyBullets) {
    b.x += b.vx;
    b.y += b.vy;
    b.life -= dtMs;
  }
  enemyBullets = enemyBullets.filter(b =>
    b.life > 0 &&
    b.x > -20 && b.x < CANVAS_WIDTH + 20 &&
    b.y > -20 && b.y < CANVAS_HEIGHT + 20,
  );

  // 6. Check player bullet hits on enemies
  const { killed, hitBullets } = checkBulletHits(playerBullets, enemies);
  for (const enemy of killed) {
    score += killEnemy(enemy);
    explosions.push(createExplosion(enemy.x, enemy.y, '#00FFCC', 24));
    addGridRipple(enemy.x, enemy.y);
  }
  // Remove hit bullets
  const hitBulletSet = new Set(hitBullets);
  playerBullets = playerBullets.filter(b => !hitBulletSet.has(b));

  // 7. Check enemy bullets hitting player
  if (!ship.invincible && !ship.dead) {
    const hitByBullets = checkPlayerHit(ship.x, ship.y, PLAYER_RADIUS, enemyBullets);
    if (hitByBullets.length > 0) {
      for (const b of hitByBullets) b.life = 0;
      enemyBullets = enemyBullets.filter(b => b.life > 0);

      const died = hitPlayerShip(ship);
      spawnHitFlash(ship.x, ship.y);
      if (died) {
        handlePlayerDeath();
        return;
      } else {
        lives = ship.lives;
      }
    }
  }

  // 8. Check enemy contact with player
  if (!ship.invincible && !ship.dead) {
    const contactEnemies = checkEnemyPlayerCollision(enemies, ship.x, ship.y, PLAYER_RADIUS);
    if (contactEnemies.length > 0) {
      // Kill first contacting enemy and damage player
      const firstEnemy = contactEnemies[0];
      score += killEnemy(firstEnemy);
      explosions.push(createExplosion(firstEnemy.x, firstEnemy.y, '#FF8800', 20));
      addGridRipple(firstEnemy.x, firstEnemy.y);

      const died = hitPlayerShip(ship);
      spawnHitFlash(ship.x, ship.y);
      if (died) {
        handlePlayerDeath();
        return;
      } else {
        lives = ship.lives;
      }
    }
  }

  // 9. Update explosions
  explosions = explosions
    .map(particles => updateExplosion(particles, dt))
    .filter(particles => particles.length > 0);

  // Update arena
  updateArena(dt);

  // 10. Respawn enemies if count < threshold
  const livingCount = enemies.filter(e => !e.dead).length;
  if (livingCount < ENEMY_RESPAWN_THRESHOLD) {
    respawnEnemies(enemies, ENEMY_TARGET_COUNT, CANVAS_WIDTH, CANVAS_HEIGHT, ship.x, ship.y);
  }
  // Prune dead enemies to avoid unbounded array growth
  if (enemies.length > 100) {
    enemies = enemies.filter(e => !e.dead);
    // Keep dead enemies briefly for explosion purposes (already handled above)
  }

  // 11. Check win (timer expired)
  if (timeRemaining <= 0) {
    won = true;
    gameOverTimer = 0;
    return;
  }

  // 12. Check game over (no lives)
  if (isPlayerDead(ship)) {
    gameOver = true;
    gameOverTimer = 0;
  }
}

// ── Render ──

function render() {
  if (!ctx) return;

  // 1. Draw space arena background
  drawArena(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

  const livingEnemies = enemies.filter(e => !e.dead);

  // 2. Draw enemy bullets — glowing orbs with hot core
  for (const b of enemyBullets) {
    const alpha = Math.min(1, b.life / 300);
    ctx.save();
    ctx.globalAlpha = alpha;
    // Outer glow
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#FF2200';
    ctx.fillStyle = '#FF3322';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Bright core
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#FFBBAA';
    ctx.fillStyle = '#FFDDCC';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Draw enemies
  for (const enemy of livingEnemies) {
    drawEnemy(ctx, enemy, enemyVisual, elapsedSec);
  }

  // 4. Draw player bullets — use the weapon visual if available, else laser bolt
  const BULLET_SCALE = 0.3;
  for (const b of playerBullets) {
    const angle = Math.atan2(b.vx, -b.vy);
    if (weaponVisual) {
      const glowColor = weaponVisual.color_primary || '#00FFFF';
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);
      drawVectorVisual(ctx, weaponVisual, 0, 0, BULLET_SCALE, glowColor, glowColor);
      ctx.restore();
    } else {
      drawBullet(ctx, b.x, b.y, angle, b.color);
    }
  }

  // 5. Draw player ship — trail streak, engine glow, then hull
  if (!ship.dead) {
    const blink = ship.invincible && Math.floor(elapsedSec * 10) % 2 === 0;

    // Engine trail streak
    if (!blink && shipTrail.length > 1) {
      ctx.save();
      for (let i = 1; i < shipTrail.length; i++) {
        const frac = 1 - i / shipTrail.length;
        ctx.globalAlpha = frac * 0.45;
        ctx.shadowBlur  = 10 * frac;
        ctx.shadowColor = '#44BBFF';
        ctx.fillStyle   = '#44BBFF';
        ctx.beginPath();
        ctx.arc(shipTrail[i].x, shipTrail[i].y, 2.5 * frac, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (!blink) {
      // Engine glow (intensity proportional to ship speed)
      const spd = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
      const intensity = Math.min(1, spd / 6);
      drawEngineGlow(ctx, ship.x, ship.y, ship.angle, intensity);

      drawPlayerShip(ctx, ship.x, ship.y, ship.angle, '#EEFFFF');
    }
  }

  // 6. Draw explosions
  for (const particles of explosions) {
    drawExplosion(ctx, particles);
  }

  // 6b. Draw bomb flash (over everything except HUD)
  drawBombFlash(ctx);

  // 7. Draw HUD
  const livingCount = livingEnemies.length;
  const bombColor = envItemData?.visual_effect?.color_primary || null;
  drawHUD3(ctx, score, timeRemaining, lives, 3, CANVAS_WIDTH, CANVAS_HEIGHT, livingCount, bombAvailable, bombColor);

  // 8. Overlays
  if (gameOver) {
    drawGameOverOverlay(ctx);
  } else if (won) {
    drawVictoryOverlay(ctx);
  }
}

// ── Helpers ──


function triggerBomb() {
  bombAvailable = false;
  bombActive = true;
  bombTimer = 0;

  const bombColor = envItemData?.visual_effect?.color_primary || '#FFFFFF';

  // Kill all living enemies, add score, spawn explosions
  for (const enemy of enemies) {
    if (!enemy.dead) {
      score += killEnemy(enemy);
      explosions.push(createExplosion(enemy.x, enemy.y, bombColor, 20));
    }
  }

  // Clear all enemy bullets
  enemyBullets = [];
}

function drawBombFlash(ctx) {
  if (!bombActive) return;

  const progress = bombTimer / BOMB_DURATION;          // 0 → 1
  const c1 = envItemData?.visual_effect?.color_primary || '#FFFFFF';
  const c2 = envItemData?.visual_effect?.color_secondary || c1;

  // Phase 1 (0–0.3): bright flash fills the screen
  // Phase 2 (0.3–1.0): fades out with an expanding ring
  if (progress < 0.3) {
    const flashAlpha = (1 - progress / 0.3) * 0.85;
    ctx.save();
    ctx.fillStyle = c1;
    ctx.globalAlpha = flashAlpha;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  } else {
    const fadeProgress = (progress - 0.3) / 0.7;
    const ringRadius = fadeProgress * Math.max(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ringAlpha = (1 - fadeProgress) * 0.6;

    ctx.save();
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = c2;
    ctx.lineWidth = 6 * (1 - fadeProgress) + 1;
    ctx.shadowBlur = 20;
    ctx.shadowColor = c1;
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function spawnHitFlash(x, y) {
  explosions.push(createExplosion(x, y, '#FFFFFF', 8));
}

function handlePlayerDeath() {
  lives = ship.lives;
  gameOver = true;
  gameOverTimer = 0;
  shipTrail = [];
  explosions.push(createExplosion(ship.x, ship.y, '#4488FF', 30));
}

function drawGameOverOverlay(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.shadowBlur = 20;
  ctx.shadowColor = '#FF2222';
  ctx.fillStyle = '#FF3333';
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

  ctx.shadowBlur = 10;
  ctx.shadowColor = '#FF8888';
  ctx.fillStyle = '#FF8888';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`SCORE: ${String(score).padStart(6, '0')}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);

  ctx.restore();
}

function drawVictoryOverlay(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.shadowBlur = 20;
  ctx.shadowColor = '#00FFCC';
  ctx.fillStyle = '#00FFEE';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SECTOR CLEAR', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

  ctx.shadowBlur = 10;
  ctx.shadowColor = '#FFEE44';
  ctx.fillStyle = '#FFE033';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`SCORE: ${String(score).padStart(6, '0')}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);

  ctx.restore();
}

function triggerVictory() {
  running = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  const totalElapsedMs = (Date.now() - startTime) + prevTimeMs;
  const level3Deaths = 3 - Math.max(0, ship ? ship.lives : 0);
  const totalDeaths = prevDeaths + level3Deaths;

  if (onVictoryCallback) {
    onVictoryCallback(totalDeaths, totalElapsedMs, score);
  }
}

/**
 * Stop the Level 3 game loop. The game-canvas stays visible.
 */
export function cleanupLevel3() {
  running = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Reset state refs
  ship = null;
  enemies = [];
  playerBullets = [];
  enemyBullets = [];
  explosions = [];
  shipTrail = [];
  enemyVisual = null;
  weaponVisual = null;
  envItemData = null;
  ctx = null;
  canvas = null;
  onVictoryCallback = null;
}

/**
 * Get current Level 3 state for external queries.
 */
export function getLevel3State() {
  return { score, timeRemaining, lives, running, gameOver, won };
}
