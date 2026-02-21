/**
 * Player3D — 3D stick figure player built from Three.js primitives.
 * Capsule body, sphere head, cylinder limbs.
 */

import * as THREE from 'three';
import {
  L2_PLAYER_SPEED, L2_PLAYER_JUMP_FORCE, L2_GRAVITY,
  L2_PLAYER_HP, L2_PLAYER_HEIGHT, L2_PLAYER_RADIUS,
  L2_ARENA_RADIUS, L2_GROUND_FRICTION,
} from '../constants.js';
import { sfxJump, sfxAttack, sfxHitTake, sfxDeath } from '../audio.js';

/**
 * Create the 3D player entity.
 * Returns { mesh, state } — mesh is the Three.js Group, state is game data.
 */
export function createPlayer3D(scene) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.3 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x222222, emissive: 0x222222, emissiveIntensity: 0.2,
    roughness: 0.5, metalness: 0.3,
  });

  // Head
  const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
  const head = new THREE.Mesh(headGeo, glowMat);
  head.position.y = L2_PLAYER_HEIGHT;
  head.castShadow = true;
  group.add(head);

  // Body (cylinder)
  const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = L2_PLAYER_HEIGHT - 0.57;
  body.castShadow = true;
  group.add(body);

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6);

  const leftArm = new THREE.Mesh(armGeo, bodyMat);
  leftArm.position.set(-0.2, L2_PLAYER_HEIGHT - 0.45, 0);
  leftArm.rotation.z = 0.3;
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, bodyMat);
  rightArm.position.set(0.2, L2_PLAYER_HEIGHT - 0.45, 0);
  rightArm.rotation.z = -0.3;
  rightArm.castShadow = true;
  group.add(rightArm);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6);

  const leftLeg = new THREE.Mesh(legGeo, bodyMat);
  leftLeg.position.set(-0.1, 0.3, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, bodyMat);
  rightLeg.position.set(0.1, 0.3, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  group.position.set(0, 0, L2_ARENA_RADIUS * 0.6);
  scene.add(group);

  const state = {
    mesh: group,
    head, body, leftArm, rightArm, leftLeg, rightLeg,
    // Physics
    vx: 0, vy: 0, vz: 0,
    onGround: true,
    // Game
    hp: L2_PLAYER_HP,
    maxHp: L2_PLAYER_HP,
    facing: new THREE.Vector3(0, 0, -1), // direction player faces
    animFrame: 0,
    state: 'idle', // idle, walk, jump, attack, death, victory
    attackCooldown: 0,
    invincibleTimer: 0,
    hitFlashTimer: 0,
    dead: false,
    itemPickedUp: false,
    itemUsed: false,
  };

  return state;
}

/**
 * Update the 3D player each frame.
 * @param {Object} player
 * @param {Object} actions — input actions
 * @param {number} dt — delta time in seconds
 * @param {number} cameraYaw — camera yaw in radians (for camera-relative movement)
 */
