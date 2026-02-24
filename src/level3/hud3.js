/**
 * hud3.js — HUD renderer for Level 3 space shooter.
 * Neon cyan/yellow monospace styling over a semi-transparent top bar.
 */

const HUD_HEIGHT = 40;
const FONT_MAIN = 'bold 14px monospace';
const FONT_TIMER = 'bold 20px monospace';
const FONT_SHIP = '10px monospace'; // for life icons (drawn as tiny triangles)

/**
 * Draw the Level 3 HUD.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} score
 * @param {number} timeRemaining — seconds remaining
 * @param {number} lives — current lives
 * @param {number} maxLives
 * @param {number} cw — canvas width
 * @param {number} ch — canvas height
 * @param {number} [enemyCount] — optional: living enemy count for bottom strip
 */
export function drawHUD3(ctx, score, timeRemaining, lives, maxLives, cw, ch, enemyCount) {
  ctx.save();

  // ── Top bar background ──
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, cw, HUD_HEIGHT);

  // Subtle top bar border line
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_HEIGHT);
  ctx.lineTo(cw, HUD_HEIGHT);
  ctx.stroke();

  // ── LEFT: Score ──
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#00FFFF';
  ctx.fillStyle = '#00FFFF';
  ctx.font = FONT_MAIN;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const scoreStr = String(score).padStart(6, '0');
  ctx.fillText(`SCORE: ${scoreStr}`, 12, HUD_HEIGHT / 2);

  // ── CENTER: Countdown timer ──
  const secs = Math.max(0, Math.ceil(timeRemaining));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  const timerStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const urgent = timeRemaining < 10;
  ctx.shadowBlur = urgent ? 16 : 10;
  ctx.shadowColor = urgent ? '#FF3333' : '#FFEE44';
  ctx.fillStyle = urgent ? '#FF5555' : '#FFE033';
  ctx.font = FONT_TIMER;
  ctx.textAlign = 'center';
  ctx.fillText(timerStr, cw / 2, HUD_HEIGHT / 2);

  // ── RIGHT: Life icons (small ship triangles) ──
  const iconSize = 10;
  const iconSpacing = 18;
  const iconBaseX = cw - 14 - (maxLives - 1) * iconSpacing;
  const iconY = HUD_HEIGHT / 2;

  for (let i = 0; i < maxLives; i++) {
    const alive = i < lives;
    const ix = iconBaseX + i * iconSpacing;

    ctx.save();
    ctx.translate(ix, iconY);

    if (alive) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FFFFFF';
      ctx.strokeStyle = '#FFFFFF';
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    }

    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -iconSize);          // nose
    ctx.lineTo(iconSize * 0.7, iconSize * 0.8);   // right rear
    ctx.lineTo(0, iconSize * 0.4);     // rear notch
    ctx.lineTo(-iconSize * 0.7, iconSize * 0.8);  // left rear
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  // ── Bottom strip: enemy count (optional) ──
  if (enemyCount !== undefined) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, ch - 24, cw, 24);

    ctx.strokeStyle = 'rgba(0, 255, 204, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ch - 24);
    ctx.lineTo(cw, ch - 24);
    ctx.stroke();

    ctx.shadowBlur = 6;
    ctx.shadowColor = '#00FFCC';
    ctx.fillStyle = '#00FFCC';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ENEMIES: ${enemyCount}`, cw / 2, ch - 12);
  }

  ctx.restore();
}
