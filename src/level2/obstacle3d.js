/**
 * Obstacle3D — 3D enemy creature with AI, built from LLM-generated data.
 * Uses procedural 3D shapes based on the visual description.
 */

import * as THREE from 'three';
import { L2_ARENA_RADIUS } from '../constants.js';

/**
 * Create a 3D obstacle from LLM data.
 */
export function createObstacle3D(scene, obstacleData) {
  const group = new THREE.Group();

  const data = obstacleData || {};
  const visual = data.visual || {};
  const primaryColor = parseColor(visual.color_primary, 0xcc3333);
  const secondaryColor = parseColor(visual.color_secondary, 0xff6666);
  const accentColor = parseColor(visual.color_accent, 0x220000);

  // Scale up the 2D visual dimensions to 3D
  const baseW = (visual.width || 50) / 25;  // Normalize to ~2 units
  const baseH = (visual.height || 45) / 25;
  const baseD = Math.max(baseW, baseH) * 0.7;

  // Main body
  const bodyGeo = visual.base_shape === 'circle'
    ? new THREE.SphereGeometry(baseW * 0.5, 16, 16)
    : new THREE.BoxGeometry(baseW, baseH, baseD);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.5,
    metalness: 0.3,
    emissive: primaryColor,
    emissiveIntensity: 0.15,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = baseH * 0.5 + 0.1;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Build features from visual description
  if (visual.features && visual.features.length > 0) {
    for (const feature of visual.features) {
      const featureMesh = buildFeature3D(feature, baseW, baseH, baseD);
      if (featureMesh) {
        featureMesh.position.y += baseH * 0.5 + 0.1;
        group.add(featureMesh);
      }
    }
  }

  // Eye glow (always add for menacing look)
  const eyeLight = new THREE.PointLight(accentColor, 0.5, 5);
  eyeLight.position.set(0, baseH * 0.7, baseD * 0.4);
  group.add(eyeLight);

  // Shadow underneath
  const shadowGeo = new THREE.CircleGeometry(baseW * 0.6, 16);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.3,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  // Position in arena
  group.position.set(0, 0, -L2_ARENA_RADIUS * 0.3);
  scene.add(group);

  const hp = data.health || 100;
  const state = {
    mesh: group,
    bodyMesh,
    name: data.name || 'Unknown Creature',
    description: data.description || '',
    hp,
    maxHp: hp,
    attackDamage: data.attack_damage || 15,
    attackPattern: data.attack_pattern || 'melee',
    attackCooldown: (data.attack_cooldown || 1.5) * 1000,
    moveSpeed: (data.movement_speed || 2) * 0.04,
    aggroRange: (data.aggro_range || 120) * 0.1,
    weakness: data.weakness || 'none',
    // AI state
    aiState: 'patrol', // patrol, aggro, attack, stunned, dead
    patrolAngle: 0,
    patrolCenter: new THREE.Vector3(0, 0, -L2_ARENA_RADIUS * 0.3),
    patrolRadius: 5,
    attackTimer: 0,
    stunTimer: 0,
    facingAngle: 0,
    dead: false,
    deathTimer: 0,
    deathDuration: 800,
    showDescription: true,
    descriptionTimer: 3000,
    // Projectiles
    projectiles: [],
    projectileGroup: new THREE.Group(),
  };

  scene.add(state.projectileGroup);

  return state;
}

