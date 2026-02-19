/**
 * Game — main loop, state machine, and orchestration.
 */

import {
  CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y,
  FLAG_X, FLAG_HEIGHT,
  STATE_MENU, STATE_WORD_ENTRY, STATE_LOADING, STATE_PLAYING,
  STATE_VICTORY, STATE_LEADERBOARD,
} from './constants.js';
import { initInput, pollInput, snapshotKeys } from './input.js';
import {
  drawBackground, drawGround, drawFlag,
  drawStickFigure, drawVisual, applyScreenShake,
} from './renderer.js';
import { createPlayer, resetPlayer, updatePlayer, damagePlayer, tryAttack } from './player.js';
import { createObstacle, updateObstacle, damageObstacle, stunObstacle, fireProjectile } from './obstacle.js';
import { createWeapon, processAttack, updateWeaponProjectiles } from './weapon.js';
import {
  createEnvironmentItem, activateEnvironmentItem,
  spawnEnvironmentEffect, updateEnvironmentItem,
  drawEnvironmentAmbient, drawEnvironmentTargeted,
} from './environment.js';
import { aabbOverlap } from './physics.js';
import { drawHUD, drawObstacleHP } from './hud.js';
import { sfxVictory, sfxItemPickup, resumeAudio } from './audio.js';
import {
  initUI, showMainMenu, showWordEntry, showLoadingScreen,
  hideUI, showVictoryScreen, showLeaderboard,
} from './ui.js';

// ── Canvas setup ──
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// ── Game state ──
let state = STATE_MENU;
let player = createPlayer();
let obstacle = null;
let weapon = null;
let envItem = null;
let words = null;   // { creature, weapon, environment }
let deaths = 0;
let startTime = 0;
let elapsedMs = 0;
let lastFrame = 0;
let resetActive = false; // edge-detect reset so it only fires once per press

// ── Fallback data (used if LLM fails) ──
const FALLBACK_DATA = {
  obstacle: {
    name: 'Angry Blob',
    description: 'It wobbles menacingly in your general direction.',
    health: 80,
    attack_damage: 10,
    attack_pattern: 'melee',
    attack_cooldown: 1.5,
    movement_speed: 2,
    aggro_range: 120,
    weakness: 'sharp',
    visual: {
      base_shape: 'circle',
      width: 50,
      height: 45,
      color_primary: '#CC3333',
      color_secondary: '#FF6666',
      color_accent: '#220000',
      features: [
        { type: 'circle', x: 15, y: -8, radius: 5, color: '#FFFFFF', label: 'eye_left' },
        { type: 'circle', x: 35, y: -8, radius: 5, color: '#FFFFFF', label: 'eye_right' },
        { type: 'circle', x: 15, y: -8, radius: 2, color: '#220000', label: 'pupil_left' },
        { type: 'circle', x: 35, y: -8, radius: 2, color: '#220000', label: 'pupil_right' },
      ],
    },
  },
  weapon: {
    name: 'Pointy Stick',
    description: 'Not fancy, but it gets the job done.',
    damage: 20,
    damage_type: 'sharp',
    attack_pattern: 'melee',
    range: 55,
    cooldown: 0.5,
    special_effect: 'none',
    special_effect_duration: 0,
    effectiveness_vs_obstacle: 1.5,
    visual: {
      base_shape: 'line',
      width: 30,
      height: 4,
      color_primary: '#8B4513',
      color_secondary: '#C0C0C0',
      features: [
        { type: 'rectangle', x: 0, y: -2, width: 24, height: 4, color: '#8B4513', label: 'shaft' },
        { type: 'triangle', points: [[24, -4], [34, 0], [24, 4]], color: '#C0C0C0', label: 'tip' },
      ],
    },
  },
  environment_item: {
    name: 'Shockwave',
    description: 'A pulse of energy that rattles everything.',
    effect_type: 'mixed',
    damage: 40,
    area_of_effect: 'full_screen',
    duration: 0.5,
    affects_player: { active: true, effect: 'Knocked back slightly' },
    affects_obstacle: { active: true, effect: 'Takes heavy damage and is stunned' },
    screen_shake: 6,
    visual_effect: {
      type: 'flash',
      style: 'explosion',
      color_primary: '#FFFFFF',
      color_secondary: '#FFD700',
      description: 'A bright shockwave radiates outward',
    },
    visual: {
      base_shape: 'circle', width: 24, height: 24,
      color_primary: '#FFD700', color_secondary: '#FFFFFF',
      features: [
        { type: 'circle', label: 'ring_outer', x: 12, y: 12, radius: 10, color: '#FFD700' },
        { type: 'circle', label: 'ring_inner', x: 12, y: 12, radius: 6, color: '#FFFFFF' },
        { type: 'circle', label: 'core', x: 12, y: 12, radius: 3, color: '#FF8800' },
      ],
    },
  },
};

