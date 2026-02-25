/**
 * spaceArena.js — Space background renderer for Level 3.
 * 3-layer parallax starfield, Battlezone-style perspective grid, nebula tints, edge vignette.
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';

// ── Star layers ──
// Layer 0: distant (small, dim, slow)
// Layer 1: mid (medium, moderate, medium speed)
// Layer 2: close (larger, bright, fast)

const LAYER_COUNT = 3;
const STARS_PER_LAYER = 150;

const LAYER_CONFIGS = [
  { speed: 4,  minSize: 0.5, maxSize: 1.0, minAlpha: 0.2, maxAlpha: 0.5 },
  { speed: 10, minSize: 1.0, maxSize: 1.8, minAlpha: 0.4, maxAlpha: 0.75 },
  { speed: 22, minSize: 1.5, maxSize: 2.5, minAlpha: 0.6, maxAlpha: 1.0 },
];

let layers = [];    // Array of arrays of star objects
let elapsed = 0;
let gridRipples = [];  // Active shockwave ripples from explosions

// Environment theming — set by initArena from environment_item visual_effect colors
let gridColor = '0, 255, 255';   // default cyan (R, G, B as string for rgba())
let nebulaColor1 = '60, 0, 100';
let nebulaColor2 = '0, 30, 90';
let nebulaColor3 = '80, 0, 60';

// Grid config
const GRID_VANISH_X = CANVAS_WIDTH / 2;
const GRID_VANISH_Y = CANVAS_HEIGHT * 0.28; // vanishing point above center
const GRID_BOTTOM_Y = CANVAS_HEIGHT;

// Number of vertical "fan" lines radiating from vanish point
const GRID_V_LINES = 16;
// Number of horizontal receding lines
const GRID_H_LINES = 10;

function randomStar(layerIdx) {
  const cfg = LAYER_CONFIGS[layerIdx];
  return {
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    size: cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize),
    alpha: cfg.minAlpha + Math.random() * (cfg.maxAlpha - cfg.minAlpha),
    twinkleOffset: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.5 + Math.random() * 1.5,
  };
}

/**
 * Parse a hex color string into an "R, G, B" string for use in rgba().
 * @param {string} hex — e.g. '#FF4400'
 * @returns {string} e.g. '255, 68, 0'
 */
function hexToRgbStr(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return `${r}, ${g}, ${b}`;
}

/**
 * Add a shockwave ripple to the perspective grid, centered at (x, y).
 * @param {number} x
 * @param {number} y
 */
export function addGridRipple(x, y) {
  gridRipples.push({ x, y, time: 0, maxTime: 700 });
}

/**
 * Initialize the arena state.
 * @param {number} _cw — canvas width (unused; uses CANVAS_WIDTH constant)
 * @param {number} _ch — canvas height (unused; uses CANVAS_HEIGHT constant)
 * @param {Object} [envItem] — optional environment_item data for color theming
 */
export function initArena(_cw, _ch, envItem) {
  elapsed = 0;
  layers = [];
  for (let l = 0; l < LAYER_COUNT; l++) {
    const stars = [];
    for (let i = 0; i < STARS_PER_LAYER; i++) {
      stars.push(randomStar(l));
    }
    layers.push(stars);
  }

  // Apply environment color theming
  const c1 = envItem?.visual_effect?.color_primary;
  const c2 = envItem?.visual_effect?.color_secondary;
  const rgb1 = c1 ? hexToRgbStr(c1) : null;
  const rgb2 = c2 ? hexToRgbStr(c2) : null;

  if (rgb1) {
    gridColor = rgb1;
    nebulaColor1 = rgb1;
    nebulaColor3 = rgb1;
  } else {
    gridColor = '0, 255, 255';
    nebulaColor1 = '60, 0, 100';
    nebulaColor3 = '80, 0, 60';
  }
  if (rgb2) {
    nebulaColor2 = rgb2;
  } else {
    nebulaColor2 = '0, 30, 90';
  }
}

/**
 * Update arena state.
 * @param {number} dt — delta time in seconds
 */
export function updateArena(dt) {
  elapsed += dt;
  // Scroll all layers downward at different speeds to create parallax
  for (let l = 0; l < LAYER_COUNT; l++) {
    const speed = LAYER_CONFIGS[l].speed;
    for (const star of layers[l]) {
      star.y += speed * dt;
      // Wrap stars that scroll off the bottom
      if (star.y > CANVAS_HEIGHT + 4) {
        star.y = -4;
        star.x = Math.random() * CANVAS_WIDTH;
      }
    }
  }

  // Age ripples and prune expired ones
  const dtMs = dt * 1000;
  for (const r of gridRipples) r.time += dtMs;
  gridRipples = gridRipples.filter(r => r.time < r.maxTime);
}

/**
 * Draw the full space arena background.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cw — canvas width
 * @param {number} ch — canvas height
 */
