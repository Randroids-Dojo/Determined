/**
 * Weapon3D — 3D weapon system with melee, projectile, and area attacks.
 */

import * as THREE from 'three';

let weaponProjectiles = [];
let projectileGroup = null;

/**
 * Create a 3D weapon from LLM data.
 */
export function createWeapon3D(scene, weaponData) {
  const data = weaponData || {};
  const visual = data.visual || {};
  const primaryColor = parseColor(visual.color_primary, 0xffd700);
  const secondaryColor = parseColor(visual.color_secondary, 0xc0c0c0);

  // Build a simple 3D weapon mesh
  const group = new THREE.Group();

  // Handle/shaft
  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.8, 6);
  const shaftMat = new THREE.MeshStandardMaterial({
    color: primaryColor, roughness: 0.4, metalness: 0.6,
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);

  // Blade/head
  const headGeo = data.attack_pattern === 'projectile'
    ? new THREE.SphereGeometry(0.15, 8, 8)
    : new THREE.ConeGeometry(0.12, 0.4, 6);
  const headMat = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    emissive: secondaryColor,
    emissiveIntensity: 0.3,
    roughness: 0.2,
    metalness: 0.8,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.x = 0.5;
  head.rotation.z = -Math.PI / 2;
  group.add(head);

  group.visible = false; // Shown during attack

  // Projectile container
  projectileGroup = new THREE.Group();
  scene.add(projectileGroup);

  const state = {
    mesh: group,
    name: data.name || 'Weapon',
    description: data.description || '',
    damage: data.damage || 20,
    damageType: data.damage_type || 'blunt',
    attackPattern: data.attack_pattern || 'melee',
    range: (data.range || 55) * 0.06,
    cooldown: (data.cooldown || 0.5) * 1000,
    specialEffect: data.special_effect || 'none',
    specialEffectDuration: (data.special_effect_duration || 0) * 1000,
    effectiveness: data.effectiveness_vs_obstacle || 1.0,
    primaryColor,
    secondaryColor,
    projectiles: weaponProjectiles,
    projectileGroup,
    // Visual effects
    slashTrail: null,
    slashTimer: 0,
  };

  return state;
}

/**
 * Process an attack against the obstacle.
 */
export function processAttack3D(weapon, player, obstacle, scene) {
  if (!weapon || !obstacle || obstacle.dead) return 0;

  const playerPos = player.mesh.position;
  const obstPos = obstacle.mesh.position;
  const dx = obstPos.x - playerPos.x;
  const dz = obstPos.z - playerPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Show weapon during attack
  weapon.mesh.visible = true;
  weapon.slashTimer = 200;

  // Attach weapon to player
  if (!weapon.mesh.parent || weapon.mesh.parent !== player.mesh) {
    player.mesh.add(weapon.mesh);
    weapon.mesh.position.set(0.3, 1.5, -0.3);
  }

  switch (weapon.attackPattern) {
    case 'melee': {
      if (dist <= weapon.range) {
        const dmg = calcDamage(weapon, obstacle);
        applySpecialEffect(weapon, obstacle);
        spawnSlashEffect(weapon, playerPos, player.facing, scene);
        return dmg;
      }
      spawnSlashEffect(weapon, playerPos, player.facing, scene);
      return 0;
    }
    case 'projectile': {
      fireWeaponProjectile(weapon, playerPos, player.facing, scene);
      return 0; // Damage applied on hit
    }
    case 'area': {
      if (dist <= weapon.range * 1.5) {
        const dmg = calcDamage(weapon, obstacle);
        applySpecialEffect(weapon, obstacle);
        spawnAoeEffect(weapon, playerPos, scene);
        return dmg;
      }
      spawnAoeEffect(weapon, playerPos, scene);
      return 0;
    }
    default:
      return 0;
  }
}

function calcDamage(weapon, obstacle) {
  let dmg = weapon.damage;
  if (weapon.damageType === obstacle.weakness) {
    dmg *= weapon.effectiveness;
  }
  return Math.ceil(dmg);
}

function applySpecialEffect(weapon, obstacle) {
  if (!obstacle || obstacle.dead) return;
  switch (weapon.specialEffect) {
    case 'knockback': {
      const dir = new THREE.Vector3()
        .subVectors(obstacle.mesh.position, obstacle.patrolCenter)
        .normalize()
        .multiplyScalar(2);
      obstacle.mesh.position.add(dir);
      break;
    }
    case 'stun':
    case 'freeze': {
      obstacle.stunTimer = Math.max(obstacle.stunTimer, weapon.specialEffectDuration);
      break;
    }
  }
}

