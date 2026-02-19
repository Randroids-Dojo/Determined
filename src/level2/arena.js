/**
 * Arena — 3D environment: circular platform, walls, skybox, decorative elements.
 */

import * as THREE from 'three';
import { L2_ARENA_RADIUS, L2_ARENA_WALL_HEIGHT } from '../constants.js';

let arenaGroup = null;
let starField = null;
let portalRing = null;

/**
 * Build the 3D arena and add it to the scene.
 * Returns the arena group for later cleanup.
 */
export function createArena(scene, envKeyword) {
  arenaGroup = new THREE.Group();

  // Derive colors from environment keyword
  const palette = getEnvironmentPalette(envKeyword);

  // ── Ground platform (circular disc) ──
  const groundGeo = new THREE.CylinderGeometry(L2_ARENA_RADIUS, L2_ARENA_RADIUS + 2, 1.5, 64);
  const groundMat = new THREE.MeshStandardMaterial({
    color: palette.ground,
    roughness: 0.7,
    metalness: 0.2,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -0.75;
  ground.receiveShadow = true;
  arenaGroup.add(ground);

  // ── Grid lines on the ground ──
  const gridHelper = new THREE.GridHelper(L2_ARENA_RADIUS * 2, 20, palette.gridLine, palette.gridLine);
  gridHelper.material.opacity = 0.15;
  gridHelper.material.transparent = true;
  gridHelper.position.y = 0.01;
  arenaGroup.add(gridHelper);

  // ── Outer ring / wall ──
  const wallGeo = new THREE.TorusGeometry(L2_ARENA_RADIUS, 0.4, 8, 64);
  const wallMat = new THREE.MeshStandardMaterial({
    color: palette.wall,
    emissive: palette.wallEmissive,
    emissiveIntensity: 0.3,
    roughness: 0.3,
    metalness: 0.8,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.rotation.x = Math.PI / 2;
  wall.position.y = 0.4;
  arenaGroup.add(wall);

  // ── Glowing pillars at cardinal points ──
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const px = Math.cos(angle) * (L2_ARENA_RADIUS - 1);
    const pz = Math.sin(angle) * (L2_ARENA_RADIUS - 1);

    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.4, L2_ARENA_WALL_HEIGHT, 8);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: palette.pillar,
      emissive: palette.pillarEmissive,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.9,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(px, L2_ARENA_WALL_HEIGHT / 2, pz);
    pillar.castShadow = true;
    arenaGroup.add(pillar);

    // Glow orb on top
    const orbGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const orbMat = new THREE.MeshStandardMaterial({
      color: palette.orbColor,
      emissive: palette.orbColor,
      emissiveIntensity: 1.0,
      roughness: 0.0,
      metalness: 0.0,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(px, L2_ARENA_WALL_HEIGHT + 0.5, pz);
    arenaGroup.add(orb);

    // Point light at each pillar
    const pillarLight = new THREE.PointLight(palette.orbColor, 0.4, 15);
    pillarLight.position.set(px, L2_ARENA_WALL_HEIGHT + 1, pz);
    arenaGroup.add(pillarLight);
  }

  // ── Portal ring in center (visual flair) ──
  const portalGeo = new THREE.TorusGeometry(2.5, 0.08, 8, 64);
  const portalMat = new THREE.MeshStandardMaterial({
    color: palette.portalColor,
    emissive: palette.portalColor,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.6,
  });
  portalRing = new THREE.Mesh(portalGeo, portalMat);
  portalRing.rotation.x = Math.PI / 2;
  portalRing.position.y = 0.05;
  arenaGroup.add(portalRing);

  // ── Starfield background ──
  const starCount = 800;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = 80 + Math.random() * 40;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const brightness = 0.5 + Math.random() * 0.5;
    starColors[i * 3] = brightness;
    starColors[i * 3 + 1] = brightness;
    starColors[i * 3 + 2] = brightness * (0.8 + Math.random() * 0.4);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, sizeAttenuation: true });
  starField = new THREE.Points(starGeo, starMat);
  arenaGroup.add(starField);

  scene.add(arenaGroup);
  return arenaGroup;
}

/**
 * Animate arena elements.
 */
export function updateArena(dt, elapsed) {
  if (portalRing) {
    portalRing.rotation.z += dt * 0.5;
    portalRing.material.emissiveIntensity = 0.5 + Math.sin(elapsed * 2) * 0.3;
  }
  if (starField) {
    starField.rotation.y += dt * 0.02;
  }
}

/**
 * Derive color palette from the environment keyword.
 */
function getEnvironmentPalette(keyword) {
  const kw = (keyword || '').toLowerCase();

  if (kw.includes('fire') || kw.includes('lava') || kw.includes('flame') || kw.includes('heat')) {
    return {
      ground: 0x2a1a0a, gridLine: 0xff4400, wall: 0x661100, wallEmissive: 0xff2200,
      pillar: 0x883300, pillarEmissive: 0xff6600, orbColor: 0xff4400, portalColor: 0xff6600,
    };
  }
  if (kw.includes('ice') || kw.includes('snow') || kw.includes('frost') || kw.includes('cold') || kw.includes('blizzard')) {
    return {
      ground: 0x1a2a3a, gridLine: 0x44bbff, wall: 0x224466, wallEmissive: 0x2288cc,
      pillar: 0x336688, pillarEmissive: 0x44aaff, orbColor: 0x66ccff, portalColor: 0x44ddff,
    };
  }
  if (kw.includes('lightning') || kw.includes('electric') || kw.includes('thunder') || kw.includes('storm')) {
    return {
      ground: 0x1a1a2e, gridLine: 0xffdd00, wall: 0x333355, wallEmissive: 0x6644cc,
      pillar: 0x443388, pillarEmissive: 0x8866ff, orbColor: 0xffdd00, portalColor: 0xaa88ff,
    };
  }
  if (kw.includes('tornado') || kw.includes('wind') || kw.includes('hurricane') || kw.includes('gust')) {
    return {
      ground: 0x1a2a1a, gridLine: 0x88cc88, wall: 0x224422, wallEmissive: 0x44aa44,
      pillar: 0x226622, pillarEmissive: 0x66dd66, orbColor: 0x88ff88, portalColor: 0x44ff88,
    };
  }
  if (kw.includes('rain') || kw.includes('flood') || kw.includes('ocean') || kw.includes('water') || kw.includes('tsunami')) {
    return {
      ground: 0x0a1a2e, gridLine: 0x2266aa, wall: 0x113355, wallEmissive: 0x2244aa,
      pillar: 0x224488, pillarEmissive: 0x4488dd, orbColor: 0x4488ff, portalColor: 0x2266dd,
    };
  }

  // Default: cosmic purple
  return {
    ground: 0x1a1a2e, gridLine: 0x6644cc, wall: 0x2a1a3e, wallEmissive: 0x4422aa,
    pillar: 0x3a2a5e, pillarEmissive: 0x6644dd, orbColor: 0xaa66ff, portalColor: 0x8844ff,
  };
}

export function disposeArena(scene) {
  if (arenaGroup) {
    scene.remove(arenaGroup);
    arenaGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    arenaGroup = null;
    starField = null;
    portalRing = null;
  }
}
