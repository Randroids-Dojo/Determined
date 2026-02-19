/**
 * Obstacle — the LLM-generated creature that patrols and attacks.
 */

import {
  OBSTACLE_PATROL_CENTER_X, OBSTACLE_PATROL_RANGE,
  GROUND_Y, OBSTACLE_HP_MIN, OBSTACLE_HP_MAX,
  OBSTACLE_DMG_MIN, OBSTACLE_DMG_MAX,
  OBSTACLE_AGGRO_MIN, OBSTACLE_AGGRO_MAX,
} from './constants.js';
import { centerDistance } from './physics.js';

/** Clamp a value to [min, max]. */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Create an obstacle from LLM-generated data.
 * Falls back to sane defaults if data is missing.
 */
export function createObstacle(data) {
  const d = data || {};
  const w = d.visual?.width || 50;
  const h = d.visual?.height || 50;

  return {
    // Identity
    name: d.name || 'Mysterious Creature',
    description: d.description || 'It stares at you with vague menace.',
    weakness: d.weakness || 'sharp',

    // Position & size
    x: OBSTACLE_PATROL_CENTER_X - w / 2,
    y: GROUND_Y - h,
    width: w,
    height: h,
    vx: 0,
    vy: 0,
    onGround: true,

    // Stats (clamped to design constraints)
    hp: clamp(d.health || 100, OBSTACLE_HP_MIN, OBSTACLE_HP_MAX),
    maxHp: clamp(d.health || 100, OBSTACLE_HP_MIN, OBSTACLE_HP_MAX),
    attackDamage: clamp(d.attack_damage || 15, OBSTACLE_DMG_MIN, OBSTACLE_DMG_MAX),
    attackPattern: d.attack_pattern || 'melee',
    attackCooldown: clamp((d.attack_cooldown || 1.5) * 1000, 500, 3000), // ms
    moveSpeed: clamp(d.movement_speed || 2, 1, 5),
    aggroRange: clamp(d.aggro_range || 120, OBSTACLE_AGGRO_MIN, OBSTACLE_AGGRO_MAX),

    // Visual
    visual: d.visual || null,
    facingLeft: true,

    // State
    state: 'patrol', // patrol | aggro | attack | stunned | dead
    patrolCenter: OBSTACLE_PATROL_CENTER_X,
    patrolDir: -1,
    attackTimer: 0,
    stunTimer: 0,
    dead: false,
    showDescription: true, // show flavor text on first encounter
    descriptionTimer: 3000,

    // Projectiles (for ranged attacks)
    projectiles: [],
  };
}

/**
 * Update obstacle AI each frame.
 */
export function updateObstacle(obstacle, player, dt) {
  if (obstacle.dead) return;

  // Timers
  if (obstacle.attackTimer > 0) obstacle.attackTimer -= dt;
  if (obstacle.stunTimer > 0) {
    obstacle.stunTimer -= dt;
    obstacle.state = 'stunned';
    return;
  }
  if (obstacle.descriptionTimer > 0) obstacle.descriptionTimer -= dt;
  if (obstacle.descriptionTimer <= 0) obstacle.showDescription = false;

  // Update projectiles
  updateProjectiles(obstacle, dt);

  const dist = centerDistance(obstacle, player);

  if (dist < obstacle.aggroRange && !player.dead) {
    // Aggro — chase player
    obstacle.state = 'aggro';
    const dx = (player.x + player.width / 2) - (obstacle.x + obstacle.width / 2);
    obstacle.facingLeft = dx < 0;
    obstacle.x += (dx > 0 ? 1 : -1) * obstacle.moveSpeed * 0.8;

    // Attack when close enough
    if (dist < obstacle.aggroRange * 0.5 && obstacle.attackTimer <= 0) {
      obstacle.state = 'attack';
      obstacle.attackTimer = obstacle.attackCooldown;
      return; // attack processed by game loop
    }
  } else {
    // Patrol
    obstacle.state = 'patrol';
    obstacle.x += obstacle.patrolDir * obstacle.moveSpeed * 0.5;
    obstacle.facingLeft = obstacle.patrolDir < 0;

    // Reverse at patrol bounds
    if (obstacle.x < obstacle.patrolCenter - OBSTACLE_PATROL_RANGE) {
      obstacle.patrolDir = 1;
    } else if (obstacle.x > obstacle.patrolCenter + OBSTACLE_PATROL_RANGE) {
      obstacle.patrolDir = -1;
    }
  }

  // Keep on ground
  obstacle.y = GROUND_Y - obstacle.height;
}

/**
 * Deal damage to the obstacle. Returns true if it died.
 */
export function damageObstacle(obstacle, amount) {
  if (obstacle.dead) return false;
  obstacle.hp -= amount;
  if (obstacle.hp <= 0) {
    obstacle.hp = 0;
    obstacle.dead = true;
    obstacle.state = 'dead';
    return true;
  }
  return false;
}

/** Stun the obstacle for a duration (ms). */
export function stunObstacle(obstacle, duration) {
  obstacle.stunTimer = duration;
  obstacle.state = 'stunned';
}

/**
 * Fire a projectile from the obstacle toward the player.
 */
export function fireProjectile(obstacle, player) {
  const ox = obstacle.x + obstacle.width / 2;
  const oy = obstacle.y + obstacle.height / 2;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  const angle = Math.atan2(py - oy, px - ox);
  const speed = 4;

  obstacle.projectiles.push({
    x: ox,
    y: oy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    width: 8,
    height: 8,
    damage: obstacle.attackDamage,
    life: 2000, // ms
  });
}

function updateProjectiles(obstacle, dt) {
  for (let i = obstacle.projectiles.length - 1; i >= 0; i--) {
    const p = obstacle.projectiles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= dt;
    if (p.life <= 0 || p.x < -20 || p.x > 820 || p.y < -20 || p.y > 460) {
      obstacle.projectiles.splice(i, 1);
    }
  }
}
