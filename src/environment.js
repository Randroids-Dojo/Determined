/**
 * Environment item — the one-time-use weather/force-of-nature effect
 * with keyword-matched targeted animations (bolt, flames, freeze, etc.).
 */

import { ENV_DMG_MIN, ENV_DMG_MAX } from './constants.js';
import { sfxItemUse } from './audio.js';
import { triggerScreenShake } from './renderer.js';

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Create environment item from LLM data.
 */
export function createEnvironmentItem(data, keyword) {
  const d = data || {};
  return {
    name: d.name || 'Mysterious Force',
    keyword: keyword || '',
    description: d.description || 'Something happens. To everyone.',
    effectType: d.effect_type || 'damage',
    damage: clamp(d.damage || 30, ENV_DMG_MIN, ENV_DMG_MAX),
    areaOfEffect: d.area_of_effect || 'full_screen',
    duration: (d.duration || 0) * 1000,
    affectsPlayer: d.affects_player || { active: true, effect: 'Takes minor damage' },
    affectsObstacle: d.affects_obstacle || { active: true, effect: 'Takes major damage' },
    screenShake: d.screen_shake || 5,
    visualEffect: d.visual_effect || {
      type: 'flash',
      style: 'explosion',
      color_primary: '#FFFFFF',
      color_secondary: '#FFFF00',
      description: 'A bright flash fills the screen',
    },
    visual: d.visual || null,

    // Runtime state
    active: false,
    timer: 0,
    used: false,
    pickedUp: false,

    // Effect state
    particles: [],
    segments: [],
    targetX: 0,
    targetY: 0,
    effectStyle: 'explosion',
    ringRadius: 0,
  };
}

/**
 * Activate the environment item. Returns { playerDmg, obstacleDmg, stunDuration }.
 */
export function activateEnvironmentItem(item) {
  if (item.used) return null;

  item.used = true;
  item.active = true;
  item.timer = Math.max(item.duration, 500);
  sfxItemUse();

  if (item.screenShake > 0) {
    triggerScreenShake(item.screenShake, Math.max(item.duration, 300));
  }

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
      playerDmg = Math.round(item.damage * 0.3);
    }
  }

  return { playerDmg, obstacleDmg, stunDuration };
}

// ── Particle spawners ──

function spawnBolt(item, tx, ty, c1, c2) {
  // Zigzag lightning segments from sky to target
  const pts = [{ x: tx + rand(-10, 10), y: 0 }];
  const n = 8 + Math.floor(Math.random() * 4);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push({ x: tx + rand(-30, 30) * (1 - t * 0.5), y: ty * t });
  }
  pts[pts.length - 1].x = tx;
  item.segments = pts;

  // Sparks at impact
  for (let i = 0; i < 15; i++) {
    const a = Math.random() * Math.PI * 2;
    item.particles.push({
      x: tx, y: ty,
      vx: Math.cos(a) * rand(0.05, 0.2),
      vy: Math.sin(a) * rand(0.05, 0.2),
      life: 1, decay: rand(0.002, 0.004),
      size: rand(1, 3), color: pick([c1, c2, '#FFFFFF']),
    });
  }
}

function spawnFlames(item, tx, ty, c1, c2) {
  for (let i = 0; i < 25; i++) {
    item.particles.push({
      x: tx + rand(-20, 20), y: ty + rand(-5, 10),
      vx: rand(-0.02, 0.02), vy: rand(-0.12, -0.04),
      life: 1, decay: rand(0.0015, 0.003),
      size: rand(3, 7), color: pick([c1, c2, '#FF4400', '#FF8800', '#FFCC00']),
    });
  }
}

function spawnFreeze(item, tx, ty, c1, c2) {
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2;
    item.particles.push({
      x: tx, y: ty,
      vx: Math.cos(a) * rand(0.03, 0.1),
      vy: Math.sin(a) * rand(0.03, 0.1),
      life: 1, decay: rand(0.001, 0.002),
      size: rand(2, 5), color: pick([c1, c2, '#88DDFF', '#FFFFFF', '#AAEEFF']),
      shape: 'diamond',
    });
  }
}

function spawnWind(item, tx, ty, c1, c2) {
  for (let i = 0; i < 25; i++) {
    const a = (i / 25) * Math.PI * 2;
    item.particles.push({
      x: tx + Math.cos(a) * rand(10, 50),
      y: ty + Math.sin(a) * rand(10, 40),
      angle: a, dist: rand(10, 50),
      angularSpeed: rand(0.004, 0.008),
      life: 1, decay: rand(0.001, 0.002),
      size: rand(1, 3), color: pick([c1, c2]),
      shape: 'streak',
    });
  }
}

