/**
 * playerShip.js — Player spaceship entity for Level 3.
 * Direct 8-directional movement (not thrust/rotate like classic asteroids).
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';

const SHIP_SPEED = 0.15;       // acceleration per ms
const SHIP_MAX_SPEED = 4;      // px/frame equivalent
const SHIP_FRICTION = 0.92;    // velocity damping per update
const SHOOT_INTERVAL = 250;    // ms between shots (manual fire)
const INVINCIBLE_DURATION = 2000; // ms of invincibility after hit
const BULLET_SPEED = 6;        // px per frame (at 60fps)

/**
 * Create a new player ship at screen center.
 * @returns {Object} ship state
 */
export function createPlayerShip() {
  return {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    vx: 0,
    vy: 0,
    angle: 0,              // radians, 0 = up
    speed: SHIP_SPEED,
    maxSpeed: SHIP_MAX_SPEED,
    friction: SHIP_FRICTION,
    lives: 3,
    invincible: false,
    invincibleTimer: 0,
    shootCooldown: 0,
    shootInterval: SHOOT_INTERVAL,
    dead: false,
  };
}

/**
 * Update the player ship each frame.
 *
 * @param {Object} ship
 * @param {Object} actions — from pollInput()
 * @param {number} dt — delta time in seconds
 * @param {number} cw — canvas width
 * @param {number} ch — canvas height
 * @param {Array} enemies — for ship rotation toward nearest enemy
 */
export function updatePlayerShip(ship, actions, dt, cw, ch, enemies) {
  if (ship.dead) return;

  const dtMs = dt * 1000;

  // ── 8-directional movement ──
  let ax = 0;
  let ay = 0;

  if (actions.left)     ax -= 1;
  if (actions.right)    ax += 1;
  if (actions.forward)  ay -= 1;
  if (actions.backward) ay += 1;

  // Normalize diagonal
  if (ax !== 0 && ay !== 0) {
    const len = Math.sqrt(ax * ax + ay * ay);
    ax /= len;
    ay /= len;
  }

  // Accelerate
  const accel = ship.speed * dtMs;
  ship.vx += ax * accel;
  ship.vy += ay * accel;

  // Clamp speed
  const spd = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
  if (spd > ship.maxSpeed) {
    ship.vx = (ship.vx / spd) * ship.maxSpeed;
    ship.vy = (ship.vy / spd) * ship.maxSpeed;
  }

  // Friction
  ship.vx *= ship.friction;
  ship.vy *= ship.friction;

  // Clamp very small velocities to zero
  if (Math.abs(ship.vx) < 0.01) ship.vx = 0;
  if (Math.abs(ship.vy) < 0.01) ship.vy = 0;

  // Move
  ship.x += ship.vx;
  ship.y += ship.vy;

  // Screen wrap
  if (ship.x < -10) ship.x = cw + 10;
  if (ship.x > cw + 10) ship.x = -10;
  if (ship.y < -10) ship.y = ch + 10;
  if (ship.y > ch + 10) ship.y = -10;

  // ── Rotate ship to face movement direction or nearest enemy ──
  if (ax !== 0 || ay !== 0) {
    // Face movement direction
    ship.angle = Math.atan2(ax, -ay);
  } else if (enemies && enemies.length > 0) {
    // Snap to nearest living enemy
    const nearest = findNearestEnemy(ship.x, ship.y, enemies);
    if (nearest) {
      const dx = nearest.x - ship.x;
      const dy = nearest.y - ship.y;
      ship.angle = Math.atan2(dx, -dy);
    }
  }

  // ── Invincibility timer ──
  if (ship.invincible) {
    ship.invincibleTimer -= dtMs;
    if (ship.invincibleTimer <= 0) {
      ship.invincible = false;
      ship.invincibleTimer = 0;
    }
  }

  // ── Shoot cooldown ──
  if (ship.shootCooldown > 0) {
    ship.shootCooldown -= dtMs;
    if (ship.shootCooldown < 0) ship.shootCooldown = 0;
  }
}

/**
 * Return a bullet aimed at nearest living enemy if cooldown allows, else null.
 *
 * @param {Object} ship
 * @param {Array} enemies
 * @returns {Object|null} bullet {x, y, vx, vy, angle, life, maxLife, color} or null
 */
export function shootIfReady(ship, enemies) {
  if (ship.dead) return null;
  if (ship.shootCooldown > 0) return null;

  const nearest = findNearestEnemy(ship.x, ship.y, enemies);
  if (!nearest) return null;

  ship.shootCooldown = ship.shootInterval;

  const dx = nearest.x - ship.x;
  const dy = nearest.y - ship.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

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

/**
 * Handle player being hit.
 * Removes a life, sets invincible. Returns true if now dead.
 *
 * @param {Object} ship
 * @returns {boolean} true if player is now dead (0 lives)
 */
export function hitPlayerShip(ship) {
  if (ship.invincible || ship.dead) return false;

  ship.lives -= 1;
  if (ship.lives <= 0) {
    ship.lives = 0;
    ship.dead = true;
    return true;
  }

  ship.invincible = true;
  ship.invincibleTimer = INVINCIBLE_DURATION;
  return false;
}

/**
 * @param {Object} ship
 * @returns {boolean}
 */
export function isPlayerDead(ship) {
  return ship.lives <= 0;
}

// ── Internal helpers ──

function findNearestEnemy(px, py, enemies) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - px;
    const dy = e.y - py;
    const d = dx * dx + dy * dy;
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  return nearest;
}
