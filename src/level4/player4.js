/**
 * player4.js — Player character for Level 4 isometric farm.
 * Top-down isometric movement on the grid.
 *
 * Movement mapping (isometric):
 *   W / ↑     → north-west in iso (gx-1, gy-1) → moves up on screen
 *   S / ↓     → south-east    (gx+1, gy+1) → moves down
 *   A / ←     → south-west    (gx-1, gy+1) → moves left
 *   D / →     → north-east    (gx+1, gy-1) → moves right
 */

import { isWalkable } from './farmEnvironment.js';
import { gridToScreen, HALF_W, HALF_H, CUBE_H } from './voxelRenderer.js';

const PLAYER_SPEED = 4.5;  // grid units per second
const CARRY_BOB_SPEED = 0.008;
const JUMP_FORCE = 7.5;    // grid-z units per second
const JUMP_GRAVITY = 22;   // downward acceleration (grid-z / sec²)
const GROUND_GZ = 1;       // resting height

export function createPlayer4(startGX, startGY) {
  return {
    gx: startGX + 0.5,
    gy: startGY + 0.5,
    gz: 1,
    facingLeft: false,
    state: 'idle',    // 'idle' | 'walking' | 'milking' | 'carrying'
    carryingBottle: false,
    animTime: 0,
    bobOffset: 0,

    // Jump
    isJumping: false,
    jumpVz: 0,

    // For delivery flash
    deliverFlash: 0,
  };
}

/**
 * Update player each frame based on input.
 * Returns { nearCow, milkHeld } for game logic.
 */
export function updatePlayer4(player, actions, dt) {
  const dtSec = dt / 1000;
  player.animTime += dt;

  // Isometric movement
  let dgx = 0;
  let dgy = 0;

  if (actions.forward)  { dgx -= 1; dgy -= 1; }  // W = NW
  if (actions.backward) { dgx += 1; dgy += 1; }  // S = SE
  if (actions.left)     { dgx -= 1; dgy += 1; }  // A = SW
  if (actions.right)    { dgx += 1; dgy -= 1; }  // D = NE

  // Normalize to unit length so all directions move at equal speed
  const len = Math.sqrt(dgx * dgx + dgy * dgy);
  if (len > 1) { dgx /= len; dgy /= len; }

  if (dgx !== 0 || dgy !== 0) {
    const speed = PLAYER_SPEED * dtSec;
    const newGX = player.gx + dgx * speed;
    const newGY = player.gy + dgy * speed;

    // Collision: check tile at new position
    if (isWalkable(Math.floor(newGX), Math.floor(player.gy))) {
      player.gx = newGX;
    }
    if (isWalkable(Math.floor(player.gx), Math.floor(newGY))) {
      player.gy = newGY;
    }

    player.facingLeft = dgx < 0;
    player.state = player.carryingBottle ? 'carrying' : 'walking';
  } else {
    player.state = player.carryingBottle ? 'carrying' : 'idle';
  }

  // Jump — Space bar
  if (actions.jump && !player.isJumping) {
    player.jumpVz = JUMP_FORCE;
    player.isJumping = true;
  }
  if (player.isJumping) {
    player.jumpVz -= JUMP_GRAVITY * dtSec;
    player.gz += player.jumpVz * dtSec;
    if (player.gz <= GROUND_GZ) {
      player.gz = GROUND_GZ;
      player.jumpVz = 0;
      player.isJumping = false;
    }
  }

  // Carry animation
  player.bobOffset = Math.sin(player.animTime * CARRY_BOB_SPEED) * 3;

  // Delivery flash decay
  if (player.deliverFlash > 0) player.deliverFlash -= dtSec;
}

/**
 * Draw the player as a voxel person.
 * When carrying a bottle, shows it held overhead.
 */