// ── Initialization ──

export function init() {
  initInput();
  initUI();
  goToMenu();
}

// ── State transitions ──

function goToMenu() {
  state = STATE_MENU;
  showMainMenu(goToWordEntry, goToLeaderboard);
}

function goToWordEntry() {
  state = STATE_WORD_ENTRY;
  showWordEntry(onWordsSubmitted);
}

async function onWordsSubmitted(submittedWords) {
  words = submittedWords;
  state = STATE_LOADING;
  showLoadingScreen();

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    startGame(data);
  } catch (err) {
    console.warn('LLM generation failed, using fallback:', err);
    startGame(FALLBACK_DATA);
  }
}

function startGame(data) {
  state = STATE_PLAYING;
  hideUI();

  player = createPlayer();
  obstacle = createObstacle(data.obstacle);
  weapon = createWeapon(data.weapon);
  envItem = createEnvironmentItem(data.environment_item, words?.environment);
  deaths = 0;
  startTime = Date.now();
  elapsedMs = 0;
  resetActive = false;
}

function restartRound() {
  resetPlayer(player);
  // Reset obstacle to initial state (position, health, AI)
  if (obstacle) {
    obstacle.x = obstacle.patrolCenter - obstacle.width / 2;
    obstacle.y = GROUND_Y - obstacle.height;
    obstacle.vx = 0;
    obstacle.vy = 0;
    obstacle.hp = obstacle.maxHp;
    obstacle.dead = false;
    obstacle.state = 'patrol';
    obstacle.patrolDir = -1;
    obstacle.facingLeft = true;
    obstacle.attackTimer = 0;
    obstacle.stunTimer = 0;
    obstacle.deathTimer = 0;
    obstacle.projectiles = [];
    obstacle.showDescription = false;
  }
  // Reset weapon projectiles
  if (weapon) weapon.projectiles = [];
  // Reset environment item
  if (envItem) {
    envItem.used = false;
    envItem.active = false;
    envItem.timer = 0;
    envItem.pickedUp = false;
    envItem.particles = [];
    envItem.segments = [];
    envItem.ringRadius = 0;
  }
}

function onVictory() {
  state = STATE_VICTORY;
  player.state = 'victory';
  sfxVictory();

  setTimeout(() => {
    showVictoryScreen(deaths, elapsedMs, words, submitScore, goToWordEntry);
  }, 1500);
}

async function submitScore(initials) {
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initials,
        deaths,
        time: elapsedMs / 1000,
        word_1: words.creature,
        word_2: words.weapon,
        word_3: words.environment,
      }),
    });
  } catch (err) {
    console.warn('Leaderboard submission failed:', err);
  }
  goToLeaderboard();
}

async function goToLeaderboard() {
  state = STATE_LEADERBOARD;
  let entries = [];
  try {
    const resp = await fetch('/api/leaderboard');
    if (resp.ok) entries = await resp.json();
  } catch (err) {
    console.warn('Failed to fetch leaderboard:', err);
  }
  showLeaderboard(entries, goToMenu);
}

// ── Main game loop ──

