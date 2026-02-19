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
  updateEnvironmentItem, drawEnvironmentEffect,
} from './environment.js';
import { aabbOverlap } from './physics.js';
import { drawHUD, drawObstacleHP } from './hud.js';
import { sfxVictory, resumeAudio } from './audio.js';
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
      color_primary: '#FFFFFF',
      color_secondary: '#FFD700',
      description: 'A bright shockwave radiates outward',
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
  envItem = createEnvironmentItem(data.environment_item);
  deaths = 0;
  startTime = Date.now();
  elapsedMs = 0;
}

function restartRound() {
  resetPlayer(player);
  // Reset obstacle to initial state
  if (obstacle) {
    obstacle.hp = obstacle.maxHp;
    obstacle.dead = false;
    obstacle.state = 'patrol';
    obstacle.stunTimer = 0;
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

  // Reset
  if (actions.reset && !player.dead) {
    deaths++;
    restartRound();
    return;
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

  // Use environment item
  if (actions.item && envItem && !envItem.used) {
    const result = activateEnvironmentItem(envItem);
    if (result) {
      if (result.obstacleDmg > 0) damageObstacle(obstacle, result.obstacleDmg);
      if (result.stunDuration > 0) stunObstacle(obstacle, result.stunDuration);
      if (result.playerDmg > 0) damagePlayer(player, result.playerDmg);
    }
  }

  // Update obstacle
  if (obstacle && !obstacle.dead) {
    updateObstacle(obstacle, player, dt);

    // Obstacle attacks player (melee / charge)
    if (obstacle.state === 'attack') {
      if (obstacle.attackPattern === 'projectile') {
        fireProjectile(obstacle, player);
      } else {
        // Melee / charge — damage if close
        if (aabbOverlap(player, obstacle)) {
          damagePlayer(player, obstacle.attackDamage);
        }
      }
    }

    // Obstacle projectile hits
    for (const proj of obstacle.projectiles) {
      if (aabbOverlap(proj, player)) {
        damagePlayer(player, proj.damage);
        proj.life = 0; // mark for removal
      }
    }

    // Player-obstacle collision damage (walking into it)
    if (aabbOverlap(player, obstacle) && obstacle.state === 'aggro') {
      damagePlayer(player, Math.ceil(obstacle.attackDamage * 0.3));
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

  // Environment effect overlay (behind entities)
  if (envItem) drawEnvironmentEffect(ctx, envItem, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Obstacle
  if (obstacle && !obstacle.dead) {
    if (obstacle.visual) {
      drawVisual(ctx, obstacle.visual, obstacle.x, obstacle.y, obstacle.facingLeft);
    } else {
      // Fallback rectangle
      ctx.fillStyle = '#CC3333';
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
    drawObstacleHP(ctx, obstacle);

    // Obstacle projectiles
    ctx.fillStyle = '#FF4444';
    for (const p of obstacle.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Weapon projectiles
  if (weapon) {
    ctx.fillStyle = weapon.visual?.color_primary || '#FFD700';
    for (const p of weapon.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Player
  drawStickFigure(ctx, player);

  // Draw weapon near player when attacking
  if (player.state === 'attack' && weapon?.visual) {
    const wx = player.facing === 'right' ? player.x + player.width + 2 : player.x - weapon.visual.width - 2;
    const wy = player.y + 10;
    drawVisual(ctx, weapon.visual, wx, wy, player.facing === 'left');
  }

  // HUD
  drawHUD(ctx, player, weapon, envItem, deaths, elapsedMs);

  ctx.restore();
}

// ── Start ──
requestAnimationFrame(gameLoop);
