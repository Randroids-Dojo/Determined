/**
 * Player — stick-figure entity with movement, jumping, attacking, and item use.
 */

import {
  PLAYER_MAX_HP, PLAYER_SPEED, PLAYER_JUMP_FORCE,
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_START_X,
  PLAYER_INVINCIBILITY_TIME, GROUND_Y, CANVAS_WIDTH,
} from './constants.js';
import { applyGravity, clampToCanvas } from './physics.js';
import { sfxJump, sfxAttack, sfxHitTake, sfxDeath } from './audio.js';

export function createPlayer() {
  return {
    x: PLAYER_START_X,
    y: GROUND_Y - PLAYER_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    vx: 0,
    vy: 0,
    onGround: false,
    hp: PLAYER_MAX_HP,
    facing: 'right',
    state: 'idle',       // idle | walk | jump | attack | death | victory
    animFrame: 0,
    invincibleTimer: 0,  // ms remaining
    attackCooldown: 0,    // ms remaining
    hitFlashTimer: 0,     // ms remaining for red flash on hit
    itemUsed: false,
    dead: false,
  };
}

export function resetPlayer(player) {
  player.x = PLAYER_START_X;
  player.y = GROUND_Y - PLAYER_HEIGHT;
  player.vx = 0;
  player.vy = 0;
  player.hp = PLAYER_MAX_HP;
  player.facing = 'right';
  player.state = 'idle';
  player.animFrame = 0;
  player.invincibleTimer = 0;
  player.attackCooldown = 0;
  player.hitFlashTimer = 0;
  player.itemUsed = false;
  player.dead = false;
}

export function updatePlayer(player, actions, dt) {
  if (player.dead) return;

  // Timers
  if (player.invincibleTimer > 0) player.invincibleTimer -= dt;
  if (player.attackCooldown > 0) player.attackCooldown -= dt;
  if (player.hitFlashTimer > 0) player.hitFlashTimer -= dt;

  player.animFrame++;

  // Movement
  let moving = false;
  if (actions.left) {
    player.vx = -PLAYER_SPEED;
    player.facing = 'left';
    moving = true;
  }
  if (actions.right) {
    player.vx = PLAYER_SPEED;
    player.facing = 'right';
    moving = true;
  }

  // Jump
  if (actions.jump && player.onGround) {
    player.vy = PLAYER_JUMP_FORCE;
    player.onGround = false;
    sfxJump();
  }

  // Physics
  applyGravity(player);
  clampToCanvas(player, CANVAS_WIDTH);

  // Determine visual state
  if (!player.onGround) {
    player.state = 'jump';
  } else if (player.attackCooldown > 0 && player.state === 'attack') {
    // Keep attack pose briefly
  } else if (moving) {
    player.state = 'walk';
  } else {
    player.state = 'idle';
  }
}

/**
 * Deal damage to the player. Returns true if the player died.
 */
export function damagePlayer(player, amount, sourceX) {
  if (player.dead || player.invincibleTimer > 0) return false;

  player.hp -= amount;
  player.invincibleTimer = PLAYER_INVINCIBILITY_TIME;

  // Knockback away from damage source
  const knockDir = (sourceX !== undefined && sourceX > player.x + player.width / 2) ? -1 : 1;
  player.vx = knockDir * 5;
  player.vy = -3;
  player.onGround = false;

  // Hit flash
  player.hitFlashTimer = 150; // ms

  if (player.hp <= 0) {
    player.hp = 0;
    player.dead = true;
    player.state = 'death';
    sfxDeath();
    return true;
  }
  sfxHitTake();
  return false;
}

/**
 * Attempt an attack. Returns true if an attack was fired (for weapon to process).
 */
export function tryAttack(player, weaponCooldown) {
  if (player.dead || player.attackCooldown > 0) return false;
  player.attackCooldown = weaponCooldown;
  player.state = 'attack';
  sfxAttack();
  return true;
}
