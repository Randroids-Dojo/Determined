/**
 * Weapon — the LLM-generated weapon the player wields.
 */

import {
  WEAPON_DMG_MIN, WEAPON_DMG_MAX,
  WEAPON_COOLDOWN_MIN, WEAPON_COOLDOWN_MAX,
  WEAPON_EFFECTIVENESS_MIN, WEAPON_EFFECTIVENESS_MAX,
} from './constants.js';
import { centerDistance, aabbOverlap } from './physics.js';
import { sfxHitDeal } from './audio.js';

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Create weapon from LLM data.
 */
export function createWeapon(data) {
  const d = data || {};
  return {
    name: d.name || 'Pointy Stick',
    description: d.description || 'It is pointy. That is its best quality.',
    damage: clamp(d.damage || 20, WEAPON_DMG_MIN, WEAPON_DMG_MAX),
    damageType: d.damage_type || 'blunt',
    attackPattern: d.attack_pattern || 'melee', // melee | projectile | area
    range: clamp(d.range || 50, 30, 200),
    cooldown: clamp((d.cooldown || 0.5) * 1000, WEAPON_COOLDOWN_MIN * 1000, WEAPON_COOLDOWN_MAX * 1000), // ms
    specialEffect: d.special_effect || 'none',
    specialEffectDuration: (d.special_effect_duration || 0) * 1000, // ms
    effectiveness: clamp(d.effectiveness_vs_obstacle || 1.0, WEAPON_EFFECTIVENESS_MIN, WEAPON_EFFECTIVENESS_MAX),
    visual: d.visual || null,

    // Projectile tracking
    projectiles: [],
  };
}

/**
 * Process a player attack. Returns damage dealt to the obstacle (0 if miss).
 */
export function processAttack(weapon, player, obstacle) {
  if (obstacle.dead) return 0;

  const effectiveDamage = Math.round(weapon.damage * weapon.effectiveness);

  switch (weapon.attackPattern) {
    case 'melee': {
      const dist = centerDistance(player, obstacle);
      if (dist <= weapon.range) {
        sfxHitDeal();
        applySpecialEffect(weapon, obstacle);
        return effectiveDamage;
      }
      return 0;
    }

    case 'projectile': {
      // Fire a projectile toward the obstacle
      const px = player.x + player.width / 2;
      const py = player.y + player.height / 2;
      const dir = player.facing === 'right' ? 1 : -1;
      weapon.projectiles.push({
        x: px,
        y: py,
        vx: dir * 6,
        vy: 0,
        width: 6,
        height: 6,
        damage: effectiveDamage,
        life: 1500,
      });
      return 0; // damage applied on projectile hit
    }

    case 'area': {
      // Area-of-effect: always hits if within generous range
      const dist = centerDistance(player, obstacle);
      if (dist <= weapon.range * 1.5) {
        sfxHitDeal();
        applySpecialEffect(weapon, obstacle);
        return effectiveDamage;
      }
      return 0;
    }

    default:
      return 0;
  }
}

/**
 * Update weapon projectiles. Returns total damage dealt to the obstacle this frame.
 */
export function updateWeaponProjectiles(weapon, obstacle, dt) {
  let totalDmg = 0;
  for (let i = weapon.projectiles.length - 1; i >= 0; i--) {
    const p = weapon.projectiles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= dt;

    // Hit obstacle?
    if (!obstacle.dead && aabbOverlap(p, obstacle)) {
      totalDmg += p.damage;
      sfxHitDeal();
      applySpecialEffect(weapon, obstacle);
      weapon.projectiles.splice(i, 1);
      continue;
    }

    // Off screen or expired?
    if (p.life <= 0 || p.x < -20 || p.x > 820 || p.y < -20 || p.y > 460) {
      weapon.projectiles.splice(i, 1);
    }
  }
  return totalDmg;
}

function applySpecialEffect(weapon, obstacle) {
  switch (weapon.specialEffect) {
    case 'stun':
    case 'freeze':
      if (obstacle.stunTimer <= 0) {
        obstacle.stunTimer = weapon.specialEffectDuration || 1000;
        obstacle.state = 'stunned';
      }
      break;
    case 'knockback':
      obstacle.x += (obstacle.facingLeft ? 1 : -1) * 30;
      break;
    default:
      break;
  }
}