function buildFeature3D(feature, baseW, baseH, baseD) {
  const color = parseColor(feature.color, 0x888888);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.2,
  });

  // Convert 2D coordinates to 3D offsets
  const scaleX = baseW / 50; // Normalize from ~50px visual space
  const scaleY = baseH / 45;

  switch (feature.type) {
    case 'circle': {
      const r = (feature.radius || 5) * scaleX;
      const geo = new THREE.SphereGeometry(r, 10, 10);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        ((feature.x || 0) - 25) * scaleX,  // Center-relative
        ((feature.y || 0)) * -scaleY,
        baseD * 0.45,  // On the front face
      );
      mesh.castShadow = true;
      return mesh;
    }
    case 'rectangle': {
      const w = (feature.width || 10) * scaleX;
      const h = (feature.height || 10) * scaleY;
      const d = Math.min(w, h) * 0.3;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        ((feature.x || 0) + (feature.width || 10) / 2 - 25) * scaleX,
        ((feature.y || 0) + (feature.height || 10) / 2) * -scaleY,
        baseD * 0.4,
      );
      mesh.castShadow = true;
      return mesh;
    }
    case 'triangle':
    case 'polygon': {
      if (feature.points && feature.points.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(
          (feature.points[0][0] - 25) * scaleX,
          feature.points[0][1] * -scaleY,
        );
        for (let i = 1; i < feature.points.length; i++) {
          shape.lineTo(
            (feature.points[i][0] - 25) * scaleX,
            feature.points[i][1] * -scaleY,
          );
        }
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = baseD * 0.4;
        mesh.castShadow = true;
        return mesh;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Update obstacle AI and movement.
 */
export function updateObstacle3D(obstacle, player, dt) {
  if (!obstacle) return;

  // Description timer
  if (obstacle.showDescription) {
    obstacle.descriptionTimer -= dt * 1000;
    if (obstacle.descriptionTimer <= 0) obstacle.showDescription = false;
  }

  // Death animation
  if (obstacle.dead) {
    obstacle.deathTimer += dt * 1000;
    const progress = Math.min(obstacle.deathTimer / obstacle.deathDuration, 1);
    const scale = 1 - progress * 0.6;
    obstacle.mesh.scale.setScalar(scale);
    obstacle.mesh.position.y = progress * -0.5;
    obstacle.bodyMesh.material.opacity = 1 - progress;
    obstacle.bodyMesh.material.transparent = true;
    return;
  }

  // Stunned
  if (obstacle.stunTimer > 0) {
    obstacle.stunTimer -= dt * 1000;
    obstacle.aiState = 'stunned';
    // Wobble while stunned
    obstacle.mesh.rotation.z = Math.sin(Date.now() * 0.02) * 0.2;
    return;
  }
  obstacle.mesh.rotation.z = 0;

  const playerPos = player.mesh.position;
  const obstPos = obstacle.mesh.position;
  const dx = playerPos.x - obstPos.x;
  const dz = playerPos.z - obstPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Face player when aware
  if (dist < obstacle.aggroRange * 2) {
    const targetAngle = Math.atan2(dx, dz);
    obstacle.mesh.rotation.y = targetAngle;
    obstacle.facingAngle = targetAngle;
  }

  // AI state machine
  if (dist < obstacle.aggroRange * 0.5 && obstacle.attackTimer <= 0) {
    // Attack range
    obstacle.aiState = 'attack';
    obstacle.attackTimer = obstacle.attackCooldown;
  } else if (dist < obstacle.aggroRange) {
    // Chase
    obstacle.aiState = 'aggro';
  } else {
    // Patrol
    obstacle.aiState = 'patrol';
  }

  // Movement
  switch (obstacle.aiState) {
    case 'patrol': {
      obstacle.patrolAngle += dt * 0.5;
      const px = obstacle.patrolCenter.x + Math.cos(obstacle.patrolAngle) * obstacle.patrolRadius;
      const pz = obstacle.patrolCenter.z + Math.sin(obstacle.patrolAngle) * obstacle.patrolRadius;
      const moveDir = new THREE.Vector3(px - obstPos.x, 0, pz - obstPos.z);
      if (moveDir.length() > 0.1) {
        moveDir.normalize().multiplyScalar(obstacle.moveSpeed * 0.5);
        obstPos.x += moveDir.x;
        obstPos.z += moveDir.z;
      }
      break;
    }
    case 'aggro': {
      const moveDir = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(obstacle.moveSpeed);
      obstPos.x += moveDir.x;
      obstPos.z += moveDir.z;
      break;
    }
    case 'attack': {
      // Brief lunge
      if (obstacle.attackTimer > obstacle.attackCooldown * 0.8) {
        const moveDir = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(obstacle.moveSpeed * 1.5);
        obstPos.x += moveDir.x;
        obstPos.z += moveDir.z;
      }
      break;
    }
  }

  // Keep in arena
  const oDist = Math.sqrt(obstPos.x ** 2 + obstPos.z ** 2);
  if (oDist > L2_ARENA_RADIUS - 2) {
    const angle = Math.atan2(obstPos.z, obstPos.x);
    obstPos.x = Math.cos(angle) * (L2_ARENA_RADIUS - 2);
    obstPos.z = Math.sin(angle) * (L2_ARENA_RADIUS - 2);
  }

  // Attack cooldown
  if (obstacle.attackTimer > 0) {
    obstacle.attackTimer -= dt * 1000;
  }

  // Bob animation
  obstacle.mesh.position.y = Math.sin(Date.now() * 0.003) * 0.1;

  // Update projectiles
  updateProjectiles3D(obstacle, player, dt);
}

/**
 * Fire a projectile at the player.
 */
export function fireProjectile3D(obstacle, player) {
  const start = obstacle.mesh.position.clone();
  start.y += 1;
  const dir = new THREE.Vector3()
    .subVectors(player.mesh.position, start)
    .normalize();

  const projGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const projMat = new THREE.MeshStandardMaterial({
    color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 0.8,
  });
  const projMesh = new THREE.Mesh(projGeo, projMat);
  projMesh.position.copy(start);

  // Glow
  const projLight = new THREE.PointLight(0xff4444, 0.3, 4);
  projMesh.add(projLight);

  obstacle.projectileGroup.add(projMesh);
  obstacle.projectiles.push({
    mesh: projMesh,
    vx: dir.x * 0.2,
    vy: dir.y * 0.2,
    vz: dir.z * 0.2,
    damage: obstacle.attackDamage,
    life: 3000,
  });
}

function updateProjectiles3D(obstacle, player, dt) {
  for (let i = obstacle.projectiles.length - 1; i >= 0; i--) {
    const p = obstacle.projectiles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.life -= dt * 1000;

    if (p.life <= 0) {
      obstacle.projectileGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      obstacle.projectiles.splice(i, 1);
    }
  }
}

/**
 * Damage the obstacle.
 */
export function damageObstacle3D(obstacle, amount) {
  if (!obstacle || obstacle.dead) return;
  obstacle.hp -= amount;

  // Flash effect
  obstacle.bodyMesh.material.emissiveIntensity = 1.0;
  setTimeout(() => {
    if (obstacle.bodyMesh && obstacle.bodyMesh.material) {
      obstacle.bodyMesh.material.emissiveIntensity = 0.15;
    }
  }, 100);

  if (obstacle.hp <= 0) {
    obstacle.hp = 0;
    obstacle.dead = true;
    obstacle.aiState = 'dead';
  }
}

/**
 * Stun the obstacle.
 */
export function stunObstacle3D(obstacle, durationMs) {
  if (!obstacle || obstacle.dead) return;
  obstacle.stunTimer = Math.max(obstacle.stunTimer, durationMs);
}

/**
 * Check if player overlaps with obstacle (simple sphere collision).
 */
export function checkObstacleCollision3D(obstacle, player) {
  if (!obstacle || obstacle.dead) return false;
  const dx = player.mesh.position.x - obstacle.mesh.position.x;
  const dz = player.mesh.position.z - obstacle.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return dist < 1.5;
}

/**
 * Check if a projectile hits the player.
 */
export function checkProjectileHits3D(obstacle, player) {
  const hits = [];
  for (let i = obstacle.projectiles.length - 1; i >= 0; i--) {
    const p = obstacle.projectiles[i];
    const dx = p.mesh.position.x - player.mesh.position.x;
    const dy = p.mesh.position.y - (player.mesh.position.y + 1);
    const dz = p.mesh.position.z - player.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.8) {
      hits.push(p);
      obstacle.projectileGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      obstacle.projectiles.splice(i, 1);
    }
  }
  return hits;
}

export function disposeObstacle3D(obstacle, scene) {
  if (!obstacle) return;
  scene.remove(obstacle.mesh);
  obstacle.mesh.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
  // Clean up projectiles
  for (const p of obstacle.projectiles) {
    obstacle.projectileGroup.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  scene.remove(obstacle.projectileGroup);
}

function parseColor(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'number') return str;
  if (str.startsWith('#')) return parseInt(str.replace('#', ''), 16);
  return fallback;
}
