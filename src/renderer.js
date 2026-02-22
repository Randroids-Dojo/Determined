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
  const baseType = visual.base_shape || 'ellipse';
  if (baseType === 'ellipse') {
    drawShape(ctx, {
      type: 'ellipse',
      x: visual.width / 2,
      y: visual.height / 2,
      radiusX: visual.width / 2,
      radiusY: visual.height / 2,
      color: visual.color_primary || '#888',
      label: 'base',
    });
  } else {
    drawShape(ctx, {
      type: baseType,
      x: 0,
      y: 0,
      width: visual.width,
      height: visual.height,
      radius: Math.min(visual.width, visual.height) / 2,
      color: visual.color_primary || '#888',
      label: 'base',
    });
  }

  // Draw features on top, sorted largest-first so small details (eyes, pupils) appear on top
  const sorted = [...visual.features].sort((a, b) => featureArea(b) - featureArea(a));
  for (const feature of sorted) {
    drawShape(ctx, feature);
  }

  ctx.restore();
}

/** Approximate area of a feature for draw-order sorting. */
function featureArea(f) {
  switch (f.type) {
    case 'circle': return Math.PI * (f.radius || 10) ** 2;
    case 'ellipse': return Math.PI * (f.radiusX || f.radius || 10) * (f.radiusY || f.radius || 10);
    case 'rectangle':
    case 'roundedRect': return (f.width || 20) * (f.height || 20);
    default: return 0;
  }
}

/** Darken a hex color by a factor (0-1) for outlines. */
function darkenColor(hex, factor = 0.35) {
  // Handle 3-char hex (#F00 → #FF0000)
  let h = hex;
  const short = h.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/);
  if (short) h = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const m = h.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/);
  if (!m) return '#000000';
  const r = Math.round(parseInt(m[1], 16) * (1 - factor));
  const g = Math.round(parseInt(m[2], 16) * (1 - factor));
  const b = Math.round(parseInt(m[3], 16) * (1 - factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Draw a filled shape with an optional outline for definition. */
function drawFilled(ctx, color, drawPath, outline = true) {
  ctx.fillStyle = color;
  ctx.beginPath();
  drawPath();
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = darkenColor(color);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    drawPath();
    ctx.stroke();
  }
}

/** Draw a single shape primitive. */
function drawShape(ctx, shape) {
  const color = shape.color || '#888';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = shape.lineWidth || 2;
  // Shapes with label containing "pupil" or "eye" are small details — skip outlines
  const isDetail = /pupil/i.test(shape.label || '');

  switch (shape.type) {
    case 'circle':
      drawFilled(ctx, color, () => {
        ctx.arc(shape.x || 0, shape.y || 0, shape.radius || 10, 0, Math.PI * 2);
      }, !isDetail);
      break;

    case 'ellipse': {
      const rx = shape.radiusX || shape.radius || 10;
      const ry = shape.radiusY || shape.radius || 10;
      drawFilled(ctx, color, () => {
        ctx.ellipse(shape.x || 0, shape.y || 0, rx, ry, shape.rotation || 0, 0, Math.PI * 2);
      }, !isDetail);
      break;
    }

    case 'rectangle':
      drawFilled(ctx, color, () => {
        ctx.rect(shape.x || 0, shape.y || 0, shape.width || 20, shape.height || 20);
      }, !isDetail);
      break;

    case 'roundedRect': {
      const rx2 = shape.x || 0;
      const ry2 = shape.y || 0;
      const rw = shape.width || 20;
      const rh = shape.height || 20;
      const cr = Math.min(shape.cornerRadius || 4, rw / 2, rh / 2);
      drawFilled(ctx, color, () => {
        ctx.moveTo(rx2 + cr, ry2);
        ctx.lineTo(rx2 + rw - cr, ry2);
        ctx.arcTo(rx2 + rw, ry2, rx2 + rw, ry2 + cr, cr);
        ctx.lineTo(rx2 + rw, ry2 + rh - cr);
        ctx.arcTo(rx2 + rw, ry2 + rh, rx2 + rw - cr, ry2 + rh, cr);
        ctx.lineTo(rx2 + cr, ry2 + rh);
        ctx.arcTo(rx2, ry2 + rh, rx2, ry2 + rh - cr, cr);
        ctx.lineTo(rx2, ry2 + cr);
        ctx.arcTo(rx2, ry2, rx2 + cr, ry2, cr);
        ctx.closePath();
      }, true);
      break;
    }

    case 'triangle':
      if (shape.points && shape.points.length === 3) {
        drawFilled(ctx, color, () => {
          ctx.moveTo(shape.points[0][0], shape.points[0][1]);
          ctx.lineTo(shape.points[1][0], shape.points[1][1]);
          ctx.lineTo(shape.points[2][0], shape.points[2][1]);
          ctx.closePath();
        }, true);
      }
      break;

    case 'line':
      ctx.strokeStyle = color;
      ctx.lineWidth = shape.lineWidth || 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(shape.x1 || 0, shape.y1 || 0);
      ctx.lineTo(shape.x2 || 20, shape.y2 || 20);
      ctx.stroke();
      break;

    case 'arc':
      ctx.strokeStyle = color;
      ctx.lineWidth = shape.lineWidth || 2;
      ctx.lineCap = 'round';
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
        drawFilled(ctx, color, () => {
          ctx.moveTo(shape.points[0][0], shape.points[0][1]);
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i][0], shape.points[i][1]);
          }
          ctx.closePath();
        }, true);
      }
      break;

    default:
      // Unknown shape — draw a fallback rectangle
      ctx.fillStyle = color;
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
