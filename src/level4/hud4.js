/**
 * hud4.js — HUD for Level 4 fantasy milk collection.
 * Displays: time remaining, bottles delivered, milk prompt, urgency.
 */

export function drawHUD4(ctx, canvasW, canvasH, timeRemaining, bottlesDelivered, milkPromptCow, playerCarrying, itemAvailable) {
  const hudY = 8;
  const hudH = 36;
  const pad = 12;

  // HUD background bar
  ctx.save();
  ctx.fillStyle = 'rgba(10, 5, 30, 0.75)';
  ctx.strokeStyle = 'rgba(180,140,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(pad, hudY, canvasW - pad * 2, hudH, 8);
  ctx.fill();
  ctx.stroke();

  // Time remaining
  const secs = Math.max(0, Math.floor(timeRemaining));
  const urgency = timeRemaining < 20;
  ctx.fillStyle = urgency ? '#ff4444' : '#ffffff';
  ctx.font = `bold ${urgency ? 16 : 14}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (urgency) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff4444';
  }
  ctx.fillText(`⏱ ${String(Math.floor(secs / 60)).padStart(2,'0')}:${String(secs % 60).padStart(2,'0')}`, pad + 12, hudY + hudH / 2);
  ctx.shadowBlur = 0;

  // Bottles delivered (centered)
  ctx.fillStyle = '#ffe080';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 4;
  ctx.shadowColor = '#ffe080';
  ctx.fillText(`🥛 × ${bottlesDelivered}`, canvasW / 2, hudY + hudH / 2);
  ctx.shadowBlur = 0;

  // Right side: carrying message takes priority, else show item status
  if (playerCarrying) {
    ctx.fillStyle = '#80e0ff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#80e0ff';
    ctx.fillText('🧴 DELIVER TO FARMHOUSE!', canvasW - pad - 12, hudY + hudH / 2);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = itemAvailable ? '#80e0ff' : '#445566';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    if (itemAvailable) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#80e0ff';
    }
    ctx.fillText(itemAvailable ? '[X] ❄ Freeze Cows' : '❄ Used', canvasW - pad - 12, hudY + hudH / 2);
    ctx.shadowBlur = 0;
  }

  ctx.restore();

  // Milk prompt (shown when near a milkable cow)
  if (milkPromptCow) {
    const promptY = canvasH - 60;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.roundRect(canvasW / 2 - 100, promptY - 12, 200, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#a0ffb0';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('[Z] Hold to milk ' + milkPromptCow.name, canvasW / 2, promptY + 2);
    ctx.restore();
  }

  // Urgency vignette (pulsing red border when time < 20s)
  if (timeRemaining < 20) {
    const pulse = 0.15 + 0.12 * Math.sin(Date.now() * 0.008);
    const gradient = ctx.createRadialGradient(
      canvasW/2, canvasH/2, canvasH * 0.3,
      canvasW/2, canvasH/2, canvasH * 0.8
    );
    gradient.addColorStop(0, 'rgba(180,0,0,0)');
    gradient.addColorStop(1, `rgba(180,0,0,${pulse})`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }
}

/**
 * Draw a delivery confirmation flash (sparkles + text).
 */
export function drawDeliveryFlash(ctx, canvasW, canvasH, flashProgress) {
  if (flashProgress <= 0) return;
  ctx.save();
  ctx.globalAlpha = flashProgress * 0.8;
  ctx.fillStyle = '#ffe080';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#ffe080';
  ctx.fillText('+1 BOTTLE DELIVERED!', canvasW / 2, canvasH / 2 - 20);
  ctx.restore();
}
