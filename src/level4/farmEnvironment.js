/**
 * farmEnvironment.js — Fantasy farm map, voxel terrain, and static decorations.
 *
 * Map tile types:
 *   0 = open pasture (grass, cow can roam)
 *   1 = fence post
 *   2 = stone path (connects house to pasture)
 *   3 = house interior (impassable)
 *   4 = hay bale (impassable decoration)
 *   5 = water trough (impassable)
 *   6 = delivery zone (farmhouse door — player delivers here)
 *   7 = magical flower patch (passable, just decorative)
 */

import { gridToScreen, CUBE_H, HALF_H, HALF_W } from './voxelRenderer.js';

export const GRID_W = 14;
export const GRID_H = 10;

// Fantasy farm tile color palettes
const COLORS = {
  grass:       { top: '#6abf47', left: '#4e9233', right: '#3a6c26' },
  grassDark:   { top: '#5aad3a', left: '#437f28', right: '#2e5a1a' },
  path:        { top: '#b0a090', left: '#8a7a6a', right: '#6a5a4a' },
  fence:       { top: '#c8a050', left: '#8b6820', right: '#5a4210' },
  houseWall:   { top: '#f0d890', left: '#c4a040', right: '#8a700c' },
  houseRoof:   { top: '#cc4422', left: '#992211', right: '#661100' },
  hayBale:     { top: '#e8c840', left: '#c09810', right: '#806800' },
  water:       { top: '#60c0e8', left: '#3a90c0', right: '#1a6090' },
  waterTrough: { top: '#a08060', left: '#705030', right: '#4a3010' },
  flower:      { top: '#e060d0', left: '#a03090', right: '#701060' },
  flowerStem:  { top: '#4e9233', left: '#306820', right: '#204810' },
  deliveryGlow:{ top: '#ffe080', left: '#c0a020', right: '#806800' },
  stone:       { top: '#aaa090', left: '#807060', right: '#504030' },
};

