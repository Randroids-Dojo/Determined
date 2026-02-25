/**
 * cowObstacle.js — Fantasy cow creature for Level 4.
 * Cows roam the pasture peacefully. Player milks them.
 * No combat — cows never attack the player.
 *
 * State machine:
 *   'wander'  — picking a new random destination
 *   'walking' — moving toward destination
 *   'idle'    — paused briefly
 *   'milked'  — recently milked, cooling down before replenishing
 */

import { isCowWalkable } from './farmEnvironment.js';
import { gridToScreen, HALF_W, HALF_H, CUBE_H } from './voxelRenderer.js';

const WANDER_SPEED = 1.5;       // grid units per second
const IDLE_TIME_MIN = 1.5;
const IDLE_TIME_MAX = 4.0;
const MILK_COOLDOWN = 12.0;     // seconds before cow can be milked again
const MILK_TIME = 2.0;          // seconds player must hold Z to fill bottle

/**
 * Create a cow entity.
 * @param {Object} data — LLM obstacle data (for colors/name)
 * @param {number} gx - starting grid x
 * @param {number} gy - starting grid y
 * @param {number} id - unique id
 */
export function createCow(data, gx, gy, id) {
  const primaryColor   = data?.visual?.color_primary   || '#e8d4a0';
  const secondaryColor = data?.visual?.color_secondary || '#c4a070';
  const accentColor    = data?.visual?.color_accent    || '#8b6040';

  return {
    id,
    gx: gx + 0.5,   // center of tile (fractional grid coords)
    gy: gy + 0.5,
    gz: 1,           // stands on top of ground voxel
    targetGX: gx + 0.5,
    targetGY: gy + 0.5,
    state: 'idle',
    idleTimer: 1.0 + Math.random() * 2.0,
    milkCooldown: 0,
    milkProgress: 0,   // 0..1 filled by player holding Z
    canBeMilked: true,
    facingLeft: false,
    animTime: Math.random() * 100,

    // Colors (from LLM or defaults)
    colorBody:    primaryColor,
    colorSpots:   secondaryColor,
    colorAccent:  accentColor,

    // Visual metadata
    name: data?.name || 'Magical Cow',

    // Magic freeze effect
    frozenTimer: 0,
  };
}

/**
 * Update a single cow's AI each frame.
 * @param {Object} cow
 * @param {number} dt - delta time in ms
 */
export function updateCow(cow, dt) {
  const dtSec = dt / 1000;
  cow.animTime += dt;

  // Magic freeze — skip movement while frozen
  if (cow.frozenTimer > 0) {
    cow.frozenTimer -= dtSec;
    if (cow.frozenTimer < 0) cow.frozenTimer = 0;
    // Still tick milk cooldown while frozen
    if (cow.milkCooldown > 0) {
      cow.milkCooldown -= dtSec;
      if (cow.milkCooldown <= 0) {
        cow.milkCooldown = 0;
        cow.canBeMilked = true;
      }
    }
    return;
  }

  // Milk cooldown
  if (cow.milkCooldown > 0) {
    cow.milkCooldown -= dtSec;
    if (cow.milkCooldown <= 0) {
      cow.milkCooldown = 0;
      cow.canBeMilked = true;
    }
  }

  if (cow.state === 'idle') {
    cow.idleTimer -= dtSec;
    if (cow.idleTimer <= 0) {
      pickNewDestination(cow);
    }
  } else if (cow.state === 'walking') {
    moveCowTowardTarget(cow, dtSec);
  }
}

function pickNewDestination(cow) {
  // Try up to 8 random adjacent/nearby tiles
  for (let attempt = 0; attempt < 8; attempt++) {
    const dx = Math.round((Math.random() - 0.5) * 4);
    const dy = Math.round((Math.random() - 0.5) * 4);
    const targetGX = Math.round(cow.gx - 0.5 + dx) + 0.5;
    const targetGY = Math.round(cow.gy - 0.5 + dy) + 0.5;
    if (isCowWalkable(Math.floor(targetGX), Math.floor(targetGY))) {
      cow.targetGX = targetGX;
      cow.targetGY = targetGY;
      cow.state = 'walking';
      cow.facingLeft = dx < 0;
      return;
    }
  }
  // No valid tile found — idle again
  cow.idleTimer = 1.0 + Math.random() * 2.0;
  cow.state = 'idle';
}

function moveCowTowardTarget(cow, dtSec) {
  const dx = cow.targetGX - cow.gx;
  const dy = cow.targetGY - cow.gy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.05) {
    cow.gx = cow.targetGX;
    cow.gy = cow.targetGY;
    cow.state = 'idle';
    cow.idleTimer = IDLE_TIME_MIN + Math.random() * (IDLE_TIME_MAX - IDLE_TIME_MIN);
    return;
  }

  const speed = WANDER_SPEED * dtSec;
  cow.gx += (dx / dist) * speed;
  cow.gy += (dy / dist) * speed;
  cow.facingLeft = dx < 0;
}

/**
 * Try to advance milk progress. Call each frame the player holds Z near this cow.
 * Returns 'filling' | 'full' | 'cooldown'
 */
