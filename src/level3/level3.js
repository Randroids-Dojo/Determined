/**
 * level3.js — Main Level 3 orchestrator.
 * Asteroids-style vector wireframe space shooter on the 2D game-canvas.
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import { initArena, updateArena, drawArena } from './spaceArena.js';
import {
  drawPlayerShip, drawBullet, drawExplosion,
  createExplosion, updateExplosion,
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
import { pollInput, showTouchL1Controls } from '../input.js';

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

let score = 0;
let timeRemaining = GAME_DURATION;
let lives = 3;
let gameOver = false;
let gameOverTimer = 0;
let won = false;

let lastTimestamp = 0;
let elapsedSec = 0;    // total elapsed for wobble/animations

let enemyVisual = null;  // LLM visual for enemies
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
export function startLevel3(data, _prevDeaths, _prevTimeMs, words, onVictory) {
  // Grab the 2D canvas (game-canvas is already visible after Level 2 cleanup)
  canvas = document.getElementById('game-canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  ctx = canvas.getContext('2d');

  onVictoryCallback = onVictory;
  prevDeaths = _prevDeaths || 0;
  prevTimeMs = _prevTimeMs || 0;
  startTime = Date.now();

  // Extract enemy visual from data (use obstacle visual as enemy sprite)
  enemyVisual = data?.obstacle?.visual || null;

  // Init subsystems
  initArena(CANVAS_WIDTH, CANVAS_HEIGHT);

  ship = createPlayerShip();
  enemies = createEnemySwarm(ENEMY_TARGET_COUNT, CANVAS_WIDTH, CANVAS_HEIGHT);
  playerBullets = [];
  enemyBullets = [];
  explosions = [];

  score = 0;
  timeRemaining = GAME_DURATION;
  lives = 3;
  gameOver = false;
  gameOverTimer = 0;
  won = false;
  elapsedSec = 0;
  lastTimestamp = 0;

  running = true;

  // Show L1-style touch controls (d-pad + attack button)
  showTouchL1Controls();

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

  // 3. Auto-shoot (shootIfReady) — add bullet to playerBullets
  const autoBullet = shootIfReady(ship, enemies);
  if (autoBullet) {
    playerBullets.push(autoBullet);
  }

  // Manual shoot burst on attack button (fires immediately ignoring cooldown)
  if (actions.attack) {
    const nearestBullet = forceShoot(ship, enemies);
    if (nearestBullet) {
      playerBullets.push(nearestBullet);
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
    explosions.push(createExplosion(enemy.x, enemy.y, '#00FFCC', 18));
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
      explosions.push(createExplosion(firstEnemy.x, firstEnemy.y, '#FF8800', 14));

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

  // 2. Draw enemy bullets
  for (const b of enemyBullets) {
    const alpha = Math.min(1, b.life / 300);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = b.color;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Draw enemies
  for (const enemy of livingEnemies) {
    drawEnemy(ctx, enemy, enemyVisual, elapsedSec);
  }

  // 4. Draw player bullets
  for (const b of playerBullets) {
    const angle = Math.atan2(b.vx, -b.vy);
    drawBullet(ctx, b.x, b.y, angle, b.color);
  }

  // 5. Draw player ship (blink when invincible)
  if (!ship.dead) {
    const blink = ship.invincible && Math.floor(elapsedSec * 10) % 2 === 0;
    if (!blink) {
      drawPlayerShip(ctx, ship.x, ship.y, ship.angle, '#00AAFF');
    }
  }

  // 6. Draw explosions
  for (const particles of explosions) {
    drawExplosion(ctx, particles);
  }

  // 7. Draw HUD
  const livingCount = livingEnemies.length;
  drawHUD3(ctx, score, timeRemaining, lives, 3, CANVAS_WIDTH, CANVAS_HEIGHT, livingCount);

  // 8. Overlays
  if (gameOver) {
    drawGameOverOverlay(ctx);
  } else if (won) {
    drawVictoryOverlay(ctx);
  }
}

// ── Helpers ──

/**
 * Force-fire a bullet toward nearest enemy (for manual attack button), bypassing cooldown.
 * Uses a short forced cooldown to prevent machine-gun spam.
 */
function forceShoot(ship, enemies) {
  if (ship.shootCooldown >= ship.shootInterval * 0.5) return null;

  let nearest = null;
  let nearestDist = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - ship.x;
    const dy = e.y - ship.y;
    const d = dx * dx + dy * dy;
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  if (!nearest) return null;

  ship.shootCooldown = ship.shootInterval * 0.5;

  const dx = nearest.x - ship.x;
  const dy = nearest.y - ship.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const BULLET_SPEED = 6;

  return {
    x: ship.x + nx * 14,
    y: ship.y + ny * 14,
    vx: nx * BULLET_SPEED,
    vy: ny * BULLET_SPEED,
    angle: Math.atan2(dx, -dy),
    life: 1200,
    maxLife: 1200,
    color: '#00FFFF',
  };
}

function spawnHitFlash(x, y) {
  explosions.push(createExplosion(x, y, '#FFFFFF', 8));
}

function handlePlayerDeath() {
  lives = ship.lives;
  if (isPlayerDead(ship)) {
    gameOver = true;
    gameOverTimer = 0;
    explosions.push(createExplosion(ship.x, ship.y, '#4488FF', 30));
  }
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
  ctx = null;
  canvas = null;
  onVictoryCallback = null;
}

/**
 * Get current Level 3 state for external queries.
 */
export function getLevel3State() {
  return { score, timeRemaining, lives, running, gameOver };
}
