/**
 * Level2 — Main orchestrator for the 3D level.
 * Manages the Three.js game loop, entity updates, and collision detection.
 */

import * as THREE from 'three';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import { createScene, updateCamera, renderScene, disposeScene, getScene, getCamera, getClock } from './scene.js';
import { createArena, updateArena, disposeArena } from './arena.js';
import { createPlayer3D, updatePlayer3D, damagePlayer3D, tryAttack3D, resetPlayer3D, disposePlayer3D } from './player3d.js';
import {
  createObstacle3D, updateObstacle3D, damageObstacle3D, stunObstacle3D,
  fireProjectile3D, checkObstacleCollision3D, checkProjectileHits3D, disposeObstacle3D,
} from './obstacle3d.js';
import { createWeapon3D, processAttack3D, updateWeaponProjectiles3D, disposeWeapon3D } from './weapon3d.js';
import {
  createEnvironmentItem3D, updateEnvironmentItem3D, checkItemPickup3D,
  activateEnvironmentItem3D, disposeEnvironmentItem3D,
} from './environment3d.js';
import { drawHUD3D } from './hud3d.js';
import { pollInput, snapshotKeys, showTouch3DControls, hideAllTouchControls } from '../input.js';
import { sfxVictory } from '../audio.js';
import { triggerScreenShake } from '../renderer.js';

// State
let canvas3d = null;
let hudCanvas = null;
let hudCtx = null;
let player = null;
let obstacle = null;
let weapon = null;
let envItem = null;
let deaths = 0;
let startTime = 0;
let elapsedMs = 0;
let running = false;
let animFrameId = null;
let resetActive = false;
let onVictoryCallback = null;

/**
 * Initialize and start Level 2.
 * @param {Object} data — LLM-generated content (obstacle, weapon, environment_item)
 * @param {number} prevDeaths — death count from Level 1
 * @param {number} prevTimeMs — elapsed time from Level 1
 * @param {Object} words — { creature, weapon, environment }
 * @param {Function} onVictory — callback when player wins
 */
export function startLevel2(data, prevDeaths, prevTimeMs, words, onVictory) {
  // Get canvas elements
  canvas3d = document.getElementById('game-canvas-3d');
  hudCanvas = document.getElementById('hud-canvas-3d');

  // Show 3D canvases, hide 2D
  document.getElementById('game-canvas').style.display = 'none';
  canvas3d.style.display = 'block';
  canvas3d.width = CANVAS_WIDTH;
  canvas3d.height = CANVAS_HEIGHT;
  hudCanvas.style.display = 'block';
  hudCanvas.width = CANVAS_WIDTH;
  hudCanvas.height = CANVAS_HEIGHT;
  hudCtx = hudCanvas.getContext('2d');

  // Create Three.js scene
  const { scene, camera, clock } = createScene(canvas3d);

  // Create arena
  createArena(scene, words?.environment);

  // Create entities
  player = createPlayer3D(scene);
  obstacle = createObstacle3D(scene, data.obstacle);
  weapon = createWeapon3D(scene, data.weapon);
  envItem = createEnvironmentItem3D(scene, data.environment_item, words?.environment);

  // State
  deaths = prevDeaths;
  startTime = Date.now() - prevTimeMs; // Continue timer from Level 1
  elapsedMs = prevTimeMs;
  resetActive = false;
  running = true;
  onVictoryCallback = onVictory;

  // Show 3D touch controls (virtual joystick + action buttons)
  showTouch3DControls();

  // Start game loop
  gameLoop();
}

function gameLoop() {
  if (!running) return;
  animFrameId = requestAnimationFrame(gameLoop);

  const clock = getClock();
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  update(dt, elapsed);
  render(dt, elapsed);
}