function spawnSlashEffect(weapon, position, facing, scene) {
  const slashGeo = new THREE.TorusGeometry(weapon.range * 0.5, 0.05, 4, 16, Math.PI);
  const slashMat = new THREE.MeshBasicMaterial({
    color: weapon.primaryColor,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  const slash = new THREE.Mesh(slashGeo, slashMat);
  slash.position.copy(position);
  slash.position.y += 1.2;

  const angle = Math.atan2(facing.x, facing.z);
  slash.rotation.y = angle;
  slash.rotation.x = Math.PI / 4;

  scene.add(slash);

  // Fade out
  const startTime = Date.now();
  const fadeSlash = () => {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / 300;
    if (progress >= 1) {
      scene.remove(slash);
      slash.geometry.dispose();
      slash.material.dispose();
      return;
    }
    slash.material.opacity = 0.7 * (1 - progress);
    slash.scale.setScalar(1 + progress * 0.5);
    requestAnimationFrame(fadeSlash);
  };
  requestAnimationFrame(fadeSlash);
}

function spawnAoeEffect(weapon, position, scene) {
  const ringGeo = new THREE.RingGeometry(0.1, weapon.range * 1.5, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: weapon.primaryColor,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(position);
  ring.position.y += 0.1;
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  const startTime = Date.now();
  const expandRing = () => {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / 500;
    if (progress >= 1) {
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
      return;
    }
    ring.material.opacity = 0.5 * (1 - progress);
    ring.scale.setScalar(1 + progress * 2);
    requestAnimationFrame(expandRing);
  };
  requestAnimationFrame(expandRing);
}

function fireWeaponProjectile(weapon, position, facing, scene) {
  const projGeo = new THREE.SphereGeometry(0.15, 8, 8);
  const projMat = new THREE.MeshStandardMaterial({
    color: weapon.primaryColor,
    emissive: weapon.primaryColor,
    emissiveIntensity: 0.8,
  });
  const projMesh = new THREE.Mesh(projGeo, projMat);
  projMesh.position.copy(position);
  projMesh.position.y += 1.2;

  const light = new THREE.PointLight(weapon.primaryColor, 0.3, 4);
  projMesh.add(light);

  projectileGroup.add(projMesh);

  weaponProjectiles.push({
    mesh: projMesh,
    vx: facing.x * 0.3,
    vy: 0,
    vz: facing.z * 0.3,
    damage: weapon.damage,
    life: 2000,
    weapon,
  });
}

/**
 * Update weapon projectiles and check for hits.
 */
export function updateWeaponProjectiles3D(weapon, obstacle, dt) {
  let totalDmg = 0;

  for (let i = weaponProjectiles.length - 1; i >= 0; i--) {
    const p = weaponProjectiles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.life -= dt * 1000;

    // Check hit against obstacle
    if (obstacle && !obstacle.dead) {
      const dx = p.mesh.position.x - obstacle.mesh.position.x;
      const dz = p.mesh.position.z - obstacle.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.5) {
        totalDmg += calcDamage(p.weapon, obstacle);
        applySpecialEffect(p.weapon, obstacle);
        p.life = 0; // Remove
      }
    }

    if (p.life <= 0) {
      projectileGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      weaponProjectiles.splice(i, 1);
    }
  }

  // Hide weapon after attack animation
  if (weapon && weapon.slashTimer > 0) {
    weapon.slashTimer -= dt * 1000;
    if (weapon.slashTimer <= 0) {
      weapon.mesh.visible = false;
    }
  }

  return totalDmg;
}

export function disposeWeapon3D(weapon, scene) {
  if (!weapon) return;
  if (weapon.mesh.parent) weapon.mesh.parent.remove(weapon.mesh);
  weapon.mesh.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });

  for (const p of weaponProjectiles) {
    projectileGroup.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  weaponProjectiles = [];
  if (projectileGroup) {
    scene.remove(projectileGroup);
    projectileGroup = null;
  }
}

function parseColor(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'number') return str;
  if (str.startsWith('#')) return parseInt(str.replace('#', ''), 16);
  return fallback;
}
