/**
 * HUD — heads-up display overlay showing health, weapon, item, deaths, timer.
 */

import {
  CANVAS_WIDTH, PLAYER_MAX_HP,
  COLOR_HUD_BG, COLOR_HP_BAR, COLOR_HP_BG, COLOR_TEXT, COLOR_ACCENT,
} from './constants.js';

const HUD_Y = 8;
const HUD_H = 36;
const HP_BAR_W = 120;
const HP_BAR_H = 12;

/**
 * Draw the in-game HUD.
 */
export function drawHUD(ctx, player, weapon, envItem, deaths, elapsedMs) {
  // Semi-transparent background bar
  ctx.fillStyle = COLOR_HUD_BG;
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_H + HUD_Y * 2);

  ctx.font = '12px monospace';

  // ── HP bar ──
  const hpX = 10;
  const hpY = HUD_Y + 4;
  // Background
  ctx.fillStyle = COLOR_HP_BG;
  ctx.fillRect(hpX, hpY, HP_BAR_W, HP_BAR_H);
  // Foreground
  const hpPct = Math.max(0, player.hp / PLAYER_MAX_HP);
  ctx.fillStyle = hpPct > 0.3 ? COLOR_HP_BAR : '#FF6644';
  ctx.fillRect(hpX, hpY, HP_BAR_W * hpPct, HP_BAR_H);
  // Border
  ctx.strokeStyle = COLOR_TEXT;
  ctx.lineWidth = 1;
  ctx.strokeRect(hpX, hpY, HP_BAR_W, HP_BAR_H);
  // Label
  ctx.fillStyle = COLOR_TEXT;
  ctx.fillText(`HP ${player.hp}/${PLAYER_MAX_HP}`, hpX, hpY + HP_BAR_H + 12);

  // ── Weapon name ──
  const weaponX = 160;
  ctx.fillStyle = COLOR_ACCENT;
  ctx.fillText(`⚔ ${weapon?.name || '---'}`, weaponX, hpY + 10);

  // ── Environment item ──
  const itemX = 380;
  if (envItem && envItem.pickedUp && !envItem.used) {
    ctx.fillStyle = '#44DDFF';
    ctx.fillText(`★ ${envItem.name} [K/X]`, itemX, hpY + 10);
  } else if (envItem?.used) {
    ctx.fillStyle = '#666';
    ctx.fillText(`★ ${envItem.name} (used)`, itemX, hpY + 10);
  } else if (envItem && !envItem.pickedUp) {
    ctx.fillStyle = '#666';
    ctx.fillText(`★ ??? (find it!)`, itemX, hpY + 10);
  }

  // ── Deaths ──
  const deathX = CANVAS_WIDTH - 180;
  ctx.fillStyle = COLOR_TEXT;
  ctx.fillText(`Deaths: ${deaths}`, deathX, hpY + 10);

  // ── Timer ──
  const timerX = CANVAS_WIDTH - 80;
  const secs = Math.floor(elapsedMs / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  ctx.fillText(`${mins}:${String(s).padStart(2, '0')}`, timerX, hpY + 10);
}

/**
 * Draw obstacle HP bar above the creature.
 */
export function drawObstacleHP(ctx, obstacle) {
  if (obstacle.dead) return;

  const barW = obstacle.width + 10;
  const barH = 6;
  const bx = obstacle.x + obstacle.width / 2 - barW / 2;
  const by = obstacle.y - 14;

  // Background
  ctx.fillStyle = COLOR_HP_BG;
  ctx.fillRect(bx, by, barW, barH);
  // Foreground
  const pct = obstacle.hp / obstacle.maxHp;
  ctx.fillStyle = pct > 0.3 ? '#FF8844' : '#FF3333';
  ctx.fillRect(bx, by, barW * pct, barH);
  // Border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, barW, barH);

  // Name
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(obstacle.name, obstacle.x + obstacle.width / 2, by - 3);
  ctx.textAlign = 'left';

  // Flavor text
  if (obstacle.showDescription) {
    ctx.fillStyle = COLOR_ACCENT;
    ctx.font = 'italic 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`"${obstacle.description}"`, obstacle.x + obstacle.width / 2, by - 16);
    ctx.textAlign = 'left';
  }
}
