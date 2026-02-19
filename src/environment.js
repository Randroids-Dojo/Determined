/**
 * Environment item — the one-time-use weather/force-of-nature effect.
 */

import { ENV_DMG_MIN, ENV_DMG_MAX } from './constants.js';
import { sfxItemUse } from './audio.js';
import { triggerScreenShake } from './renderer.js';

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Create environment item from LLM data.
 */
export function createEnvironmentItem(data) {
  const d = data || {};
  return {
    name: d.name || 'Mysterious Force',
    description: d.description || 'Something happens. To everyone.',
    effectType: d.effect_type || 'damage',   // damage | stun | terrain | buff | debuff | mixed
    damage: clamp(d.damage || 30, ENV_DMG_MIN, ENV_DMG_MAX),
    areaOfEffect: d.area_of_effect || 'full_screen',
    duration: (d.duration || 0) * 1000, // ms
    affectsPlayer: d.affects_player || { active: true, effect: 'Takes minor damage' },
    affectsObstacle: d.affects_obstacle || { active: true, effect: 'Takes major damage' },
    screenShake: d.screen_shake || 5,
    visualEffect: d.visual_effect || {
      type: 'flash',
      color_primary: '#FFFFFF',
      color_secondary: '#FFFF00',
      description: 'A bright flash fills the screen',
    },

    // Runtime state
    active: false,
    timer: 0,
    used: false,     // permanently used for this life
    pickedUp: false, // must walk to item before using
  };
}

/**
 * Activate the environment item. Returns { playerDmg, obstacleDmg, stunDuration }.
 */
export function activateEnvironmentItem(item) {
  if (item.used) return null;

  item.used = true;
  item.active = true;
  item.timer = Math.max(item.duration, 500); // at least 500ms for visual
  sfxItemUse();

  // Screen shake
  if (item.screenShake > 0) {
    triggerScreenShake(item.screenShake, Math.max(item.duration, 300));
  }

  // Compute effects
  let playerDmg = 0;
  let obstacleDmg = 0;
  let stunDuration = 0;

  if (item.affectsObstacle?.active) {
    if (item.effectType === 'damage' || item.effectType === 'mixed') {
      obstacleDmg = item.damage;
    }
    if (item.effectType === 'stun' || item.effectType === 'mixed') {
      stunDuration = item.duration || 2000;
    }
  }

  if (item.affectsPlayer?.active) {
    if (item.effectType === 'damage' || item.effectType === 'mixed') {
      playerDmg = Math.round(item.damage * 0.3); // Player takes less
    }
  }

  return { playerDmg, obstacleDmg, stunDuration };
}

/**
 * Update environment item animation timer.
 */
export function updateEnvironmentItem(item, dt) {
  if (!item.active) return;
  item.timer -= dt;
  if (item.timer <= 0) {
    item.active = false;
  }
}

/**
 * Draw environment effect overlay on the canvas.
 */
export function drawEnvironmentEffect(ctx, item, canvasWidth, canvasHeight) {
  if (!item.active) return;

  const progress = item.timer / Math.max(item.duration, 500);
  const alpha = progress * 0.4;
  const ve = item.visualEffect;

  ctx.save();

  switch (ve?.type) {
    case 'flash':
      ctx.fillStyle = `${ve.color_primary || '#FFFFFF'}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      break;

    case 'overlay':
      ctx.fillStyle = `${ve.color_primary || '#0000FF'}${Math.round(alpha * 0.6 * 255).toString(16).padStart(2, '0')}`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      break;

    case 'weather': {
      // Particle-like weather effect
      ctx.fillStyle = ve.color_primary || '#FFFFFF';
      ctx.globalAlpha = alpha;
      const count = 30;
      for (let i = 0; i < count; i++) {
        const seed = i * 137.5 + Date.now() * 0.001;
        const px = (Math.sin(seed) * 0.5 + 0.5) * canvasWidth;
        const py = ((seed * 0.1) % 1) * canvasHeight;
        ctx.fillRect(px, py, 2, 6);
      }
      break;
    }

    case 'particles': {
      ctx.globalAlpha = alpha;
      const count = 20;
      for (let i = 0; i < count; i++) {
        const seed = i * 97.3 + Date.now() * 0.002;
        const px = (Math.sin(seed * 0.7) * 0.5 + 0.5) * canvasWidth;
        const py = (Math.cos(seed * 0.5) * 0.5 + 0.5) * canvasHeight;
        ctx.fillStyle = i % 2 === 0 ? (ve.color_primary || '#FF0000') : (ve.color_secondary || '#FFAA00');
        ctx.beginPath();
        ctx.arc(px, py, 3 + Math.sin(seed) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    default:
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      break;
  }

  ctx.restore();
}
