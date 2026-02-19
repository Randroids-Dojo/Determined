/**
 * HUD3D — Heads-up display overlay for Level 2 (3D).
 * Draws on a separate 2D canvas layered on top of the 3D canvas.
 */

import { CANVAS_WIDTH, CANVAS_HEIGHT, L2_PLAYER_HP } from '../constants.js';

const HUD_Y = 8;
const HUD_H = 36;
const HP_BAR_W = 120;
const HP_BAR_H = 12;

/**
 * Draw the Level 2 HUD on a 2D overlay canvas.
 */
export function drawHUD3D(ctx, player, weapon, envItem, obstacle, deaths, elapsedMs) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Semi-transparent top bar
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_H + HUD_Y * 2);

  ctx.font = '12px monospace';

  // ── Level indicator ──
  ctx.fillStyle = '#aa66ff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('LEVEL 2', 10, HUD_Y + 10);
  ctx.font = '12px monospace';

  // ── Player HP bar ──
  const hpX = 80;
  const hpY = HUD_Y + 4;
  ctx.fillStyle = '#DD4444';
  ctx.fillRect(hpX, hpY, HP_BAR_W, HP_BAR_H);
  const hpPct = Math.max(0, player.hp / player.maxHp);
  ctx.fillStyle = hpPct > 0.3 ? '#44DD44' : '#FF6644';
  ctx.fillRect(hpX, hpY, HP_BAR_W * hpPct, HP_BAR_H);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.strokeRect(hpX, hpY, HP_BAR_W, HP_BAR_H);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`HP ${player.hp}/${player.maxHp}`, hpX, hpY + HP_BAR_H + 12);

  // ── Weapon name ──
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`⚔ ${weapon?.name || '---'}`, 230, hpY + 10);

  // ── Environment item status ──
  const itemX = 400;
  if (envItem && envItem.pickedUp && !envItem.used) {
    ctx.fillStyle = '#44DDFF';
    ctx.fillText(`⚡ ${envItem.name} [K/X]`, itemX, hpY + 10);
  } else if (envItem?.used) {
    ctx.fillStyle = '#666';
    ctx.fillText(`⚡ ${envItem.name} (used)`, itemX, hpY + 10);
  } else if (envItem && !envItem.pickedUp) {
    ctx.fillStyle = '#666';
    const label = envItem.keyword ? envItem.keyword.charAt(0).toUpperCase() + envItem.keyword.slice(1) : '???';
    ctx.fillText(`⚡ ${label} (find it!)`, itemX, hpY + 10);
  }

  // ── Deaths ──
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`Deaths: ${deaths}`, CANVAS_WIDTH - 180, hpY + 10);

  // ── Timer ──
  const secs = Math.floor(elapsedMs / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  ctx.fillText(`${mins}:${String(s).padStart(2, '0')}`, CANVAS_WIDTH - 80, hpY + 10);

  // ── Enemy HP bar (bottom of screen) ──
  if (obstacle && !obstacle.dead) {
    const eBarW = 200;
    const eBarH = 10;
    const eBarX = (CANVAS_WIDTH - eBarW) / 2;
    const eBarY = CANVAS_HEIGHT - 40;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(eBarX - 5, eBarY - 18, eBarW + 10, 36);

    // Name
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(obstacle.name, CANVAS_WIDTH / 2, eBarY - 4);

    // HP bar
    ctx.fillStyle = '#DD4444';
    ctx.fillRect(eBarX, eBarY, eBarW, eBarH);
    const ePct = obstacle.hp / obstacle.maxHp;
    ctx.fillStyle = ePct > 0.3 ? '#FF8844' : '#FF3333';
    ctx.fillRect(eBarX, eBarY, eBarW * ePct, eBarH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(eBarX, eBarY, eBarW, eBarH);

    // Description (first 3 seconds)
    if (obstacle.showDescription) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'italic 10px monospace';
      ctx.fillText(`"${obstacle.description}"`, CANVAS_WIDTH / 2, eBarY + 22);
    }

    ctx.textAlign = 'left';
    ctx.font = '12px monospace';
  }

  // ── Death overlay ──
  if (player.dead) {
    ctx.fillStyle = 'rgba(180, 0, 0, 0.4)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#FF2222';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YOU DIED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px monospace';
    ctx.fillText(`Death #${deaths + 1}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 24);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Victory overlay ──
  if (player.state === 'victory') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL 2 COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
