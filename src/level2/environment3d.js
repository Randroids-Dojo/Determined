/**
 * Environment3D — 3D environment effects (pickable item + activation VFX).
 * Adapts the 2D environment item system to 3D space.
 */

import * as THREE from 'three';
import { L2_ARENA_RADIUS } from '../constants.js';
import { sfxItemPickup, sfxItemUse } from '../audio.js';

let effectGroup = null;
let particles = [];

/**
 * Create a 3D environment item.
 */
export function createEnvironmentItem3D(scene, envData, keyword) {
  const data = envData || {};
  const visualEffect = data.visual_effect || {};
  const primaryColor = parseColor(visualEffect.color_primary, 0x44ddff);
  const secondaryColor = parseColor(visualEffect.color_secondary, 0xffd700);

  // Floating pickup orb
  const group = new THREE.Group();

  // Core sphere
  const coreGeo = new THREE.SphereGeometry(0.4, 16, 16);
  const coreMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    emissive: primaryColor,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.9,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // Outer glow ring
  const ringGeo = new THREE.TorusGeometry(0.6, 0.04, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: secondaryColor,
    transparent: true,
    opacity: 0.5,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);

  // Second ring (perpendicular)
  const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
  ring2.rotation.x = Math.PI / 2;
  group.add(ring2);

  // Point light
  const light = new THREE.PointLight(primaryColor, 0.6, 8);
  light.position.y = 0.5;
  group.add(light);

  // Position in arena (between player spawn and center)
  group.position.set(L2_ARENA_RADIUS * 0.25, 1.2, L2_ARENA_RADIUS * 0.2);
  scene.add(group);

  effectGroup = new THREE.Group();
  scene.add(effectGroup);

  const state = {
    mesh: group,
    core, ring, ring2, light,
    name: data.name || 'Mystery Effect',
    keyword: keyword || '???',
    damage: data.damage || 40,
    effectType: data.effect_type || 'mixed',
    areaOfEffect: data.area_of_effect || 'full_screen',
    duration: (data.duration || 0.5) * 1000,
    screenShake: data.screen_shake || 6,
    affectsPlayer: data.affects_player || { active: false, effect: '' },
    affectsObstacle: data.affects_obstacle || { active: true, effect: '' },
    visualEffect,
    primaryColor,
    secondaryColor,
    // State
    pickedUp: false,
    used: false,
    active: false,
    timer: 0,
    effectGroup,
    particles: [],
  };

  return state;
}

/**
 * Update the environment item visuals (bob, spin, glow).
 */
export function updateEnvironmentItem3D(envItem, dt, elapsed) {
  if (!envItem) return;

  if (!envItem.pickedUp && !envItem.used) {
    // Floating bob + spin
    envItem.mesh.position.y = 1.2 + Math.sin(elapsed * 2) * 0.3;
    envItem.ring.rotation.z += dt * 1.5;
    envItem.ring2.rotation.y += dt * 1.2;
    envItem.core.material.emissiveIntensity = 0.6 + Math.sin(elapsed * 3) * 0.3;
  } else if (envItem.pickedUp && !envItem.used) {
    envItem.mesh.visible = false;
  }

  // Active effect animation
  if (envItem.active) {
    envItem.timer -= dt * 1000;
    updateEffectParticles(envItem, dt);
    if (envItem.timer <= 0) {
      envItem.active = false;
      clearEffectParticles(envItem);
    }
  }
}

/**
 * Check if player is close enough to pick up.
 */
export function checkItemPickup3D(envItem, playerPos) {
  if (!envItem || envItem.pickedUp || envItem.used) return false;
  const dx = playerPos.x - envItem.mesh.position.x;
  const dz = playerPos.z - envItem.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 1.5) {
    envItem.pickedUp = true;
    envItem.mesh.visible = false;
    sfxItemPickup();
    return true;
  }
  return false;
}

/**
 * Activate the environment item.
 */
export function activateEnvironmentItem3D(envItem, obstaclePos, scene) {
  if (!envItem || !envItem.pickedUp || envItem.used) return null;

  envItem.used = true;
  envItem.active = true;
  envItem.timer = envItem.duration;
  sfxItemUse();

  // Spawn effect particles at obstacle position
  spawnEffectParticles(envItem, obstaclePos, scene);

  const result = {
    playerDmg: envItem.affectsPlayer?.active ? Math.ceil(envItem.damage * 0.2) : 0,
    obstacleDmg: envItem.affectsObstacle?.active ? envItem.damage : 0,
    stunDuration: envItem.effectType === 'stun' ? envItem.duration : (envItem.duration * 0.5),
  };

  return result;
}