export function drawArena(ctx, cw, ch) {
  // ── Deep space background ──
  const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
  bgGrad.addColorStop(0, '#04020E');
  bgGrad.addColorStop(0.4, '#08041A');
  bgGrad.addColorStop(0.75, '#0A0520');
  bgGrad.addColorStop(1, '#060215');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cw, ch);

  // ── Nebula color blobs (subtle radial gradients) ──
  drawNebula(ctx, cw * 0.15, ch * 0.25, cw * 0.45, `rgba(${nebulaColor1}, 0.07)`);
  drawNebula(ctx, cw * 0.85, ch * 0.6,  cw * 0.4,  `rgba(${nebulaColor2}, 0.09)`);
  drawNebula(ctx, cw * 0.5,  ch * 0.8,  cw * 0.35, `rgba(${nebulaColor3}, 0.06)`);

  // ── Perspective grid ──
  drawPerspectiveGrid(ctx, cw, ch);

  // ── Stars (3 layers, back to front) ──
  for (let l = 0; l < LAYER_COUNT; l++) {
    drawStarLayer(ctx, layers[l], l);
  }

  // ── Edge vignette / fog ──
  drawVignette(ctx, cw, ch);
}

// ── Internal helpers ──

function drawNebula(ctx, cx, cy, radius, color) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/**
 * Compute cumulative ripple displacement for a point (px, py).
 * @returns {{dx: number, dy: number}}
 */
function rippleDisplace(px, py) {
  let totalDx = 0;
  let totalDy = 0;
  for (const r of gridRipples) {
    const progress  = r.time / r.maxTime;
    const waveRadius = progress * 650;
    const ddx = px - r.x;
    const ddy = py - r.y;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist < 1) continue;
    const thickness = 55 * (1 - progress * 0.4);
    const waveDist  = Math.abs(dist - waveRadius);
    if (waveDist > thickness) continue;
    const strength    = (1 - progress) * 18;
    const phase       = (1 - waveDist / thickness) * Math.PI;
    const displacement = Math.sin(phase) * strength;
    totalDx += (ddx / dist) * displacement;
    totalDy += (ddy / dist) * displacement;
  }
  return { dx: totalDx, dy: totalDy };
}

/**
 * Draw a line from (x1,y1) to (x2,y2) with ripple distortion applied,
 * subdivided into `segs` segments.
 */
function drawDistortedLine(ctx, x1, y1, x2, y2, segs) {
  ctx.beginPath();
  for (let s = 0; s <= segs; s++) {
    const t  = s / segs;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    const { dx, dy } = rippleDisplace(px, py);
    if (s === 0) ctx.moveTo(px + dx, py + dy);
    else         ctx.lineTo(px + dx, py + dy);
  }
  ctx.stroke();
}

function drawPerspectiveGrid(ctx, cw, ch) {
  ctx.save();
  ctx.lineWidth = 0.8;

  const vx = GRID_VANISH_X;
  const vy = GRID_VANISH_Y;
  const leftX  = -cw * 0.1;
  const rightX =  cw * 1.1;

  // Subdivide lines more when ripples are active for smoother distortion
  const segs = gridRipples.length > 0 ? 12 : 2;

  // ── Vertical fan lines ──
  ctx.strokeStyle = `rgba(${gridColor}, 0.22)`;
  for (let i = 0; i <= GRID_V_LINES; i++) {
    const t  = i / GRID_V_LINES;
    const bx = leftX + t * (rightX - leftX);
    drawDistortedLine(ctx, vx, vy, bx, GRID_BOTTOM_Y, segs);
  }

  // ── Horizontal receding lines ──
  ctx.strokeStyle = `rgba(${gridColor}, 0.15)`;
  for (let i = 1; i <= GRID_H_LINES; i++) {
    const t     = (i / GRID_H_LINES) ** 1.8;
    const lineY = vy + t * (GRID_BOTTOM_Y - vy);
    const horizT = (lineY - vy) / (GRID_BOTTOM_Y - vy);
    const lx = vx + (leftX  - vx) * horizT;
    const rx = vx + (rightX - vx) * horizT;
    drawDistortedLine(ctx, lx, lineY, rx, lineY, segs);
  }

  ctx.restore();
}

function drawStarLayer(ctx, stars, layerIdx) {
  ctx.save();
  for (const star of stars) {
    // Subtle twinkle
    const twinkle = 0.7 + 0.3 * Math.sin(elapsed * star.twinkleSpeed + star.twinkleOffset);
    const alpha = star.alpha * twinkle;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawVignette(ctx, cw, ch) {
  // Radial gradient vignette from center to edges
  const grad = ctx.createRadialGradient(
    cw / 2, ch / 2, ch * 0.25,
    cw / 2, ch / 2, ch * 0.85,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);
}