// Map layout — GRID_W x GRID_H (14 cols × 10 rows)
// Row 0 & 9, Col 0 & 13 = fence border
// House (3x3) at rows 1-3, cols 1-3
// Stone path at col 4, rows 1-8
// Delivery at (4,2) — on the path right at the farmhouse door (easily accessible)
export const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,3,3,3,2,0,0,0,0,0,7,0,0,1],
  [1,3,3,3,6,0,0,4,0,0,0,0,0,1],
  [1,3,3,3,2,0,0,0,0,0,0,7,0,1],
  [1,0,0,0,2,0,0,0,5,0,0,0,0,1],
  [1,0,0,0,2,0,4,0,0,0,7,0,0,1],
  [1,7,0,0,2,0,0,0,0,0,0,0,4,1],
  [1,0,0,0,0,0,0,7,0,4,0,0,0,1],
  [1,0,7,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Cow roaming zone: rows 1-8, cols 5-12 (open pasture)
export const COW_ZONE = { minX: 5, maxX: 12, minY: 1, maxY: 8 };

// Delivery zone tile coords — on the stone path directly in front of the farmhouse door
export const DELIVERY_GX = 4;
export const DELIVERY_GY = 2;

// Check if a grid cell is walkable for the player
export function isWalkable(gx, gy) {
  if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return false;
  const tile = MAP[gy][gx];
  return tile === 0 || tile === 2 || tile === 6 || tile === 7;
}

// Check if a grid cell is walkable for cows (open pasture only)
export function isCowWalkable(gx, gy) {
  if (gx < COW_ZONE.minX || gx > COW_ZONE.maxX) return false;
  if (gy < COW_ZONE.minY || gy > COW_ZONE.maxY) return false;
  const tile = MAP[gy][gx];
  return tile === 0 || tile === 7;
}

let animTime = 0;

export function updateFarm(dt) {
  animTime += dt;
}

/**
 * Build and return the draw list for the entire farm terrain and static decorations.
 * Caller adds entity draw calls, then sorts and renders everything together.
 */
export function buildTerrainDrawList(originX, originY) {
  const drawList = [];

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const tile = MAP[gy][gx];

      if (tile === 1) {
        // Fence post — 2 voxels tall
        drawList.push({ gx, gy, gz: 0, colors: COLORS.grass,   depth: gx + gy });
        drawList.push({ gx, gy, gz: 1, colors: COLORS.fence,   depth: gx + gy + 0.01 });
        drawList.push({ gx, gy, gz: 2, colors: COLORS.fence,   depth: gx + gy + 0.02 });
      } else if (tile === 0) {
        // Alternate grass shading for checkerboard depth cue
        const col = (gx + gy) % 2 === 0 ? COLORS.grass : COLORS.grassDark;
        drawList.push({ gx, gy, gz: 0, colors: col, depth: gx + gy });
      } else if (tile === 2) {
        // Stone path on top of grass
        drawList.push({ gx, gy, gz: 0, colors: COLORS.grass, depth: gx + gy });
        drawList.push({ gx, gy, gz: 1, colors: COLORS.path,  depth: gx + gy + 0.01 });
      } else if (tile === 3) {
        // House interior floor — 1 voxel of stone
        drawList.push({ gx, gy, gz: 0, colors: COLORS.stone, depth: gx + gy });
      } else if (tile === 4) {
        // Hay bale — 2 voxels tall
        drawList.push({ gx, gy, gz: 0, colors: COLORS.grass,   depth: gx + gy });
        drawList.push({ gx, gy, gz: 1, colors: COLORS.hayBale, depth: gx + gy + 0.01 });
        drawList.push({ gx, gy, gz: 2, colors: COLORS.hayBale, depth: gx + gy + 0.02 });
      } else if (tile === 5) {
        // Water trough — trough walls + water
        drawList.push({ gx, gy, gz: 0, colors: COLORS.grass,       depth: gx + gy });
        drawList.push({ gx, gy, gz: 1, colors: COLORS.waterTrough,  depth: gx + gy + 0.01 });
        drawList.push({ gx, gy, gz: 2, colors: COLORS.water,        depth: gx + gy + 0.02 });
      } else if (tile === 6) {
        // Delivery zone — glowing golden floor
        const pulse = 0.8 + 0.2 * Math.sin(animTime * 0.003);
        const delivCol = {
          top:   lerpColor('#ffe080', '#ffcc00', pulse),
          left:  COLORS.deliveryGlow.left,
          right: COLORS.deliveryGlow.right,
        };
        drawList.push({ gx, gy, gz: 0, colors: delivCol, depth: gx + gy });
      } else if (tile === 7) {
        // Magical flower patch
        drawList.push({ gx, gy, gz: 0, colors: COLORS.grass, depth: gx + gy });
        drawList.push({ gx, gy, gz: 1, colors: COLORS.flowerStem, depth: gx + gy + 0.01 });
        drawList.push({ gx, gy, gz: 2, colors: COLORS.flower, depth: gx + gy + 0.02 });
      }
    }
  }

  // Add farmhouse structure (rows 1-3, cols 1-3), walls 3 high + roof
  addFarmhouseVoxels(drawList);

  return drawList;
}

function addFarmhouseVoxels(drawList) {
  const houseGX = [1, 2, 3];
  const houseGY = [1, 2, 3];

  for (const gy of houseGY) {
    for (const gx of houseGX) {
      // Walls — 3 voxels tall
      for (let gz = 1; gz <= 3; gz++) {
        // Skip interior — only draw perimeter walls
        const isEdge = (gx === 1 || gx === 3 || gy === 1 || gy === 3);
        if (!isEdge) continue;

        // Skip wall on delivery tiles (doorway opening) and on the east-center
        // face (gx=3, gy=2) so the farmhouse has a visible door toward the path
        if (MAP[gy][gx] === 6) continue;
        if (gx === 3 && gy === 2) continue;

        drawList.push({
          gx, gy, gz,
          colors: COLORS.houseWall,
          depth: gx + gy + gz * 0.001,
        });
      }

      // Roof cap at gz=4 — reddish
      drawList.push({
        gx, gy, gz: 4,
        colors: COLORS.houseRoof,
        depth: gx + gy + 4 * 0.001,
      });
    }
  }

  // Chimney at top-left of house (gx=1, gy=1), extra 2 tall
  for (let gz = 5; gz <= 6; gz++) {
    drawList.push({ gx: 1, gy: 1, gz, colors: COLORS.stone, depth: 1 + 1 + gz * 0.001 });
  }
}

