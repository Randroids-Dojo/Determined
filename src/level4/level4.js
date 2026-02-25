/**
 * level4.js — Level 4: Fantasy Voxel Farm — Milk Collection.
 *
 * Gameplay:
 *   - Isometric top-down voxel farm with magical fantasy theme
 *   - 3 fantasy cows roam the pasture peacefully (no combat)
 *   - Player holds Z near a cow to fill a milk bottle (2 sec)
 *   - Player carries the bottle to the glowing farmhouse door to deliver
 *   - 90-second timer — score = bottles delivered
 *   - No damage to player
 *
 * Art style:
 *   - Isometric voxel cubes (3-face parallelogram rendering)
 *   - Fantasy palette: enchanted greens, magical purples, warm farm tones
 *   - Floating magic particles (fireflies/spores)
 *   - LLM-generated creature colors applied to cow voxel art
 *
 * Controls:
 *   W/↑ = north-west  S/↓ = south-east  A/← = south-west  D/→ = north-east
 *   Z (hold) = milk   (no combat actions needed)
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import { pollInput, showTouchL4Controls } from '../input.js';
import {
  DELIVERY_GX, DELIVERY_GY,
  buildTerrainDrawList, renderTerrainDrawList,
  updateFarm, drawMagicParticles, updateMagicParticles,
  createMagicParticles,
} from './farmEnvironment.js';
import { sortDrawList, gridToScreen } from './voxelRenderer.js';
import {
  createCow, updateCow, milkCow, cowPlayerDistance, drawCow,
} from './cowObstacle.js';
import {
  createPlayer4, updatePlayer4, drawPlayer4,
} from './player4.js';
import { drawHUD4, drawDeliveryFlash } from './hud4.js';

// ── Constants ──
const GAME_DURATION = 90;        // seconds
const NUM_COWS = 3;
const MILK_INTERACT_RANGE = 1.8; // grid units — how close to milk
const DELIVERY_RANGE = 1.5;
const ORIGIN_X = CANVAS_WIDTH / 2;
const ORIGIN_Y = CANVAS_HEIGHT * 0.52;  // slightly below center for vertical balance

// ── Module state ──
let canvas = null;
let ctx = null;
let animFrameId = null;
let running = false;

let player = null;
let cows = [];
let magicParticles = [];

let bottlesDelivered = 0;
let timeRemaining = GAME_DURATION;
let lastTimestamp = 0;
let startTime = 0;

let deliveryFlash = 0;         // 0..1 fading flash on delivery
let milkingCowId = null;       // which cow is currently being milked
let onVictoryCallback = null;
let prevDeaths = 0;
let prevTimeMs = 0;

// Magic item (X key) — freeze all cows briefly
let envItemData = null;
let itemAvailable = true;
let itemActive = false;
let itemTimer = 0;
const ITEM_DURATION = 2000;      // ms for the flash animation
const COW_FREEZE_DURATION = 5.0; // seconds cows are frozen

/**
 * Initialize and start Level 4.
 */
