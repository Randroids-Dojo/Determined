/**
 * enemySwarm.js — Enemy swarm management for Level 3.
 */

import { drawVectorVisual } from './vectorRenderer.js';

const ENEMY_BULLET_SPEED = 3.5;
const SAFE_SPAWN_RADIUS = 100; // min distance from player at spawn

let nextId = 1;

/**
 * Create a single enemy.
 *
 * @param {number} id
 * @param {number} cw — canvas width
 * @param {number} ch — canvas height
 * @param {number} playerX
 * @param {number} playerY
 * @returns {Object} enemy
 */
export function createEnemy(id, cw, ch, playerX, playerY) {
  // Spawn anywhere except within SAFE_SPAWN_RADIUS of player
  let x, y;
  let attempts = 0;
  do {
    x = Math.random() * cw;
    y = Math.random() * ch;
    attempts++;
  } while (
    attempts < 20 &&
    Math.sqrt((x - playerX) ** 2 + (y - playerY) ** 2) < SAFE_SPAWN_RADIUS
  );

  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    hp: 1,
    dead: false,
    speed: 0.8 + Math.random() * 0.5,
    size: 0.25 + Math.random() * 0.15,
    shootCooldown: Math.random() * 3000,
    shootInterval: 2000 + Math.random() * 2000,
    wobbleOffset: Math.random() * Math.PI * 2,
  };
}

/**
 * Create initial enemy swarm.
 *
 * @param {number} count
 * @param {number} cw
 * @param {number} ch
 * @returns {Array} enemies
 */
export function createEnemySwarm(count, cw, ch) {
  const enemies = [];
  const cx = cw / 2;
  const cy = ch / 2;
  for (let i = 0; i < count; i++) {
    enemies.push(createEnemy(nextId++, cw, ch, cx, cy));
  }
  return enemies;
}

/**
 * Update all enemies: move toward player, wrap edges, update shoot cooldowns.
 * Returns array of new enemy bullets fired this frame.
 *
 * @param {Array} enemies
 * @param {number} playerX
 * @param {number} playerY
 * @param {number} dt — seconds
 * @param {number} cw
 * @param {number} ch
 * @returns {Array} new enemy bullets
 */
export function updateEnemies(enemies, playerX, playerY, dt, cw, ch) {
  const dtMs = dt * 1000;
  const newBullets = [];

  for (const enemy of enemies) {
    if (enemy.dead) continue;

    // Move toward player
    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    enemy.vx = nx * enemy.speed;
    enemy.vy = ny * enemy.speed;

    // Angle faces player
    enemy.angle = Math.atan2(dx, -dy);

    enemy.x += enemy.vx;
    enemy.y += enemy.vy;

    // Screen wrap
    if (enemy.x < -20) enemy.x = cw + 20;
    if (enemy.x > cw + 20) enemy.x = -20;
    if (enemy.y < -20) enemy.y = ch + 20;
    if (enemy.y > ch + 20) enemy.y = -20;

    // Shoot cooldown
    enemy.shootCooldown -= dtMs;
    if (enemy.shootCooldown <= 0) {
      enemy.shootCooldown = enemy.shootInterval;

      // Fire bullet toward player
      newBullets.push({
        x: enemy.x + nx * 16,
        y: enemy.y + ny * 16,
        vx: nx * ENEMY_BULLET_SPEED,
        vy: ny * ENEMY_BULLET_SPEED,
        life: 1500,
        maxLife: 1500,
        color: '#FF4444',
        fromEnemy: true,
      });
    }
  }

  return newBullets;
}

/**
 * Mark enemy as dead and return score value.
 * @param {Object} enemy
 * @returns {number} score
 */
export function killEnemy(enemy) {
  enemy.dead = true;
  return 100;
}

/**
 * Check player bullets vs enemies. Returns killed enemies and hit bullets.
 *
 * @param {Array} bullets — player bullets
 * @param {Array} enemies
 * @returns {{ killed: Array, hitBullets: Array }}
 */
export function checkBulletHits(bullets, enemies) {
  const killed = [];
  const hitBullets = [];

  for (const bullet of bullets) {
    if (bullet.life <= 0) continue;
    for (const enemy of enemies) {
      if (enemy.dead) continue;

      const radius = enemy.size * 20;
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - enemy.y;
      if (dx * dx + dy * dy <= radius * radius) {
        killed.push(enemy);
        hitBullets.push(bullet);
        enemy.dead = true;
        bullet.life = 0; // consume bullet
        break;
      }
    }
  }

  return { killed, hitBullets };
}

/**
 * Check enemy bullets vs player. Returns bullets that hit.
 *
 * @param {number} playerX
 * @param {number} playerY
 * @param {number} playerRadius
 * @param {Array} enemyBullets
 * @returns {Array} bullets that hit the player
 */
export function checkPlayerHit(playerX, playerY, playerRadius, enemyBullets) {
  const hits = [];
  for (const bullet of enemyBullets) {
    if (bullet.life <= 0) continue;
    const dx = bullet.x - playerX;
    const dy = bullet.y - playerY;
    if (dx * dx + dy * dy <= playerRadius * playerRadius) {
      hits.push(bullet);
    }
  }
  return hits;
}

/**
 * Check if any enemy touched the player (contact damage).
 *
 * @param {Array} enemies
 * @param {number} playerX
 * @param {number} playerY
 * @param {number} playerRadius
 * @returns {Array} enemies that touched player
 */
export function checkEnemyPlayerCollision(enemies, playerX, playerY, playerRadius) {
  const touching = [];
  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const radius = enemy.size * 20 + playerRadius;
    const dx = enemy.x - playerX;
    const dy = enemy.y - playerY;
    if (dx * dx + dy * dy <= radius * radius) {
      touching.push(enemy);
    }
  }
  return touching;
}

/**
 * Respawn enemies until living count reaches target.
 *
 * @param {Array} enemies — existing enemy array (mutated in place)
 * @param {number} targetCount
 * @param {number} cw
 * @param {number} ch
 * @param {number} playerX
 * @param {number} playerY
 */
export function respawnEnemies(enemies, targetCount, cw, ch, playerX, playerY) {
  const living = enemies.filter(e => !e.dead).length;
  const needed = targetCount - living;
  for (let i = 0; i < needed; i++) {
    enemies.push(createEnemy(nextId++, cw, ch, playerX, playerY));
  }
}

/**
 * Draw a single enemy using drawVectorVisual with a wobble rotation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} enemy
 * @param {Object|null} visual — LLM visual descriptor
 * @param {number} elapsedSec — total elapsed seconds for wobble
 */
export function drawEnemy(ctx, enemy, visual, elapsedSec) {
  if (enemy.dead) return;

  const wobble = Math.sin(elapsedSec * 1.2 + enemy.wobbleOffset) * 0.25;
  const totalAngle = enemy.angle + wobble;

  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(totalAngle);

  const color = '#00FFCC';
  const glowColor = '#00FFCC';

  if (visual) {
    drawVectorVisual(ctx, visual, 0, 0, enemy.size, color, glowColor);
  } else {
    // Fallback: simple diamond wireframe
    const r = enemy.size * 18;
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.6, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.6, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
