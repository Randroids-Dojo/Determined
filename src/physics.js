/**
 * Physics — gravity, collision, and movement helpers.
 */

import { GRAVITY, GROUND_Y, FRICTION } from './constants.js';

/**
 * Apply gravity to an entity that has { x, y, vx, vy, width, height, onGround }.
 */
export function applyGravity(entity) {
  entity.vy += GRAVITY;
  entity.y += entity.vy;
  entity.x += entity.vx;

  // Ground collision
  const feetY = entity.y + entity.height;
  if (feetY >= GROUND_Y) {
    entity.y = GROUND_Y - entity.height;
    entity.vy = 0;
    entity.onGround = true;
  } else {
    entity.onGround = false;
  }

  // Horizontal friction (only on ground)
  if (entity.onGround) {
    entity.vx *= FRICTION;
    if (Math.abs(entity.vx) < 0.1) entity.vx = 0;
  }
}

/**
 * Axis-Aligned Bounding-Box overlap test.
 * Each entity needs { x, y, width, height }.
 */
export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Distance between the centers of two entities.
 */
export function centerDistance(a, b) {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Clamp entity within canvas bounds.
 */
export function clampToCanvas(entity, canvasWidth) {
  if (entity.x < 0) entity.x = 0;
  if (entity.x + entity.width > canvasWidth) {
    entity.x = canvasWidth - entity.width;
  }
}