export function startLevel4(data, _prevDeaths, _prevTimeMs, words, onVictory) {
  canvas = document.getElementById('game-canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  ctx = canvas.getContext('2d');

  onVictoryCallback = onVictory;
  prevDeaths = _prevDeaths || 0;
  prevTimeMs = _prevTimeMs || 0;
  envItemData = data?.environment_item || null;

  // Show canvas (was hidden during Level 2)
  canvas.style.display = '';

  // Create player starting position (path tile row 5, left side)
  player = createPlayer4(5, 5);

  // Create cows scattered in the pasture
  const cowStartPositions = [
    [7, 2], [9, 5], [6, 7],
  ];
  cows = [];
  for (let i = 0; i < NUM_COWS; i++) {
    const [cgx, cgy] = cowStartPositions[i % cowStartPositions.length];
    // Stagger starting positions slightly
    cows.push(createCow(data?.obstacle || {}, cgx + i, cgy, i));
  }

  // Magic particles
  magicParticles = createMagicParticles(28, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Reset game state
  bottlesDelivered = 0;
  timeRemaining = GAME_DURATION;
  deliveryFlash = 0;
  milkingCowId = null;
  itemAvailable = true;
  itemActive = false;
  itemTimer = 0;
  lastTimestamp = 0;
  startTime = Date.now();
  running = true;

  // Level 4 touch layout — d-pad + jump (Space) + milk (Z) + item (X)
  showTouchL4Controls();

  animFrameId = requestAnimationFrame(gameLoop);
}

export function cleanupLevel4() {
  running = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  canvas = null;
  ctx = null;
  cows = [];
  magicParticles = [];
  player = null;
}

// ── Game Loop ──

function gameLoop(timestamp) {
  if (!running) return;
  animFrameId = requestAnimationFrame(gameLoop);

  let dt = lastTimestamp ? timestamp - lastTimestamp : 16;
  dt = Math.min(dt, 100); // cap to avoid spiral of death
  lastTimestamp = timestamp;

  update(dt);
  render();
}

function update(dt) {
  const dtSec = dt / 1000;
  const actions = pollInput();

  // Countdown timer
  timeRemaining -= dtSec;

  // Update farm animations
  updateFarm(dt);
  updateMagicParticles(magicParticles, dt, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Update player
  updatePlayer4(player, actions, dt);

  // Update cows
  for (const cow of cows) {
    updateCow(cow, dt);
  }

  // Find nearest milkable cow
  let nearestCow = null;
  let nearestDist = Infinity;
  for (const cow of cows) {
    const d = cowPlayerDistance(cow, player.gx, player.gy);
    if (d < MILK_INTERACT_RANGE && d < nearestDist) {
      nearestDist = d;
      nearestCow = cow;
    }
  }

  // Milking logic
  if (actions.attack && nearestCow && !player.carryingBottle) {
    // Reset previous cow's progress if the player switched cows mid-milk
    if (milkingCowId !== null && milkingCowId !== nearestCow.id) {
      const oldCow = cows.find(c => c.id === milkingCowId);
      if (oldCow) oldCow.milkProgress = 0;
    }
    milkingCowId = nearestCow.id;
    const result = milkCow(nearestCow, dt);
    if (result === 'full') {
      // Got a full bottle
      player.carryingBottle = true;
      milkingCowId = null;
    }
  } else {
    // Cancel milking if player moved away or released Z
    if (milkingCowId !== null) {
      const activeCow = cows.find(c => c.id === milkingCowId);
      if (activeCow) {
        const stillNear = cowPlayerDistance(activeCow, player.gx, player.gy) < MILK_INTERACT_RANGE;
        if (!stillNear || !actions.attack) {
          activeCow.milkProgress = 0; // reset progress
          milkingCowId = null;
        }
      }
    }
  }

  // Delivery logic — player at farmhouse door with bottle
  if (player.carryingBottle) {
    const delivDist = Math.sqrt(
      Math.pow(player.gx - (DELIVERY_GX + 0.5), 2) +
      Math.pow(player.gy - (DELIVERY_GY + 0.5), 2)
    );
    if (delivDist < DELIVERY_RANGE) {
      bottlesDelivered++;
      player.carryingBottle = false;
      deliveryFlash = 1.0;
      player.deliverFlash = 1.0;
    }
  }

  // Delivery flash decay
  if (deliveryFlash > 0) deliveryFlash -= dtSec * 1.5;

  // Magic item (X key) — freeze all cows
  if (actions.item && itemAvailable && !itemActive) {
    triggerMagicItem();
  }
  if (itemActive) {
    itemTimer += dt;
    if (itemTimer >= ITEM_DURATION) {
      itemActive = false;
    }
  }

  // Win condition — time runs out
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    endLevel4();
  }
}

function triggerMagicItem() {
  itemAvailable = false;
  itemActive = true;
  itemTimer = 0;
  // Freeze all cows in place
  for (const cow of cows) {
    cow.frozenTimer = COW_FREEZE_DURATION;
  }
}

function endLevel4() {
  running = false;
  cancelAnimationFrame(animFrameId);

  const totalTimeMs = prevTimeMs + (Date.now() - startTime);
  if (onVictoryCallback) {
    onVictoryCallback(prevDeaths, totalTimeMs, bottlesDelivered);
  }
}

// ── Render ──

function render() {
  // Sky — deep magical twilight gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  skyGrad.addColorStop(0, '#1a0533');
  skyGrad.addColorStop(0.45, '#3a1468');
  skyGrad.addColorStop(1, '#2a4a1a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Distant mountain silhouettes (atmospheric)
  drawMountains(ctx);

  // Magic particles (behind terrain)
  drawMagicParticles(ctx, magicParticles);

  // Build terrain draw list
  const drawList = buildTerrainDrawList(ORIGIN_X, ORIGIN_Y);

  // Add cow draw calls (approximate depth for sorting)
  // We draw cows after terrain is rendered (overlay approach)
  // Sort and render terrain
  sortDrawList(drawList);
  renderTerrainDrawList(ctx, drawList, ORIGIN_X, ORIGIN_Y);

  // Draw entities on top (cows and player sorted by iso depth)
  const entities = [
    ...cows.map(cow => ({
      type: 'cow',
      depth: cow.gx + cow.gy,
      data: cow,
    })),
    {
      type: 'player',
      depth: player.gx + player.gy,
      data: player,
    },
  ];
  entities.sort((a, b) => a.depth - b.depth);

  for (const entity of entities) {
    if (entity.type === 'cow') {
      drawCow(ctx, entity.data, ORIGIN_X, ORIGIN_Y);
    } else {
      drawPlayer4(ctx, entity.data, ORIGIN_X, ORIGIN_Y);
    }
  }

  // Delivery beacon (always visible above farmhouse)
  drawDeliveryBeacon(ctx);

  // Item flash effect
  drawItemFlash(ctx);

  // Delivery flash
  drawDeliveryFlash(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, deliveryFlash);

  // HUD
  const nearestCowForPrompt = getNearestMilkableCow();
  drawHUD4(
    ctx,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    timeRemaining,
    bottlesDelivered,
    nearestCowForPrompt && !player.carryingBottle ? nearestCowForPrompt : null,
    player.carryingBottle,
    itemAvailable,
  );
}

function getNearestMilkableCow() {
  let best = null;
  let bestDist = Infinity;
  for (const cow of cows) {
    if (!cow.canBeMilked) continue;
    const d = cowPlayerDistance(cow, player.gx, player.gy);
    if (d < MILK_INTERACT_RANGE && d < bestDist) {
      bestDist = d;
      best = cow;
    }
  }
  return best;
}

/**
 * Draw a pulsing beacon above the farmhouse delivery zone so it is always visible.
 */
function drawDeliveryBeacon(ctx) {
  // Delivery tile is at (4,2) — on the stone path in front of the farmhouse.
  const beaconGX = 4.5;
  const beaconGY = 2.5;
  const pos = gridToScreen(beaconGX, beaconGY, 4, ORIGIN_X, ORIGIN_Y);
  const cx = pos.x;
  const bounce = Math.sin(Date.now() * 0.004) * 5;
  const cy = pos.y + bounce;

  const alpha = player.carryingBottle ? 1.0 : 0.65;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#ffe080';

  // Downward arrow
  ctx.fillStyle = '#ffe080';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 10);
  ctx.lineTo(cx - 9, cy - 4);
  ctx.lineTo(cx + 9, cy - 4);
  ctx.closePath();
  ctx.fill();

  // Label
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#fff8c0';
  ctx.font = `bold ${player.carryingBottle ? 13 : 11}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('DELIVER', cx, cy - 6);

  ctx.restore();
}

/**
 * Draw the magic item activation flash (expanding ring).
 */
function drawItemFlash(ctx) {
  if (!itemActive) return;
  const progress = itemTimer / ITEM_DURATION;
  const c1 = envItemData?.visual_effect?.color_primary || '#80e0ff';
  const c2 = envItemData?.visual_effect?.color_secondary || c1;

  if (progress < 0.25) {
    const flashAlpha = (1 - progress / 0.25) * 0.45;
    ctx.save();
    ctx.fillStyle = c1;
    ctx.globalAlpha = flashAlpha;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
  } else {
    const fade = (progress - 0.25) / 0.75;
    const ringRadius = fade * Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.9;
    ctx.save();
    ctx.globalAlpha = (1 - fade) * 0.55;
    ctx.strokeStyle = c2;
    ctx.lineWidth = 5 * (1 - fade) + 1;
    ctx.shadowBlur = 16;
    ctx.shadowColor = c1;
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draw distant mountain silhouettes for a fantasy depth effect.
 */
function drawMountains(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(60, 20, 100, 0.45)';
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT * 0.38);
  ctx.lineTo(80, CANVAS_HEIGHT * 0.20);
  ctx.lineTo(160, CANVAS_HEIGHT * 0.30);
  ctx.lineTo(240, CANVAS_HEIGHT * 0.15);
  ctx.lineTo(320, CANVAS_HEIGHT * 0.25);
  ctx.lineTo(400, CANVAS_HEIGHT * 0.18);
  ctx.lineTo(480, CANVAS_HEIGHT * 0.28);
  ctx.lineTo(560, CANVAS_HEIGHT * 0.12);
  ctx.lineTo(640, CANVAS_HEIGHT * 0.22);
  ctx.lineTo(720, CANVAS_HEIGHT * 0.17);
  ctx.lineTo(800, CANVAS_HEIGHT * 0.30);
  ctx.lineTo(800, CANVAS_HEIGHT);
  ctx.lineTo(0, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Closer ridge
  ctx.fillStyle = 'rgba(30, 60, 20, 0.5)';
  ctx.beginPath();
  ctx.moveTo(0, CANVAS_HEIGHT * 0.48);
  ctx.lineTo(100, CANVAS_HEIGHT * 0.38);
  ctx.lineTo(200, CANVAS_HEIGHT * 0.44);
  ctx.lineTo(300, CANVAS_HEIGHT * 0.36);
  ctx.lineTo(400, CANVAS_HEIGHT * 0.42);
  ctx.lineTo(500, CANVAS_HEIGHT * 0.35);
  ctx.lineTo(600, CANVAS_HEIGHT * 0.43);
  ctx.lineTo(700, CANVAS_HEIGHT * 0.37);
  ctx.lineTo(800, CANVAS_HEIGHT * 0.45);
  ctx.lineTo(800, CANVAS_HEIGHT);
  ctx.lineTo(0, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