function spawnExplosion(item, tx, ty, c1, c2) {
  for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2;
    item.particles.push({
      x: tx, y: ty,
      vx: Math.cos(a) * rand(0.06, 0.2),
      vy: Math.sin(a) * rand(0.06, 0.2) - 0.04,
      life: 1, decay: rand(0.0015, 0.003),
      size: rand(2, 5), color: pick([c1, c2, '#FFFFFF']),
    });
  }
}

function spawnBeam(item, tx, ty, c1, c2) {
  for (let i = 0; i < 20; i++) {
    item.particles.push({
      x: tx + rand(-6, 6), y: rand(0, ty),
      vx: rand(-0.01, 0.01), vy: rand(-0.03, 0.03),
      life: 1, decay: rand(0.001, 0.002),
      size: rand(2, 4), color: pick([c1, c2, '#FFFFFF']),
    });
  }
}

function spawnRain(item, c1, c2, canvasW, canvasH) {
  for (let i = 0; i < 50; i++) {
    item.particles.push({
      x: rand(0, canvasW), y: rand(-canvasH, 0),
      vx: rand(-0.03, -0.01), vy: rand(0.3, 0.5),
      life: 1, decay: rand(0.0005, 0.001),
      size: rand(1, 2), color: pick([c1, c2]),
      shape: 'streak',
    });
  }
}

/**
 * Spawn targeted environment effect particles at the obstacle position.
 */
export function spawnEnvironmentEffect(item, targetX, targetY, canvasW, canvasH) {
  const style = item.visualEffect?.style || 'explosion';
  const c1 = item.visualEffect?.color_primary || '#FFFFFF';
  const c2 = item.visualEffect?.color_secondary || '#FFFF00';

  item.targetX = targetX;
  item.targetY = targetY;
  item.effectStyle = style;
  item.particles = [];
  item.segments = [];
  item.ringRadius = 0;

  switch (style) {
    case 'bolt':      spawnBolt(item, targetX, targetY, c1, c2); break;
    case 'flames':    spawnFlames(item, targetX, targetY, c1, c2); break;
    case 'freeze':    spawnFreeze(item, targetX, targetY, c1, c2); break;
    case 'wind':      spawnWind(item, targetX, targetY, c1, c2); break;
    case 'beam':      spawnBeam(item, targetX, targetY, c1, c2); break;
    case 'rain':      spawnRain(item, c1, c2, canvasW, canvasH); break;
    case 'explosion':
    default:          spawnExplosion(item, targetX, targetY, c1, c2); break;
  }
}

/**
 * Update environment item animation, particles, and expanding rings.
 */