function gameLoop(timestamp) {
  const dt = lastFrame ? timestamp - lastFrame : 16;
  lastFrame = timestamp;

  if (state === STATE_PLAYING) {
    update(dt);
    render();
  }

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  const actions = pollInput();
  snapshotKeys();

  elapsedMs = Date.now() - startTime;

  // Reset (edge-triggered: only fires on the first frame of the press)
  if (actions.reset && !player.dead) {
    if (!resetActive) {
      deaths++;
      restartRound();
      resetActive = true;
    }
    return;
  }
  if (!actions.reset) {
    resetActive = false;
  }

  // Player died — wait a beat then restart
  if (player.dead) {
    // Brief death pause, then auto-restart
    player._deathTimer = (player._deathTimer || 0) + dt;
    if (player._deathTimer > 800) {
      deaths++;
      player._deathTimer = 0;
      restartRound();
    }
    return;
  }

  // Update player
  updatePlayer(player, actions, dt);

  // Attack
  if (actions.attack && weapon) {
    if (tryAttack(player, weapon.cooldown)) {
      const dmg = processAttack(weapon, player, obstacle);
      if (dmg > 0) damageObstacle(obstacle, dmg);
    }
  }

  // Pick up environment item (player must walk to it)
  if (envItem && !envItem.pickedUp && !envItem.used) {
    const itemX = CANVAS_WIDTH * 0.35;
    const itemHitbox = { x: itemX - 16, y: GROUND_Y - 46, width: 32, height: 46 };
    if (aabbOverlap(player, itemHitbox)) {
      envItem.pickedUp = true;
      sfxItemPickup();
    }
  }

  // Use environment item (must be picked up first)
  if (actions.item && envItem && envItem.pickedUp && !envItem.used) {
    const result = activateEnvironmentItem(envItem);
    if (result) {
      // Spawn targeted visual effect at the obstacle
      if (obstacle && !obstacle.dead) {
        const ox = obstacle.x + obstacle.width / 2;
        const oy = obstacle.y + obstacle.height / 2;
        spawnEnvironmentEffect(envItem, ox, oy, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
      if (result.obstacleDmg > 0) damageObstacle(obstacle, result.obstacleDmg);
      if (result.stunDuration > 0) stunObstacle(obstacle, result.stunDuration);
      if (result.playerDmg > 0) damagePlayer(player, result.playerDmg);
    }
  }

  // Update obstacle (also runs during death animation)
  if (obstacle) {
    updateObstacle(obstacle, player, dt);
  }
  if (obstacle && !obstacle.dead) {

    // Obstacle attacks player (melee / charge)
    if (obstacle.state === 'attack') {
      if (obstacle.attackPattern === 'projectile') {
        fireProjectile(obstacle, player);
      } else {
        // Melee / charge — damage if close
        if (aabbOverlap(player, obstacle)) {
          damagePlayer(player, obstacle.attackDamage, obstacle.x + obstacle.width / 2);
        }
      }
    }

    // Obstacle projectile hits
    for (const proj of obstacle.projectiles) {
      if (aabbOverlap(proj, player)) {
        damagePlayer(player, proj.damage, proj.x);
        proj.life = 0; // mark for removal
      }
    }

    // Player-obstacle collision damage (walking into it)
    if (aabbOverlap(player, obstacle) && obstacle.state === 'aggro') {
      damagePlayer(player, Math.ceil(obstacle.attackDamage * 0.3), obstacle.x + obstacle.width / 2);
    }
  }

  // Weapon projectile updates
  if (weapon) {
    const dmg = updateWeaponProjectiles(weapon, obstacle, dt);
    if (dmg > 0) damageObstacle(obstacle, dmg);
  }

  // Environment item animation
  if (envItem) updateEnvironmentItem(envItem, dt);

  // Victory check — player reaches the flag
  if (player.x + player.width >= FLAG_X) {
    onVictory();
  }
}

function render() {
  ctx.save();
  applyScreenShake(ctx);

  // Background
  drawBackground(ctx);
  drawGround(ctx);
  drawFlag(ctx);

  // Environment ambient overlay (behind entities)
  if (envItem) drawEnvironmentAmbient(ctx, envItem, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Environment item pickup cue (floating icon on the ground, hidden once picked up)
  if (envItem && !envItem.pickedUp && !envItem.used && !envItem.active) {
    const itemX = CANVAS_WIDTH * 0.35;
    const bobOffset = Math.sin(Date.now() * 0.004) * 4;
    const itemY = GROUND_Y - 30 + bobOffset;
    const pulseAlpha = 0.4 + Math.sin(Date.now() * 0.006) * 0.2;

    // Glow
    ctx.save();
    ctx.globalAlpha = pulseAlpha;
    ctx.fillStyle = envItem.visualEffect?.color_primary || '#44DDFF';
    ctx.beginPath();
    ctx.arc(itemX, itemY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Item visual icon (LLM-generated from keyword)
    if (envItem.visual) {
      ctx.save();
      drawVisual(ctx, envItem.visual, itemX - envItem.visual.width / 2, itemY - envItem.visual.height / 2);
      ctx.restore();
    } else {
      // Fallback: first letter of keyword
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((envItem.keyword || '?')[0].toUpperCase(), itemX, itemY);
      ctx.restore();
    }

    // Label
    ctx.save();
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#44DDFF';
    ctx.fillText(envItem.name, itemX, itemY + 20);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('[K]', itemX, itemY + 30);
    ctx.restore();
  }

  // Obstacle (alive or playing death animation)
  if (obstacle && (!obstacle.dead || obstacle.deathTimer < obstacle.deathDuration)) {
    const dying = obstacle.dead && obstacle.deathTimer < obstacle.deathDuration;
    if (dying) {
      const progress = obstacle.deathTimer / obstacle.deathDuration;
      const scale = 1 - progress * 0.6;
      const alpha = 1 - progress;
      ctx.save();
      ctx.globalAlpha = alpha;
      const cx = obstacle.x + obstacle.width / 2;
      const cy = obstacle.y + obstacle.height / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }

    if (obstacle.visual) {
      drawVisual(ctx, obstacle.visual, obstacle.x, obstacle.y, obstacle.facingLeft);
    } else {
      ctx.fillStyle = '#CC3333';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }

    if (dying) {
      ctx.restore();
    } else {
      drawObstacleHP(ctx, obstacle);
    }

    // Obstacle projectiles (only while alive)
    if (!obstacle.dead) {
      ctx.fillStyle = '#FF4444';
      for (const p of obstacle.projectiles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Environment targeted effect (in front of obstacle)
  if (envItem) drawEnvironmentTargeted(ctx, envItem);

  // Weapon projectiles (draw using weapon visual or colored circle)
  if (weapon) {
    const pColor = weapon.visual?.color_primary || '#FFD700';
    for (const p of weapon.projectiles) {
      if (weapon.visual) {
        ctx.save();
        ctx.translate(p.x, p.y);
        const scale = 0.5;
        ctx.scale(scale, scale);
        drawVisual(ctx, weapon.visual, -weapon.visual.width / 2, -weapon.visual.height / 2, p.vx < 0);
        ctx.restore();
      } else {
        ctx.fillStyle = pColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Player
  drawStickFigure(ctx, player);

  // Draw weapon near player when attacking
  if (player.state === 'attack' && weapon?.visual) {
    const dir = player.facing === 'right' ? 1 : -1;
    const wx = player.facing === 'right' ? player.x + player.width + 2 : player.x - weapon.visual.width - 2;
    const wy = player.y + 10;
    drawVisual(ctx, weapon.visual, wx, wy, player.facing === 'left');

    // Slash arc overlay for melee/area attacks
    if (weapon.attackPattern !== 'projectile') {
      const arcCx = player.x + player.width / 2 + dir * 20;
      const arcCy = player.y + player.height / 2;
      const swingProgress = player.attackCooldown / weapon.cooldown;
      if (swingProgress > 0.4) {
        const arcAlpha = (swingProgress - 0.4) / 0.6;
        ctx.save();
        ctx.globalAlpha = arcAlpha * 0.6;
        ctx.strokeStyle = weapon.visual?.color_primary || '#FFD700';
        ctx.lineWidth = 3;
        const startAngle = dir > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
        const endAngle = dir > 0 ? Math.PI * 0.1 : Math.PI * 1.1;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, weapon.range * 0.5, startAngle, endAngle);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Death overlay
  if (player.dead) {
    const deathProgress = Math.min((player._deathTimer || 0) / 800, 1);
    // Red vignette
    ctx.save();
    ctx.fillStyle = `rgba(180, 0, 0, ${0.3 * deathProgress})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    // "YOU DIED" text
    if (deathProgress > 0.15) {
      const textAlpha = Math.min((deathProgress - 0.15) / 0.3, 1);
      ctx.globalAlpha = textAlpha;
      ctx.fillStyle = '#FF2222';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('YOU DIED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
      // Death count
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px monospace';
      ctx.fillText(`Death #${deaths + 1}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 24);
    }
    ctx.restore();
  }

  // HUD
  drawHUD(ctx, player, weapon, envItem, deaths, elapsedMs);

  ctx.restore();
}

// ── Start ──
requestAnimationFrame(gameLoop);