/**
 * Render the draw list using voxelRenderer.
 */
export function renderTerrainDrawList(ctx, drawList, originX, originY) {
  // Sort is done by caller after merging with entity draw calls
  for (const item of drawList) {
    const { x, y } = gridToScreen(item.gx, item.gy, item.gz, originX, originY);
    drawVoxelAtCoords(ctx, x, y, item.colors);
  }
}

// Inline voxel draw to avoid circular import issues
function drawVoxelAtCoords(ctx, cx, cy, colors) {
  // Top face
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(cx,        cy - HALF_H);
  ctx.lineTo(cx + HALF_W, cy);
  ctx.lineTo(cx,        cy + HALF_H);
  ctx.lineTo(cx - HALF_W, cy);
  ctx.closePath();
  ctx.fill();

  // Left face
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(cx - HALF_W, cy);
  ctx.lineTo(cx,          cy + HALF_H);
  ctx.lineTo(cx,          cy + HALF_H + CUBE_H);
  ctx.lineTo(cx - HALF_W, cy + CUBE_H);
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(cx,          cy + HALF_H);
  ctx.lineTo(cx + HALF_W, cy);
  ctx.lineTo(cx + HALF_W, cy + CUBE_H);
  ctx.lineTo(cx,          cy + HALF_H + CUBE_H);
  ctx.closePath();
  ctx.fill();

  // Edge outlines
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy - HALF_H);
  ctx.lineTo(cx + HALF_W, cy);
  ctx.lineTo(cx, cy + HALF_H);
  ctx.lineTo(cx - HALF_W, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - HALF_W, cy + CUBE_H);
  ctx.lineTo(cx,          cy + HALF_H + CUBE_H);
  ctx.lineTo(cx + HALF_W, cy + CUBE_H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - HALF_W, cy); ctx.lineTo(cx - HALF_W, cy + CUBE_H); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + HALF_W, cy); ctx.lineTo(cx + HALF_W, cy + CUBE_H); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + HALF_H); ctx.lineTo(cx, cy + HALF_H + CUBE_H); ctx.stroke();
}

/**
 * Draw magical floating particles (fireflies/spores) above the farm.
 */
export function drawMagicParticles(ctx, particles) {
  for (const p of particles) {
    const alpha = 0.4 + 0.5 * Math.sin(p.phase);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Create initial set of ambient magic particles.
 * Particles float in screen space above the farm area.
 */
export function createMagicParticles(count, canvasW, canvasH) {
  const colors = ['#c0a0ff', '#80c0ff', '#ffa0e0', '#a0ffc0', '#fff080'];
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      sx: Math.random() * canvasW,
      sy: Math.random() * canvasH * 0.8,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.4,
      size: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.02 + Math.random() * 0.04,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  return particles;
}

export function updateMagicParticles(particles, dt, canvasW, canvasH) {
  for (const p of particles) {
    p.sx += p.vx * dt * 0.06;
    p.sy += p.vy * dt * 0.06;
    p.phase += p.phaseSpeed * dt * 0.06;
    // Wrap when off screen
    if (p.sy < -10) { p.sy = canvasH + 5; p.sx = Math.random() * canvasW; }
    if (p.sx < -10) p.sx = canvasW + 5;
    if (p.sx > canvasW + 10) p.sx = -5;
  }
}

function lerpColor(c1, c2, t) {
  const r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
  const r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
  const r = Math.round(r1 + (r2-r1)*t).toString(16).padStart(2,'0');
  const g = Math.round(g1 + (g2-g1)*t).toString(16).padStart(2,'0');
  const b = Math.round(b1 + (b2-b1)*t).toString(16).padStart(2,'0');
  return `#${r}${g}${b}`;
}
