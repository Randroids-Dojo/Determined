/**
 * vectorRenderer.js — Vector wireframe rendering system for Level 3.
 * Converts LLM visual data to glowing neon wireframes.
 * All rendering uses stroke (not fill) for the vector wireframe look.
 */

// ── Glow helper ──

/**
 * Apply neon glow settings to ctx, run drawFn twice (thin + thick pass), then restore.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} color — stroke color
 * @param {string} glowColor — shadow/glow color
 * @param {number} glowBlur — shadow blur radius
 * @param {Function} drawFn — function that issues ctx path + stroke commands
 */
function withGlow(ctx, color, glowColor, glowBlur, drawFn) {
  ctx.save();

  // First pass: thin bright line with glow
  ctx.shadowBlur = glowBlur;
  ctx.shadowColor = glowColor;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1.0;
  drawFn();

  // Second pass: slightly thicker, lower alpha — broadens the glow halo
  ctx.shadowBlur = glowBlur * 1.6;
  ctx.shadowColor = glowColor;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.35;
  drawFn();

  ctx.restore();
}

// ── Feature outline tracers ──

/**
 * Trace a single LLM visual feature as a wireframe stroke path.
 * Does NOT call stroke() — caller handles that inside withGlow.
 */
function traceFeature(ctx, feature) {
  const x = feature.x || 0;
  const y = feature.y || 0;

  switch (feature.type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(x, y, feature.radius || 10, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case 'ellipse': {
      const rx = feature.radiusX || feature.radius || 10;
      const ry = feature.radiusY || feature.radius || 10;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, feature.rotation || 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'rectangle':
      ctx.strokeRect(x, y, feature.width || 20, feature.height || 20);
      break;

    case 'roundedRect': {
      const rw = feature.width || 20;
      const rh = feature.height || 20;
      const cr = Math.min(feature.cornerRadius || 4, rw / 2, rh / 2);
      ctx.beginPath();
      ctx.moveTo(x + cr, y);
      ctx.lineTo(x + rw - cr, y);
      ctx.arcTo(x + rw, y, x + rw, y + cr, cr);
      ctx.lineTo(x + rw, y + rh - cr);
      ctx.arcTo(x + rw, y + rh, x + rw - cr, y + rh, cr);
      ctx.lineTo(x + cr, y + rh);
      ctx.arcTo(x, y + rh, x, y + rh - cr, cr);
      ctx.lineTo(x, y + cr);
      ctx.arcTo(x, y, x + cr, y, cr);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 'triangle':
      if (feature.points && feature.points.length === 3) {
        ctx.beginPath();
        ctx.moveTo(feature.points[0][0], feature.points[0][1]);
        ctx.lineTo(feature.points[1][0], feature.points[1][1]);
        ctx.lineTo(feature.points[2][0], feature.points[2][1]);
        ctx.closePath();
        ctx.stroke();
      }
      break;

    case 'polygon':
      if (feature.points && feature.points.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(feature.points[0][0], feature.points[0][1]);
        for (let i = 1; i < feature.points.length; i++) {
          ctx.lineTo(feature.points[i][0], feature.points[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
      }
      break;

    case 'line':
      ctx.beginPath();
      ctx.moveTo(feature.x1 || 0, feature.y1 || 0);
      ctx.lineTo(feature.x2 || 20, feature.y2 || 20);
      ctx.stroke();
      break;

    case 'arc':
      ctx.beginPath();
      ctx.arc(x, y, feature.radius || 10, feature.startAngle || 0, feature.endAngle || Math.PI);
      ctx.stroke();
      break;

    default:
      // Fallback: draw a small diamond
      ctx.beginPath();
      ctx.moveTo(x + 10, y);
      ctx.lineTo(x + 20, y + 10);
      ctx.lineTo(x + 10, y + 20);
      ctx.lineTo(x, y + 10);
      ctx.closePath();
      ctx.stroke();
      break;
  }
}

/**
 * Render any LLM visual as a vector wireframe.
 * All features are drawn as outlines in the override color with neon glow.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} visual — LLM-generated visual descriptor { width, height, base_shape, features, ... }
 * @param {number} x — center x
 * @param {number} y — center y
 * @param {number} scale — scale factor
 * @param {string} color — stroke color override (e.g. '#00FFCC')
 * @param {string} glowColor — glow/shadow color (e.g. '#00FFCC')
 */
export function drawVectorVisual(ctx, visual, x, y, scale, color, glowColor) {
  if (!visual) return;

  const w = (visual.width || 40) * scale;
  const h = (visual.height || 40) * scale;

  ctx.save();
  ctx.translate(x - w / 2, y - h / 2);
  ctx.scale(scale, scale);

  // Draw base shape outline
  withGlow(ctx, color, glowColor, 12, () => {
    const baseType = visual.base_shape || 'ellipse';
    const vw = visual.width || 40;
    const vh = visual.height || 40;

    if (baseType === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(vw / 2, vh / 2, vw / 2, vh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (baseType === 'circle') {
      ctx.beginPath();
      ctx.arc(vw / 2, vh / 2, Math.min(vw, vh) / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (baseType === 'rectangle' || baseType === 'rect') {
      ctx.strokeRect(0, 0, vw, vh);
    } else {
      // Default: ellipse
      ctx.beginPath();
      ctx.ellipse(vw / 2, vh / 2, vw / 2, vh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Draw each feature as wireframe
  if (visual.features) {
    for (const feature of visual.features) {
      withGlow(ctx, color, glowColor, 10, () => {
        traceFeature(ctx, feature);
      });
    }
  }

  ctx.restore();
}

/**
 * Draw an asteroids-style player ship at (x, y) facing `angle` (radians, 0 = up).
 * Ship is ~20px tall. Vector style, all strokes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x — center x
 * @param {number} y — center y
 * @param {number} angle — facing angle in radians, 0 = up
 * @param {string} color — stroke color
 */
export function drawPlayerShip(ctx, x, y, angle, color) {
  const glowColor = color;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  withGlow(ctx, color, glowColor, 14, () => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Main hull triangle (nose at top = negative y)
    ctx.beginPath();
    ctx.moveTo(0, -10);      // nose
    ctx.lineTo(8, 10);       // right rear
    ctx.lineTo(0, 6);        // rear center notch
    ctx.lineTo(-8, 10);      // left rear
    ctx.closePath();
    ctx.stroke();

    // Engine detail lines
    ctx.beginPath();
    ctx.moveTo(-5, 6);
    ctx.lineTo(-5, 10);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(5, 6);
    ctx.lineTo(5, 10);
    ctx.stroke();

    // Cockpit detail
    ctx.beginPath();
    ctx.arc(0, -2, 3, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * Draw a small laser bolt at (x, y) pointing in `angle` direction.
 * ~8px long, thin glowing line.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angle — direction in radians
 * @param {string} color
 */
export function drawBullet(ctx, x, y, angle, color) {
  const len = 16;
  const dx = Math.sin(angle) * len;
  const dy = -Math.cos(angle) * len;

  ctx.save();
  ctx.lineCap = 'round';

  // Outer wide glow halo
  ctx.shadowBlur = 24;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(x - dx / 2, y - dy / 2);
  ctx.lineTo(x + dx / 2, y + dy / 2);
  ctx.stroke();

  // Mid colored core
  ctx.shadowBlur = 14;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  ctx.moveTo(x - dx / 2, y - dy / 2);
  ctx.lineTo(x + dx / 2, y + dy / 2);
  ctx.stroke();

  // White-hot inner spine
  const shortLen = len * 0.55;
  const sdx = Math.sin(angle) * shortLen;
  const sdy = -Math.cos(angle) * shortLen;
  ctx.shadowBlur = 6;
  ctx.shadowColor = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(x - sdx / 2, y - sdy / 2);
  ctx.lineTo(x + sdx / 2, y + sdy / 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a pulsing engine glow behind the ship.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x — ship center x
 * @param {number} y — ship center y
 * @param {number} angle — ship facing angle in radians (0 = up)
 * @param {number} intensity — 0..1 normalized speed
 */
export function drawEngineGlow(ctx, x, y, angle, intensity) {
  if (intensity < 0.05) return;

  // Engine exhaust offset: opposite of nose direction
  const backAngle = angle + Math.PI;
  const ex = x + Math.sin(backAngle) * 9;
  const ey = y - Math.cos(backAngle) * 9;

  const glowR = 6 + intensity * 22;

  const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, glowR);
  grad.addColorStop(0,   `rgba(160, 220, 255, ${0.9 * intensity})`);
  grad.addColorStop(0.3, `rgba(40,  120, 255, ${0.6 * intensity})`);
  grad.addColorStop(1,   'rgba(0, 0, 80, 0)');

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ex, ey, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Create a particle explosion array.
 *
 * @param {number} x — origin x
 * @param {number} y — origin y
 * @param {string} color — particle color
 * @param {number} count — number of particles
 * @returns {Array} particles
 */
export function createExplosion(x, y, color, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 90;
    const maxLife = 400 + Math.random() * 400;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: maxLife,
      maxLife,
      color,
      size: 1 + Math.random() * 2,
    });
  }
  return particles;
}

/**
 * Update explosion particles.
 * @param {Array} particles
 * @param {number} dt — delta time in seconds
 * @returns {Array} alive particles
 */
export function updateExplosion(particles, dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= dt * 1000;
  }
  return particles.filter(p => p.life > 0);
}

/**
 * Draw explosion particle system.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} particles
 */
export function drawExplosion(ctx, particles) {
  ctx.save();
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}
