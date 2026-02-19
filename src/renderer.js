/**
 * Renderer — draws sprites from LLM-generated JSON visual descriptions,
 * plus background, ground, flagpole, and screen effects.
 */

import {
  CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y,
  COLOR_SKY_TOP, COLOR_SKY_BOTTOM, COLOR_GROUND, COLOR_GROUND_DARK,
  COLOR_FLAG_POLE, COLOR_FLAG, FLAG_X, FLAG_HEIGHT,
} from './constants.js';

/** Draw the background gradient sky. */
export function drawBackground(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  grad.addColorStop(0, COLOR_SKY_TOP);
  grad.addColorStop(1, COLOR_SKY_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y);
}

/** Draw the ground plane. */
export function drawGround(ctx) {
  ctx.fillStyle = COLOR_GROUND;
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
  // Darker strip at top of ground
  ctx.fillStyle = COLOR_GROUND_DARK;
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4);
}

/** Draw the flagpole and flag at the goal. */
export function drawFlag(ctx) {
  // Pole
  ctx.strokeStyle = COLOR_FLAG_POLE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(FLAG_X, GROUND_Y);
  ctx.lineTo(FLAG_X, GROUND_Y - FLAG_HEIGHT);
  ctx.stroke();

  // Flag triangle
  ctx.fillStyle = COLOR_FLAG;
  ctx.beginPath();
  ctx.moveTo(FLAG_X, GROUND_Y - FLAG_HEIGHT);
  ctx.lineTo(FLAG_X + 25, GROUND_Y - FLAG_HEIGHT + 12);
  ctx.lineTo(FLAG_X, GROUND_Y - FLAG_HEIGHT + 24);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw an entity from its LLM-generated `visual` description.
 * Renders at (entity.x, entity.y) using shape primitives.
 */
export function drawVisual(ctx, visual, x, y, facingLeft = false) {
  if (!visual || !visual.features) return;

  ctx.save();
  ctx.translate(x, y);
  if (facingLeft) {
    ctx.scale(-1, 1);
    ctx.translate(-visual.width, 0);
  }

  // Draw base shape
  drawShape(ctx, {
    type: visual.base_shape || 'rectangle',
    x: 0,
    y: 0,
    width: visual.width,
    height: visual.height,
    radius: Math.min(visual.width, visual.height) / 2,
    color: visual.color_primary || '#888',
  });

  // Draw features on top
  for (const feature of visual.features) {
    drawShape(ctx, feature);
  }

  ctx.restore();
}

/** Draw a single shape primitive. */
function drawShape(ctx, shape) {
  const color = shape.color || '#888';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = shape.lineWidth || 2;

  switch (shape.type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(shape.x || 0, shape.y || 0, shape.radius || 10, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'rectangle':
      ctx.fillRect(
        shape.x || 0,
        shape.y || 0,
        shape.width || 20,
        shape.height || 20,
      );
      break;

    case 'triangle':
      if (shape.points && shape.points.length === 3) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0][0], shape.points[0][1]);
        ctx.lineTo(shape.points[1][0], shape.points[1][1]);
        ctx.lineTo(shape.points[2][0], shape.points[2][1]);
        ctx.closePath();
        ctx.fill();
      }
      break;

    case 'line':
      ctx.beginPath();
      ctx.moveTo(shape.x1 || 0, shape.y1 || 0);
      ctx.lineTo(shape.x2 || 20, shape.y2 || 20);
      ctx.stroke();
      break;

    case 'arc':
      ctx.beginPath();
      ctx.arc(
        shape.x || 0,
        shape.y || 0,
        shape.radius || 10,
        shape.startAngle || 0,
        shape.endAngle || Math.PI,
      );
      ctx.stroke();
      break;

    case 'polygon':
      if (shape.points && shape.points.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0][0], shape.points[0][1]);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i][0], shape.points[i][1]);
        }
        ctx.closePath();
        ctx.fill();
      }
      break;

    default:
      // Unknown shape — draw a fallback rectangle
      ctx.fillRect(shape.x || 0, shape.y || 0, shape.width || 20, shape.height || 20);
      break;
  }
}

/**
 * Draw the stick-figure player.
 * entity needs { x, y, width, height, facing, animFrame, state }
 */
export function drawStickFigure(ctx, player) {
  const cx = player.x + player.width / 2;
  const topY = player.y;
  const hitFlash = player.hitFlashTimer > 0;
  const color = hitFlash ? '#FF2222'
    : (player.invincibleTimer > 0 && Math.floor(Date.now() / 80) % 2)
      ? 'rgba(34,34,34,0.3)' : '#222';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  // Head
  const headR = 7;
  const headY = topY + headR;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Body
  const bodyTop = headY + headR;
  const bodyBottom = bodyTop + 16;
  ctx.beginPath();
  ctx.moveTo(cx, bodyTop);
  ctx.lineTo(cx, bodyBottom);
  ctx.stroke();

  // Legs
  const legLen = 12;
  const walkCycle = player.state === 'walk' ? Math.sin(player.animFrame * 0.3) * 6 : 0;
  ctx.beginPath();
  ctx.moveTo(cx, bodyBottom);
  ctx.lineTo(cx - 6 + walkCycle, bodyBottom + legLen);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, bodyBottom);
  ctx.lineTo(cx + 6 - walkCycle, bodyBottom + legLen);
  ctx.stroke();

  // Arms
  const armY = bodyTop + 4;
  if (player.state === 'attack') {
    // Attack pose — weapon arm extended
    const dir = player.facing === 'left' ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx + 14 * dir, armY - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx - 6 * dir, armY + 8);
    ctx.stroke();
  } else if (player.state === 'jump') {
    // Arms up
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx - 8, armY - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx + 8, armY - 8);
    ctx.stroke();
  } else if (player.state === 'victory') {
    // Arms raised in celebration
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx - 10, armY - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx + 10, armY - 12);
    ctx.stroke();
  } else {
    // Idle / walk
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx - 8, armY + 10 + walkCycle * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(cx + 8, armY + 10 - walkCycle * 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Screen shake ──

let shakeIntensity = 0;
let shakeDuration = 0;
let shakeStart = 0;

export function triggerScreenShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeDuration = duration;
  shakeStart = Date.now();
}

export function applyScreenShake(ctx) {
  const elapsed = Date.now() - shakeStart;
  if (elapsed < shakeDuration && shakeIntensity > 0) {
    const fade = 1 - elapsed / shakeDuration;
    const dx = (Math.random() - 0.5) * shakeIntensity * fade * 2;
    const dy = (Math.random() - 0.5) * shakeIntensity * fade * 2;
    ctx.translate(dx, dy);
    return true;
  }
  return false;
}