function update(dt, elapsed) {
  const actions = pollInput();
  snapshotKeys();

  elapsedMs = Date.now() - startTime;

  // Reset (edge-triggered)
  if (actions.reset && !player.dead) {
    if (!resetActive) {
      deaths++;
      restartRound();
      resetActive = true;
    }
    return;
  }
  if (!actions.reset) resetActive = false;

  // Player died — wait then restart
  if (player.dead) {
    player._deathTimer = (player._deathTimer || 0) + dt * 1000;
    if (player._deathTimer > 800) {
      deaths++;
      player._deathTimer = 0;
      restartRound();
    }
    return;
  }

  // Update player
  updatePlayer3D(player, actions, dt);

  // Attack
  if (actions.attack && weapon) {
    if (tryAttack3D(player, weapon.cooldown)) {
      const scene = getScene();
      const dmg = processAttack3D(weapon, player, obstacle, scene);
      if (dmg > 0) damageObstacle3D(obstacle, dmg);
    }
  }

  // Pick up environment item
  if (envItem && !envItem.pickedUp && !envItem.used) {
    checkItemPickup3D(envItem, player.mesh.position);
  }

  // Use environment item
  if (actions.item && envItem && envItem.pickedUp && !envItem.used) {
    const scene = getScene();
    if (obstacle && !obstacle.dead) {
      const result = activateEnvironmentItem3D(envItem, obstacle.mesh.position, scene);
      if (result) {
        if (result.obstacleDmg > 0) damageObstacle3D(obstacle, result.obstacleDmg);
        if (result.stunDuration > 0) stunObstacle3D(obstacle, result.stunDuration);
        if (result.playerDmg > 0) damagePlayer3D(player, result.playerDmg);
        triggerScreenShake(envItem.screenShake, envItem.duration);
      }
    }
  }

  // Update obstacle
  if (obstacle) {
    updateObstacle3D(obstacle, player, dt);
  }

  if (obstacle && !obstacle.dead) {
    // Obstacle melee/charge attack
    if (obstacle.aiState === 'attack' && obstacle.attackTimer > obstacle.attackCooldown * 0.7) {
      if (obstacle.attackPattern === 'projectile') {
        if (obstacle.attackTimer > obstacle.attackCooldown * 0.9) {
          fireProjectile3D(obstacle, player);
        }
      } else {
        if (checkObstacleCollision3D(obstacle, player)) {
          damagePlayer3D(player, obstacle.attackDamage, obstacle.mesh.position);
        }
      }
    }

    // Obstacle projectile hits
    const hits = checkProjectileHits3D(obstacle, player);
    for (const hit of hits) {
      damagePlayer3D(player, hit.damage, obstacle.mesh.position);
    }

    // Contact damage during aggro
    if (obstacle.aiState === 'aggro' && checkObstacleCollision3D(obstacle, player)) {
      damagePlayer3D(player, Math.ceil(obstacle.attackDamage * 0.3), obstacle.mesh.position);
    }
  }

  // Weapon projectile updates
  if (weapon) {
    const dmg = updateWeaponProjectiles3D(weapon, obstacle, dt);
    if (dmg > 0) damageObstacle3D(obstacle, dmg);
  }

  // Environment item animation
  if (envItem) updateEnvironmentItem3D(envItem, dt, elapsed);

  // Update arena visuals
  updateArena(dt, elapsed);

  // Victory check — obstacle defeated
  if (obstacle && obstacle.dead && obstacle.deathTimer >= obstacle.deathDuration) {
    handleVictory();
  }

  // Update camera
  const camera = getCamera();
  if (camera) {
    updateCamera(camera, player.mesh.position, dt);
  }
}

function render(dt, elapsed) {
  renderScene();

  // Draw HUD overlay
  if (hudCtx) {
    drawHUD3D(hudCtx, player, weapon, envItem, obstacle, deaths, elapsedMs);
  }
}

function restartRound() {
  resetPlayer3D(player);

  // Reset obstacle
  if (obstacle) {
    const scene = getScene();
    disposeObstacle3D(obstacle, scene);
    // We'd need original data to recreate — store it
    // For simplicity, just reset position and HP
    // Actually let's store the original data
  }

  // Simpler approach: reset obstacle state in place
  if (obstacle) {
    obstacle.mesh.position.copy(obstacle.patrolCenter);
    obstacle.mesh.position.y = 0;
    obstacle.mesh.scale.setScalar(1);
    obstacle.hp = obstacle.maxHp;
    obstacle.dead = false;
    obstacle.aiState = 'patrol';
    obstacle.patrolAngle = 0;
    obstacle.attackTimer = 0;
    obstacle.stunTimer = 0;
    obstacle.deathTimer = 0;
    obstacle.showDescription = true;
    obstacle.descriptionTimer = 3000;
    if (obstacle.bodyMesh && obstacle.bodyMesh.material) {
      obstacle.bodyMesh.material.opacity = 1;
      obstacle.bodyMesh.material.transparent = false;
      obstacle.bodyMesh.material.emissiveIntensity = 0.15;
    }
    // Clear projectiles
    for (const p of obstacle.projectiles) {
      obstacle.projectileGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    obstacle.projectiles = [];
  }

  // Reset weapon
  if (weapon) {
    // Clear weapon projectiles handled in disposeWeapon3D... but we need a soft reset
    weapon.slashTimer = 0;
    weapon.mesh.visible = false;
  }

  // Reset environment item
  if (envItem) {
    envItem.pickedUp = false;
    envItem.used = false;
    envItem.active = false;
    envItem.timer = 0;
    envItem.mesh.visible = true;
    // Clear particles
    for (const p of envItem.particles) {
      if (envItem.effectGroup) envItem.effectGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    envItem.particles = [];
  }
}

function handleVictory() {
  player.state = 'victory';
  sfxVictory();
  running = false;

  setTimeout(() => {
    if (onVictoryCallback) {
      onVictoryCallback(deaths, elapsedMs);
    }
  }, 2000);
}

/**
 * Clean up Level 2 — dispose all Three.js resources.
 */
export function cleanupLevel2() {
  running = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  const scene = getScene();
  if (scene) {
    disposePlayer3D(player, scene);
    disposeObstacle3D(obstacle, scene);
    disposeWeapon3D(weapon, scene);
    disposeEnvironmentItem3D(envItem, scene);
    disposeArena(scene);
  }
  disposeScene();

  player = null;
  obstacle = null;
  weapon = null;
  envItem = null;

  // Hide 3D touch controls
  hideAllTouchControls();

  // Hide 3D canvases, show 2D
  if (canvas3d) canvas3d.style.display = 'none';
  if (hudCanvas) hudCanvas.style.display = 'none';
  document.getElementById('game-canvas').style.display = 'block';
}

/**
 * Get current Level 2 state for external queries.
 */
export function getLevel2State() {
  return { deaths, elapsedMs, running };
}