export function updateEnvironmentItem(item, dt) {
  if (!item.active) return;
  item.timer -= dt;

  const style = item.effectStyle;

  // Update particles
  for (const p of item.particles) {
    if (style === 'wind' && p.angle !== undefined) {
      p.angle += p.angularSpeed * dt;
      p.dist += 0.01 * dt;
      p.x = item.targetX + Math.cos(p.angle) * p.dist;
      p.y = item.targetY + Math.sin(p.angle) * p.dist;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    // Gravity for explosion debris
    if (style === 'explosion') p.vy += 0.0001 * dt;
    p.life -= p.decay * dt;
  }
  item.particles = item.particles.filter(p => p.life > 0);

  // Respawn for continuous effects
  if (style === 'flames' && item.particles.length < 15 && item.timer > 200) {
    const c1 = item.visualEffect?.color_primary || '#FF4400';
    const c2 = item.visualEffect?.color_secondary || '#FFCC00';
    spawnFlames(item, item.targetX, item.targetY, c1, c2);
  }
  if (style === 'rain' && item.particles.length < 20 && item.timer > 200) {
    const c1 = item.visualEffect?.color_primary || '#AAAAFF';
    const c2 = item.visualEffect?.color_secondary || '#8888DD';
    spawnRain(item, c1, c2, 800, 450); // approximate canvas size
  }

  // Expanding rings
  if (style === 'freeze' || style === 'explosion') {
    item.ringRadius += 0.15 * dt;
  }

  // Flicker bolt segments
  if (style === 'bolt' && item.segments.length > 2) {
    for (let i = 1; i < item.segments.length - 1; i++) {
      item.segments[i].x += rand(-1, 1);
    }
  }

  if (item.timer <= 0) {
    item.active = false;
    item.particles = [];
    item.segments = [];
  }
}

/**
 * Draw the full environment effect: ambient overlay + targeted animation.
 */
export function drawEnvironmentEffect(ctx, item, canvasWidth, canvasHeight) {
  if (!item.active) return;

  const progress = item.timer / Math.max(item.duration, 500);
  const alpha = progress * 0.4;
  const ve = item.visualEffect;

  ctx.save();

  // ── Ambient overlay (subtle background tint) ──
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
      ctx.fillStyle = ve.color_primary || '#FFFFFF';
      ctx.globalAlpha = alpha;
      for (let i = 0; i < 30; i++) {
        const seed = i * 137.5 + Date.now() * 0.001;
        ctx.fillRect(
          (Math.sin(seed) * 0.5 + 0.5) * canvasWidth,
          ((seed * 0.1) % 1) * canvasHeight, 2, 6,
        );
      }
      break;
    }
    case 'particles': {
      ctx.globalAlpha = alpha;
      for (let i = 0; i < 20; i++) {
        const seed = i * 97.3 + Date.now() * 0.002;
        ctx.fillStyle = i % 2 === 0 ? (ve.color_primary || '#FF0000') : (ve.color_secondary || '#FFAA00');
        ctx.beginPath();
        ctx.arc(
          (Math.sin(seed * 0.7) * 0.5 + 0.5) * canvasWidth,
          (Math.cos(seed * 0.5) * 0.5 + 0.5) * canvasHeight,
          3 + Math.sin(seed) * 2, 0, Math.PI * 2,
        );
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

  // ── Targeted effect (keyword-matched animation) ──
  drawTargetedEffect(ctx, item, progress);
}

/**
 * Draw the targeted animation: bolt, flames, freeze, etc.
 */
function drawTargetedEffect(ctx, item, progress) {
  const fadeAlpha = Math.min(progress * 2, 1);
  const style = item.effectStyle;
  const c1 = item.visualEffect?.color_primary || '#FFFFFF';

  ctx.save();

  // Style-specific structural elements (bolts, beams, rings)
  switch (style) {
    case 'bolt': {
      if (item.segments.length > 1) {
        // Outer glow
        ctx.strokeStyle = c1;
        ctx.lineWidth = 6;
        ctx.globalAlpha = fadeAlpha * 0.4;
        ctx.beginPath();
        ctx.moveTo(item.segments[0].x, item.segments[0].y);
        for (let i = 1; i < item.segments.length; i++) {
          ctx.lineTo(item.segments[i].x, item.segments[i].y);
        }
        ctx.stroke();
        // Bright core
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.globalAlpha = fadeAlpha;
        ctx.beginPath();
        ctx.moveTo(item.segments[0].x, item.segments[0].y);
        for (let i = 1; i < item.segments.length; i++) {
          ctx.lineTo(item.segments[i].x, item.segments[i].y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'beam': {
      const w = 16;
      // Outer glow
      ctx.globalAlpha = fadeAlpha * 0.25;
      ctx.fillStyle = c1;
      ctx.fillRect(item.targetX - w, 0, w * 2, item.targetY + 20);
      // Inner core
      ctx.globalAlpha = fadeAlpha * 0.5;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(item.targetX - w / 3, 0, (w * 2) / 3, item.targetY + 20);
      break;
    }
    case 'freeze': {
      if (item.ringRadius > 0) {
        ctx.strokeStyle = c1;
        ctx.lineWidth = 2;
        ctx.globalAlpha = fadeAlpha * 0.5;
        ctx.beginPath();
        ctx.arc(item.targetX, item.targetY, item.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'explosion': {
      if (item.ringRadius > 0) {
        ctx.strokeStyle = c1;
        ctx.lineWidth = 3;
        ctx.globalAlpha = fadeAlpha * 0.6 * Math.max(0, 1 - item.ringRadius / 120);
        ctx.beginPath();
        ctx.arc(item.targetX, item.targetY, item.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
  }

  // ── Draw particles ──
  for (const p of item.particles) {
    if (p.life <= 0) continue;
    ctx.globalAlpha = p.life * fadeAlpha;
    ctx.fillStyle = p.color;

    if (p.shape === 'diamond') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    } else if (p.shape === 'streak') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 20, p.y - p.vy * 20);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