export function milkCow(cow, dt) {
  if (!cow.canBeMilked) return 'cooldown';

  cow.milkProgress += (dt / 1000) / MILK_TIME;
  if (cow.milkProgress >= 1.0) {
    cow.milkProgress = 0;
    cow.canBeMilked = false;
    cow.milkCooldown = MILK_COOLDOWN;
    cow.state = 'idle';
    cow.idleTimer = 2.0;
    return 'full';
  }
  return 'filling';
}

/**
 * Get grid distance between player and cow center.
 */
export function cowPlayerDistance(cow, playerGX, playerGY) {
  const dx = cow.gx - playerGX;
  const dy = cow.gy - playerGY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Draw a cow as a voxel character (body + head + legs + spots).
 * Uses colors from LLM data. The cow is a ~2x1x2 voxel creature.
 */
export function drawCow(ctx, cow, originX, originY) {
  const { gx, gy, gz } = cow;
  const bob = Math.sin(cow.animTime * 0.003) * 1.5;

  // Body: 2 voxels wide conceptually, drawn as a single wide voxel at gz=1
  const pos = gridToScreen(gx, gy, gz, originX, originY);
  const cx = pos.x;
  const cy = pos.y + bob;

  const bodyCol  = cow.colorBody;
  const spotCol  = cow.colorSpots;
  const accentCol = cow.colorAccent;

  // Body voxel (slightly wider than standard)
  drawCowVoxel(ctx, cx, cy, bodyCol, 1.4, 1.0);

  // Head (offset forward in iso space)
  const headOffset = cow.facingLeft ? 12 : -12;
  const headCX = cx + headOffset;
  const headCY = cy - CUBE_H * 0.6 - 4 + bob;
  drawCowVoxel(ctx, headCX, headCY, bodyCol, 0.75, 0.75);

  // Spot on body
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = spotCol;
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + CUBE_H * 0.3, 7, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Nose/snout accent
  ctx.save();
  ctx.fillStyle = accentCol;
  ctx.beginPath();
  const noseX = headCX + (cow.facingLeft ? -8 : 8);
  ctx.ellipse(noseX, headCY + 4, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = '#00000033';
  ctx.beginPath();
  ctx.arc(noseX - 2, headCY + 4, 1.5, 0, Math.PI * 2);
  ctx.arc(noseX + 2, headCY + 4, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Eyes
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const eyeX = headCX + (cow.facingLeft ? -3 : 3);
  ctx.arc(eyeX, headCY - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.arc(eyeX + (cow.facingLeft ? -1 : 1), headCY - 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Horns (magical/fantasy style — small glowing)
  ctx.save();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 4;
  ctx.shadowColor = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(headCX - 5, headCY - 6);
  ctx.lineTo(headCX - 8, headCY - 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(headCX + 5, headCY - 6);
  ctx.lineTo(headCX + 8, headCY - 14);
  ctx.stroke();
  ctx.restore();

  // Udder when cow can be milked
  if (cow.canBeMilked) {
    ctx.save();
    ctx.fillStyle = '#ffb0c0';
    ctx.beginPath();
    ctx.ellipse(cx, cy + CUBE_H * 0.8, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Teats
    ctx.fillStyle = '#ff8090';
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.arc(cx + i * 4, cy + CUBE_H * 0.8 + 5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Milk progress bar (shown when being milked)
  if (cow.milkProgress > 0) {
    const barW = 36;
    const barX = cx - barW / 2;
    const barY = headCY - 24;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 9);
    ctx.fillStyle = '#80e0ff';
    ctx.fillRect(barX, barY, barW * cow.milkProgress, 7);
    // Milk icon hint
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MILKING...', cx, barY - 4);
  }

  // Frozen indicator — ice crystal effect
  if (cow.frozenTimer > 0) {
    ctx.save();
    ctx.strokeStyle = '#80e0ff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#80e0ff';
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const r = 22;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#80e0ff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`❄ ${Math.ceil(cow.frozenTimer)}s`, cx, headCY - 20);
    ctx.restore();
  }

  // Cooldown indicator — small X showing cow is milked out
  if (!cow.canBeMilked) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`💤 ${Math.ceil(cow.milkCooldown)}s`, cx, headCY - 20);
    ctx.restore();
  }
}

/**
 * Draw a scaled voxel for the cow body parts.
 */
function drawCowVoxel(ctx, cx, cy, color, scaleX = 1, scaleH = 1) {
  const hw = HALF_W * scaleX;
  const hh = HALF_H * scaleX;
  const ch = CUBE_H  * scaleH;

  // Darken sides
  const topColor = color;
  const leftColor  = darkenHex(color, 0.75);
  const rightColor = darkenHex(color, 0.55);

  // Top face
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(cx,      cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx,      cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fill();

  // Left face
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx,      cy + hh);
  ctx.lineTo(cx,      cy + hh + ch);
  ctx.lineTo(cx - hw, cy + ch);
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(cx,      cy + hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx + hw, cy + ch);
  ctx.lineTo(cx,      cy + hh + ch);
  ctx.closePath();
  ctx.fill();

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.stroke();
}

function darkenHex(hex, factor) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.floor(r*factor)},${Math.floor(g*factor)},${Math.floor(b*factor)})`;
}
