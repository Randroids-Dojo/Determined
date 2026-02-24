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
 * Initialize the arena state.
 * @param {number} _cw — canvas width (unused; uses CANVAS_WIDTH constant)
 * @param {number} _ch — canvas height (unused; uses CANVAS_HEIGHT constant)
 */
export function initArena(_cw, _ch) {
  elapsed = 0;
  layers = [];
  for (let l = 0; l < LAYER_COUNT; l++) {
    const stars = [];
    for (let i = 0; i < STARS_PER_LAYER; i++) {
      stars.push(randomStar(l));
    }
    layers.push(stars);
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
  drawNebula(ctx, cw * 0.15, ch * 0.25, cw * 0.45, 'rgba(60, 0, 100, 0.07)');
  drawNebula(ctx, cw * 0.85, ch * 0.6,  cw * 0.4,  'rgba(0, 30, 90, 0.09)');
  drawNebula(ctx, cw * 0.5,  ch * 0.8,  cw * 0.35, 'rgba(80, 0, 60, 0.06)');

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

function drawPerspectiveGrid(ctx, cw, ch) {
  ctx.save();
  ctx.lineWidth = 0.8;

  // ── Vertical fan lines radiating from vanish point ──
  const vx = GRID_VANISH_X;
  const vy = GRID_VANISH_Y;

  // Fan lines spread from left edge to right edge at bottom
  const leftX = -cw * 0.1;
  const rightX = cw * 1.1;

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.18)';
  ctx.beginPath();
  for (let i = 0; i <= GRID_V_LINES; i++) {
    const t = i / GRID_V_LINES;
    const bx = leftX + t * (rightX - leftX);
    ctx.moveTo(vx, vy);
    ctx.lineTo(bx, GRID_BOTTOM_Y);
  }
  ctx.stroke();

  // ── Horizontal receding lines ──
  // Use perspective foreshortening: lines bunch up near the vanish point
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.12)';
  ctx.beginPath();
  for (let i = 1; i <= GRID_H_LINES; i++) {
    // Quadratic distribution: lines crowd near vanish point
    const t = (i / GRID_H_LINES) ** 1.8;
    const lineY = vy + t * (GRID_BOTTOM_Y - vy);

    // How wide is the grid at this Y? Interpolate from 0 (at vanish) to full width (at bottom)
    const horizT = (lineY - vy) / (GRID_BOTTOM_Y - vy);
    const lx = vx + (leftX - vx) * horizT;
    const rx = vx + (rightX - vx) * horizT;

    ctx.moveTo(lx, lineY);
    ctx.lineTo(rx, lineY);
  }
  ctx.stroke();

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