export function updatePlayer3D(player, actions, dt, cameraYaw) {
  if (player.dead) return;

  // Timers
  if (player.invincibleTimer > 0) player.invincibleTimer -= dt * 1000;
  if (player.attackCooldown > 0) player.attackCooldown -= dt * 1000;
  if (player.hitFlashTimer > 0) player.hitFlashTimer -= dt * 1000;

  player.animFrame++;

  // ── Movement (analog, dt-based, camera-relative) ──
  const MOVE_SPEED = 8;       // max speed in units/sec
  const ACCEL = 12;            // acceleration smoothing factor
  const DECEL = 10;            // deceleration when no input
  const GRAVITY_ACCEL = 20;    // gravity in units/sec²
  const JUMP_VEL = 8;          // jump velocity in units/sec

  // Read analog input (-1..1 from joystick, or -1/0/1 from keyboard)
  let inputX = actions.moveX;
  let inputZ = actions.moveY;
  let inputMag = Math.sqrt(inputX * inputX + inputZ * inputZ);
  let moving = inputMag > 0.01;

  // Clamp diagonal so it isn't faster
  if (inputMag > 1) {
    inputX /= inputMag;
    inputZ /= inputMag;
    inputMag = 1;
  }

  let worldMoveX = 0;
  let worldMoveZ = 0;

  if (moving) {
    // Rotate input by camera yaw so "forward" = away from camera
    const cos = Math.cos(cameraYaw || 0);
    const sin = Math.sin(cameraYaw || 0);
    worldMoveX = inputX * cos + inputZ * sin;
    worldMoveZ = -inputX * sin + inputZ * cos;

    // Target velocity proportional to joystick magnitude
    const targetSpeed = inputMag * MOVE_SPEED;
    const targetVx = worldMoveX * targetSpeed;
    const targetVz = worldMoveZ * targetSpeed;

    // Smoothly accelerate toward target
    const blend = Math.min(1, ACCEL * dt);
    player.vx += (targetVx - player.vx) * blend;
    player.vz += (targetVz - player.vz) * blend;

    // Update facing direction
    player.facing.set(worldMoveX, 0, worldMoveZ).normalize();
  } else if (player.onGround) {
    // Decelerate smoothly when no input
    const decay = Math.max(0, 1 - DECEL * dt);
    player.vx *= decay;
    player.vz *= decay;
    if (Math.abs(player.vx) < 0.01) player.vx = 0;
    if (Math.abs(player.vz) < 0.01) player.vz = 0;
  }

  // Jump
  if (actions.jump && player.onGround) {
    player.vy = JUMP_VEL;
    player.onGround = false;
    sfxJump();
  }

  // Gravity (dt-based)
  player.vy -= GRAVITY_ACCEL * dt;

  // Apply velocity (dt-based)
  const mesh = player.mesh;
  mesh.position.x += player.vx * dt;
  mesh.position.y += player.vy * dt;
  mesh.position.z += player.vz * dt;

  // Ground collision
  if (mesh.position.y <= 0) {
    mesh.position.y = 0;
    player.vy = 0;
    player.onGround = true;
  }

  // Arena boundary (circular)
  const dist = Math.sqrt(mesh.position.x ** 2 + mesh.position.z ** 2);
  if (dist > L2_ARENA_RADIUS - 1) {
    const angle = Math.atan2(mesh.position.z, mesh.position.x);
    mesh.position.x = Math.cos(angle) * (L2_ARENA_RADIUS - 1);
    mesh.position.z = Math.sin(angle) * (L2_ARENA_RADIUS - 1);
    // Kill outward velocity
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    const dot = player.vx * nx + player.vz * nz;
    if (dot > 0) {
      player.vx -= 1.2 * dot * nx;
      player.vz -= 1.2 * dot * nz;
    }
  }

  // Rotate mesh to face movement direction (smooth)
  if (moving && (worldMoveX !== 0 || worldMoveZ !== 0)) {
    const targetAngle = Math.atan2(worldMoveX, worldMoveZ);
    // Smooth rotation
    let angleDiff = targetAngle - mesh.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    mesh.rotation.y += angleDiff * Math.min(1, 10 * dt);
  }

  // Animate limbs
  animatePlayer(player, moving, dt);

  // Visual state
  if (!player.onGround) {
    player.state = 'jump';
  } else if (player.attackCooldown > 0 && player.state === 'attack') {
    // Keep attack pose
  } else if (moving) {
    player.state = 'walk';
  } else {
    player.state = 'idle';
  }

  // Hit flash visual
  updateHitFlash(player);
}