function spawnEffectParticles(envItem, targetPos, scene) {
  const style = getEffectStyle(envItem.keyword);
  const count = 40;

  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? envItem.primaryColor : envItem.secondaryColor,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);

    let px, py, pz, vx, vy, vz;

    switch (style) {
      case 'bolt':
        px = targetPos.x + (Math.random() - 0.5) * 0.5;
        py = 8 + Math.random() * 4;
        pz = targetPos.z + (Math.random() - 0.5) * 0.5;
        vx = (Math.random() - 0.5) * 0.02;
        vy = -0.15 - Math.random() * 0.1;
        vz = (Math.random() - 0.5) * 0.02;
        break;
      case 'flames':
        px = targetPos.x + (Math.random() - 0.5) * 2;
        py = 0.2;
        pz = targetPos.z + (Math.random() - 0.5) * 2;
        vx = (Math.random() - 0.5) * 0.03;
        vy = 0.05 + Math.random() * 0.08;
        vz = (Math.random() - 0.5) * 0.03;
        break;
      case 'freeze':
        const angle = (i / count) * Math.PI * 2;
        const r = 0.5 + Math.random() * 0.5;
        px = targetPos.x + Math.cos(angle) * r;
        py = 0.5 + Math.random() * 2;
        pz = targetPos.z + Math.sin(angle) * r;
        vx = Math.cos(angle) * 0.03;
        vy = (Math.random() - 0.5) * 0.02;
        vz = Math.sin(angle) * 0.03;
        break;
      case 'explosion':
        px = targetPos.x;
        py = 1;
        pz = targetPos.z;
        const eAngle = Math.random() * Math.PI * 2;
        const ePhi = (Math.random() - 0.5) * Math.PI;
        const speed = 0.1 + Math.random() * 0.15;
        vx = Math.cos(eAngle) * Math.cos(ePhi) * speed;
        vy = Math.sin(ePhi) * speed;
        vz = Math.sin(eAngle) * Math.cos(ePhi) * speed;
        break;
      case 'beam':
        px = targetPos.x + (Math.random() - 0.5) * 1;
        py = 10;
        pz = targetPos.z + (Math.random() - 0.5) * 1;
        vx = 0;
        vy = -0.2;
        vz = 0;
        break;
      case 'wind':
        const wAngle = (i / count) * Math.PI * 2 + Math.random();
        const wR = 1 + Math.random() * 3;
        px = targetPos.x + Math.cos(wAngle) * wR;
        py = 0.5 + Math.random() * 3;
        pz = targetPos.z + Math.sin(wAngle) * wR;
        vx = -Math.sin(wAngle) * 0.08;
        vy = 0.02;
        vz = Math.cos(wAngle) * 0.08;
        break;
      default: // rain
        px = targetPos.x + (Math.random() - 0.5) * 4;
        py = 6 + Math.random() * 4;
        pz = targetPos.z + (Math.random() - 0.5) * 4;
        vx = (Math.random() - 0.5) * 0.01;
        vy = -0.1 - Math.random() * 0.05;
        vz = (Math.random() - 0.5) * 0.01;
        break;
    }

    mesh.position.set(px, py, pz);
    effectGroup.add(mesh);

    envItem.particles.push({
      mesh, vx, vy, vz,
      life: 1.0,
      decay: 0.3 + Math.random() * 0.4,
    });
  }
}

function updateEffectParticles(envItem, dt) {
  for (let i = envItem.particles.length - 1; i >= 0; i--) {
    const p = envItem.particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.life -= p.decay * dt;
    p.mesh.material.opacity = Math.max(0, p.life);

    if (p.life <= 0) {
      effectGroup.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      envItem.particles.splice(i, 1);
    }
  }
}

function clearEffectParticles(envItem) {
  for (const p of envItem.particles) {
    effectGroup.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  envItem.particles = [];
}

function getEffectStyle(keyword) {
  const kw = (keyword || '').toLowerCase();
  if (/lightning|electric|thunder|energy|shock/.test(kw)) return 'bolt';
  if (/fire|flame|heat|lava|magma|burn/.test(kw)) return 'flames';
  if (/ice|snow|cold|frost|freeze|blizzard/.test(kw)) return 'freeze';
  if (/tornado|hurricane|wind|gust|cyclone/.test(kw)) return 'wind';
  if (/earthquake|shockwave|meteor|bomb|explosion/.test(kw)) return 'explosion';
  if (/laser|light|solar|radiation|beam/.test(kw)) return 'beam';
  if (/rain|hail|acid|flood|tsunami|water/.test(kw)) return 'rain';
  return 'explosion';
}

export function disposeEnvironmentItem3D(envItem, scene) {
  if (!envItem) return;
  clearEffectParticles(envItem);
  scene.remove(envItem.mesh);
  envItem.mesh.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  if (effectGroup) {
    scene.remove(effectGroup);
    effectGroup = null;
  }
}

function parseColor(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'number') return str;
  if (str.startsWith('#')) return parseInt(str.replace('#', ''), 16);
  return fallback;
}