export function drawPlayer4(ctx, player, originX, originY) {
  const { gx, gy, gz } = player;
  const pos = gridToScreen(gx, gy, gz, originX, originY);
  const cx = pos.x;
  const cy = pos.y + player.bobOffset * 0.5;

  const isWalking = player.state === 'walking' || player.state === 'carrying';
  const legSwing = isWalking ? Math.sin(player.animTime * 0.012) * 4 : 0;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + CUBE_H + 6, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body voxel (main torso)
  drawPlayerVoxel(ctx, cx, cy, '#4488cc', 0.55, 0.9);

  // Head
  drawPlayerVoxel(ctx, cx, cy - CUBE_H * 0.9 - 4, '#f0c888', 0.5, 0.6);

  // Hat (fantasy pointed hat)
  ctx.save();
  ctx.fillStyle = '#5533aa';
  ctx.beginPath();
  ctx.moveTo(cx, cy - CUBE_H * 0.9 - 16);  // peak
  ctx.lineTo(cx - 10, cy - CUBE_H * 0.9 - 4 - 4); // left brim
  ctx.lineTo(cx + 10, cy - CUBE_H * 0.9 - 4 - 4); // right brim
  ctx.closePath();
  ctx.fill();
  // Hat brim
  ctx.strokeStyle = '#7755cc';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - CUBE_H * 0.9 - 3);
  ctx.lineTo(cx + 12, cy - CUBE_H * 0.9 - 3);
  ctx.stroke();
  ctx.restore();

  // Left leg
  ctx.fillStyle = '#2255aa';
  ctx.fillRect(cx - 7, cy + CUBE_H * 0.7 + legSwing, 5, 10);
  // Right leg
  ctx.fillRect(cx + 2, cy + CUBE_H * 0.7 - legSwing, 5, 10);

  // Arm holding bucket (when idle/walking) or bottle (when carrying)
  if (player.state === 'carrying') {
    // Raised arm holding bottle
    const armX = player.facingLeft ? cx - 12 : cx + 12;
    ctx.save();
    ctx.strokeStyle = '#4488cc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 4);
    ctx.lineTo(armX, cy - 8 + player.bobOffset);
    ctx.stroke();
    ctx.restore();

    // Milk bottle
    drawMilkBottle(ctx, armX, cy - 14 + player.bobOffset, 0.8);
  } else {
    // Normal arm holding bucket
    const armX = player.facingLeft ? cx - 14 : cx + 14;
    ctx.save();
    ctx.strokeStyle = '#4488cc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 4);
    ctx.lineTo(armX, cy + CUBE_H * 0.3);
    ctx.stroke();
    // Bucket
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(armX - 4, cy + CUBE_H * 0.3, 8, 7);
    ctx.restore();
  }

  // Delivery flash glow
  if (player.deliverFlash > 0) {
    ctx.save();
    ctx.globalAlpha = player.deliverFlash * 0.6;
    ctx.fillStyle = '#ffe080';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ffe080';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlayerVoxel(ctx, cx, cy, color, scaleX, scaleH) {
  const hw = HALF_W * scaleX;
  const hh = HALF_H * scaleX;
  const ch = CUBE_H  * scaleH;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = darkenHex(color, 0.75);
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy); ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx, cy + hh + ch); ctx.lineTo(cx - hw, cy + ch);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = darkenHex(color, 0.55);
  ctx.beginPath();
  ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx + hw, cy + ch); ctx.lineTo(cx, cy + hh + ch);
  ctx.closePath(); ctx.fill();
}

export function drawMilkBottle(ctx, cx, cy, scale = 1) {
  const w = 10 * scale;
  const h = 18 * scale;
  ctx.save();
  // Bottle body
  ctx.fillStyle = 'rgba(200,240,255,0.9)';
  ctx.strokeStyle = '#80c0e0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - w/2, cy, w, h, 3);
  ctx.fill();
  ctx.stroke();
  // Milk fill
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(cx - w/2 + 2, cy + h*0.3, w - 4, h*0.65);
  // Neck
  ctx.fillStyle = 'rgba(200,240,255,0.9)';
  ctx.fillRect(cx - w*0.3, cy - h*0.25, w*0.6, h*0.28);
  // Cap
  ctx.fillStyle = '#cc4444';
  ctx.fillRect(cx - w*0.35, cy - h*0.28, w*0.7, h*0.15);
  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(cx - w/2 + 2, cy + 2, 2, h * 0.4);
  ctx.restore();
}

function darkenHex(hex, factor) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgb(${Math.floor(r*factor)},${Math.floor(g*factor)},${Math.floor(b*factor)})`;
}