function animatePlayer(player, moving, dt) {
  const speed = 8;
  const frame = player.animFrame * 0.1 * speed;

  if (player.state === 'attack') {
    // Arms forward in attack
    player.rightArm.rotation.z = -1.5;
    player.rightArm.rotation.x = 0;
    player.leftArm.rotation.z = 0.3;
    return;
  }

  if (player.state === 'victory') {
    // Arms raised
    player.leftArm.rotation.z = 2.5;
    player.rightArm.rotation.z = -2.5;
    player.leftArm.rotation.x = 0;
    player.rightArm.rotation.x = 0;
    return;
  }

  if (moving && player.onGround) {
    // Walk cycle
    const swing = Math.sin(frame) * 0.4;
    player.leftLeg.rotation.x = swing;
    player.rightLeg.rotation.x = -swing;
    player.leftArm.rotation.x = -swing * 0.6;
    player.rightArm.rotation.x = swing * 0.6;
    player.leftArm.rotation.z = 0.3;
    player.rightArm.rotation.z = -0.3;
  } else if (!player.onGround) {
    // Jump pose — legs tucked, arms up
    player.leftLeg.rotation.x = -0.3;
    player.rightLeg.rotation.x = -0.3;
    player.leftArm.rotation.z = 1.0;
    player.rightArm.rotation.z = -1.0;
    player.leftArm.rotation.x = 0;
    player.rightArm.rotation.x = 0;
  } else {
    // Idle — subtle breathing
    const breathe = Math.sin(frame * 0.3) * 0.05;
    player.leftLeg.rotation.x = 0;
    player.rightLeg.rotation.x = 0;
    player.leftArm.rotation.z = 0.3 + breathe;
    player.rightArm.rotation.z = -0.3 - breathe;
    player.leftArm.rotation.x = 0;
    player.rightArm.rotation.x = 0;
  }
}

function updateHitFlash(player) {
  const mats = [player.head.material, player.body.material,
    player.leftArm.material, player.rightArm.material,
    player.leftLeg.material, player.rightLeg.material];

  if (player.hitFlashTimer > 0) {
    // Flash red
    const flashOn = Math.floor(player.hitFlashTimer / 50) % 2 === 0;
    const color = flashOn ? 0xff2222 : 0x222222;
    mats.forEach(m => { m.color.setHex(color); m.emissive.setHex(flashOn ? 0xff0000 : 0x222222); });
  } else if (player.invincibleTimer > 0) {
    // Blink
    const visible = Math.floor(player.invincibleTimer / 80) % 2 === 0;
    player.mesh.visible = visible;
  } else {
    player.mesh.visible = true;
    mats.forEach(m => { m.color.setHex(0x222222); m.emissive.setHex(0x222222); m.emissiveIntensity = 0.2; });
  }
}

/**
 * Deal damage to the 3D player.
 */
export function damagePlayer3D(player, amount, sourcePos) {
  if (player.dead || player.invincibleTimer > 0) return false;

  player.hp -= amount;
  player.invincibleTimer = 1000;
  player.hitFlashTimer = 150;

  // Knockback
  if (sourcePos) {
    const dx = player.mesh.position.x - sourcePos.x;
    const dz = player.mesh.position.z - sourcePos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    player.vx += (dx / len) * 0.3;
    player.vz += (dz / len) * 0.3;
    player.vy = 0.1;
    player.onGround = false;
  }

  if (player.hp <= 0) {
    player.hp = 0;
    player.dead = true;
    player.state = 'death';
    sfxDeath();
    return true;
  }
  sfxHitTake();
  return false;
}

/**
 * Try to initiate an attack.
 */
export function tryAttack3D(player, weaponCooldown) {
  if (player.dead || player.attackCooldown > 0) return false;
  player.attackCooldown = weaponCooldown;
  player.state = 'attack';
  sfxAttack();
  return true;
}

/**
 * Reset 3D player to initial state.
 */
export function resetPlayer3D(player) {
  player.mesh.position.set(0, 0, L2_ARENA_RADIUS * 0.6);
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.onGround = true;
  player.hp = L2_PLAYER_HP;
  player.facing.set(0, 0, -1);
  player.animFrame = 0;
  player.state = 'idle';
  player.attackCooldown = 0;
  player.invincibleTimer = 0;
  player.hitFlashTimer = 0;
  player.dead = false;
  player.mesh.visible = true;
  player.mesh.rotation.set(0, 0, 0);
  player.itemPickedUp = false;
  player.itemUsed = false;
}

export function disposePlayer3D(player, scene) {
  if (player && player.mesh) {
    scene.remove(player.mesh);
    player.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
