/**
 * voxelRenderer.js — Isometric voxel rendering engine for Level 4.
 * Draws cubes using three parallelogram faces (top, left-side, right-side).
 *
 * Isometric grid formula:
 *   screenX = originX + (gx - gy) * HALF_W
 *   screenY = originY + (gx + gy) * HALF_H - gz * CUBE_H
 * where (gx, gy) is the grid position and gz is the stack height.
 */

export const TILE_W = 48;
export const TILE_H = 24;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
export const CUBE_H = 18; // pixel height per voxel stack unit

/**
 * Convert grid coordinates to screen coordinates.
 * Returns the center-top of the voxel's top face.
 */
export function gridToScreen(gx, gy, gz, originX, originY) {
  return {
    x: originX + (gx - gy) * HALF_W,
    y: originY + (gx + gy) * HALF_H - gz * CUBE_H,
  };
}

/**
 * Draw a single voxel cube at screen position (cx, cy) — the center of the top face.
 * colors = { top, left, right, outline? }
 */
export function drawVoxelAt(ctx, cx, cy, colors) {
  // Top face (diamond/rhombus)
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(cx,          cy - HALF_H);
  ctx.lineTo(cx + HALF_W, cy);
  ctx.lineTo(cx,          cy + HALF_H);
  ctx.lineTo(cx - HALF_W, cy);
  ctx.closePath();
  ctx.fill();

  // Left-side face
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(cx - HALF_W, cy);
  ctx.lineTo(cx,          cy + HALF_H);
  ctx.lineTo(cx,          cy + HALF_H + CUBE_H);
  ctx.lineTo(cx - HALF_W, cy + CUBE_H);
  ctx.closePath();
  ctx.fill();

  // Right-side face
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(cx,          cy + HALF_H);
  ctx.lineTo(cx + HALF_W, cy);
  ctx.lineTo(cx + HALF_W, cy + CUBE_H);
  ctx.lineTo(cx,          cy + HALF_H + CUBE_H);
  ctx.closePath();
  ctx.fill();

  // Subtle edge highlight
  if (colors.outline !== false) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.7;
    // Top face outline
    ctx.beginPath();
    ctx.moveTo(cx,          cy - HALF_H);
    ctx.lineTo(cx + HALF_W, cy);
    ctx.lineTo(cx,          cy + HALF_H);
    ctx.lineTo(cx - HALF_W, cy);
    ctx.closePath();
    ctx.stroke();
    // Bottom edges of side faces
    ctx.beginPath();
    ctx.moveTo(cx - HALF_W, cy + CUBE_H);
    ctx.lineTo(cx,          cy + HALF_H + CUBE_H);
    ctx.lineTo(cx + HALF_W, cy + CUBE_H);
    ctx.stroke();
    // Left vertical edge
    ctx.beginPath();
    ctx.moveTo(cx - HALF_W, cy);
    ctx.lineTo(cx - HALF_W, cy + CUBE_H);
    ctx.stroke();
    // Right vertical edge
    ctx.beginPath();
    ctx.moveTo(cx + HALF_W, cy);
    ctx.lineTo(cx + HALF_W, cy + CUBE_H);
    ctx.stroke();
    // Center vertical edge
    ctx.beginPath();
    ctx.moveTo(cx, cy + HALF_H);
    ctx.lineTo(cx, cy + HALF_H + CUBE_H);
    ctx.stroke();
  }
}

/**
 * Draw a voxel at grid position.
 */
export function drawVoxel(ctx, gx, gy, gz, colors, originX, originY) {
  const { x, y } = gridToScreen(gx, gy, gz, originX, originY);
  drawVoxelAt(ctx, x, y, colors);
}

/**
 * Sort draw calls back-to-front using painter's algorithm.
 * Key: gx + gy (ascending = further back)
 * Ties broken by gz (lower gz = drawn first = behind)
 */
export function sortDrawList(drawList) {
  drawList.sort((a, b) => {
    const depthA = a.gx + a.gy;
    const depthB = b.gx + b.gy;
    if (depthA !== depthB) return depthA - depthB;
    return a.gz - b.gz;
  });
}
