/**
 * AssetViewer — renders a generated entity in both 2D (canvas) and 3D (Three.js)
 * with continuous looping animation and manual 3D rotation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { drawVisual } from './renderer.js';

let animFrameId = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let meshGroup = null;

/**
 * Start the asset viewer with 2D and 3D canvases.
 * @param {HTMLCanvasElement} canvas2d - Canvas for 2D rendering
 * @param {HTMLCanvasElement} canvas3d - Canvas for 3D rendering
 * @param {object} entityData - The entity data with .visual property
 */
export function startAssetViewer(canvas2d, canvas3d, entityData) {
  const visual = entityData?.visual;
  if (!visual || !visual.features) return;

  // ── 2D Setup ──
  const ctx = canvas2d.getContext('2d');
  const cw = canvas2d.width;
  const ch = canvas2d.height;

  // ── 3D Setup ──
  const w3d = canvas3d.clientWidth || 300;
  const h3d = canvas3d.clientHeight || 300;

  renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
  renderer.setSize(w3d, h3d);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a3a);

  camera = new THREE.PerspectiveCamera(50, w3d / h3d, 0.1, 100);
  camera.position.set(0, 2, 5);

  // Lights
  scene.add(new THREE.HemisphereLight(0xaabbdd, 0x444466, 0.8));
  scene.add(new THREE.AmbientLight(0x667799, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.4);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);
  const rimLight = new THREE.DirectionalLight(0x6699ff, 0.5);
  rimLight.position.set(-5, 3, -5);
  scene.add(rimLight);

  // Build 3D mesh from visual data
  meshGroup = build3DMesh(visual);
  scene.add(meshGroup);

  // Auto-fit camera to model size
  const bbox = new THREE.Box3().setFromObject(meshGroup);
  const bsize = bbox.getSize(new THREE.Vector3());
  const bcenter = bbox.getCenter(new THREE.Vector3());
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
  const fovRad = camera.fov * (Math.PI / 180);
  const camDist = (maxDim / (2 * Math.tan(fovRad / 2))) + 2.5;
  camera.position.set(0, bcenter.y, Math.max(camDist, 4));

  // Ground plane sized to model
  const groundGeo = new THREE.CircleGeometry(Math.max(maxDim * 1.2, 3), 32);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a4e, roughness: 0.9, metalness: 0.1,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = bbox.min.y - 0.01;
  scene.add(ground);

  // OrbitControls for manual rotation
  controls = new OrbitControls(camera, canvas3d);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.0;
  controls.target.set(0, bcenter.y, 0);
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 15;
  controls.update();

  // ── Animation Loop ──
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const t = Date.now() * 0.001;

    // ── 2D: draw with looping animation ──
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#1a1a3a';
    ctx.fillRect(0, 0, cw, ch);

    // Calculate scale to fit visual in canvas with padding
    const pad = 40;
    const scaleX = (cw - pad * 2) / (visual.width || 50);
    const scaleY = (ch - pad * 2) / (visual.height || 45);
    const scale = Math.min(scaleX, scaleY, 5); // Cap at 5x

    const vw = (visual.width || 50) * scale;
    const vh = (visual.height || 45) * scale;

    // Bobbing animation
    const bob = Math.sin(t * 2) * 6;
    // Gentle pulse
    const pulse = 1 + Math.sin(t * 3) * 0.02;

    const x = (cw - vw * pulse) / 2;
    const y = (ch - vh * pulse) / 2 + bob;

    // Glow behind entity
    const glowRadius = Math.max(vw, vh) * 0.5;
    const glowAlpha = 0.15 + Math.sin(t * 2.5) * 0.05;
    ctx.save();
    const glow = ctx.createRadialGradient(
      cw / 2, ch / 2 + bob, 0,
      cw / 2, ch / 2 + bob, glowRadius,
    );
    glow.addColorStop(0, `rgba(255, 215, 0, ${glowAlpha})`);
    glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2 + bob, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw the visual
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * pulse, scale * pulse);
    drawVisual(ctx, visual, 0, 0);
    ctx.restore();

    // ── 3D: animate ──
    if (meshGroup) {
      meshGroup.position.y = Math.sin(t * 2) * 0.15;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

/**
 * Categorize features by body part label for semantic 3D positioning.
 */
function categorizeFeatures(features) {
  const parts = {
    head: null, mane: null, nose: null, mouth: null,
    eyes: [], pupils: [], ears: [], legs: [], tail: [], wings: [], other: [],
  };
  for (const f of features) {
    const l = (f.label || '').toLowerCase();
    if (l.includes('pupil')) parts.pupils.push(f);
    else if (l.includes('eye')) parts.eyes.push(f);
    else if (l.includes('head') || l.includes('face')) parts.head = f;
    else if (l.includes('mane')) parts.mane = f;
    else if (l.includes('nose') || l.includes('snout') || l.includes('beak')) parts.nose = f;
    else if (l.includes('mouth') || l.includes('jaw')) parts.mouth = f;
    else if (l.includes('ear') || l.includes('horn') || l.includes('antenna')) parts.ears.push(f);
    else if (l.includes('leg') || l.includes('foot') || l.includes('paw') || l.includes('tentacle')) parts.legs.push(f);
    else if (l.includes('tail')) parts.tail.push(f);
    else if (l.includes('wing') || l.includes('fin')) parts.wings.push(f);
    else parts.other.push(f);
  }
  return parts;
}

/**
 * Build a 3D mesh group from a 2D visual description.
 * Uses semantic label-based positioning for recognized body parts,
 * with coordinate-based fallback for unrecognized features.
 */
function build3DMesh(visual) {
  const group = new THREE.Group();
  const primaryColor = parseColor(visual.color_primary, 0xcc3333);

  const vw = visual.width || 50;
  const vh = visual.height || 45;
  const baseW = vw / 25;
  const baseH = vh / 25;
  const baseD = Math.max(baseW, baseH) * 0.7;
  const scaleU = baseW / vw;

  // === BODY ===
  let bodyGeo;
  switch (visual.base_shape) {
    case 'circle':
      bodyGeo = new THREE.SphereGeometry(baseW * 0.5, 16, 16);
      break;
    case 'triangle':
      bodyGeo = new THREE.ConeGeometry(baseW * 0.5, baseH, 3);
      break;
    default:
      bodyGeo = new THREE.BoxGeometry(baseW, baseH, baseD);
  }
  const bodyMat = new THREE.MeshStandardMaterial({
    color: primaryColor, roughness: 0.5, metalness: 0.3,
    emissive: primaryColor, emissiveIntensity: 0.15,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = baseH * 0.5;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Reference points
  const bodyTopY = baseH;
  const bodyCenterY = baseH * 0.5;
  const bodyFrontZ = baseD * 0.5;
  const bodyBackZ = -baseD * 0.5;

  // Categorize features by body part
  const parts = categorizeFeatures(visual.features || []);

  // === HEAD (capped to stay proportional to body) ===
  const headRaw = parts.head ? (parts.head.radius || 12) * scaleU : baseW * 0.22;
  const headR = Math.min(headRaw, baseW * 0.28);
  const headY = bodyTopY - headR * 0.1;
  const headZ = bodyFrontZ + headR * 0.7;

  if (parts.head) {
    const hm = new THREE.Mesh(
      new THREE.SphereGeometry(headR, 14, 14),
      new THREE.MeshStandardMaterial({
        color: parseColor(parts.head.color, primaryColor), roughness: 0.5, metalness: 0.2,
      }),
    );
    hm.position.set(0, headY, headZ);
    hm.castShadow = true;
    group.add(hm);
  }

  // === MANE (slightly larger than head, not raw 2D radius) ===
  if (parts.mane) {
    const mr = Math.min((parts.mane.radius || 20) * scaleU, headR * 1.3);
    const mm = new THREE.Mesh(
      new THREE.SphereGeometry(mr, 12, 12),
      new THREE.MeshStandardMaterial({
        color: parseColor(parts.mane.color, primaryColor), roughness: 0.6, metalness: 0.15,
      }),
    );
    mm.position.set(0, headY, headZ - headR * 0.3);
    mm.castShadow = true;
    group.add(mm);
  }

  // === EYES (minimum size relative to head so they're visible) ===
  const eyeSpread = headR * 0.5;
  const eyeY = headY + headR * 0.15;
  const eyeZ = headZ + headR * 0.88;

  for (const eye of parts.eyes) {
    const er = Math.max((eye.radius || 3) * scaleU, headR * 0.15);
    const em = new THREE.Mesh(
      new THREE.SphereGeometry(er, 8, 8),
      new THREE.MeshStandardMaterial({
        color: parseColor(eye.color, 0xffffff), roughness: 0.3, metalness: 0.1,
      }),
    );
    const side = (eye.label || '').includes('right') ? 1 : -1;
    em.position.set(side * eyeSpread, eyeY, eyeZ);
    group.add(em);
  }

  // === PUPILS (minimum size relative to head) ===
  for (const pupil of parts.pupils) {
    const pr = Math.max((pupil.radius || 1.5) * scaleU, headR * 0.08);
    const pm = new THREE.Mesh(
      new THREE.SphereGeometry(pr, 8, 8),
      new THREE.MeshStandardMaterial({
        color: parseColor(pupil.color, 0x111111), roughness: 0.3, metalness: 0.1,
      }),
    );
    const side = (pupil.label || '').includes('right') ? 1 : -1;
    pm.position.set(side * eyeSpread, eyeY, eyeZ + pr);
    group.add(pm);
  }

  // === NOSE (minimum size so it's visible) ===
  if (parts.nose) {
    const nr = Math.max((parts.nose.radius || 3) * scaleU, headR * 0.12);
    const nm = new THREE.Mesh(
      new THREE.SphereGeometry(nr, 8, 8),
      new THREE.MeshStandardMaterial({
        color: parseColor(parts.nose.color, 0x333333), roughness: 0.5, metalness: 0.1,
      }),
    );
    nm.position.set(0, headY - headR * 0.3, eyeZ);
    group.add(nm);
  }

  // === EARS (larger cones so they're visible) ===
  for (const ear of parts.ears) {
    const side = (ear.label || '').includes('right') ? 1 : -1;
    const eg = new THREE.ConeGeometry(headR * 0.3, headR * 0.7, 4);
    const em = new THREE.Mesh(eg, new THREE.MeshStandardMaterial({
      color: parseColor(ear.color, primaryColor), roughness: 0.5, metalness: 0.2,
    }));
    em.position.set(side * headR * 0.6, headY + headR * 0.9, headZ);
    em.castShadow = true;
    group.add(em);
  }

  // === LEGS (cylinders at body corners) ===
  if (parts.legs.length > 0) {
    const slots = [
      { x: -baseW * 0.3, z: baseD * 0.25 },
      { x: baseW * 0.3, z: baseD * 0.25 },
      { x: -baseW * 0.3, z: -baseD * 0.25 },
      { x: baseW * 0.3, z: -baseD * 0.25 },
    ];
    for (let i = 0; i < Math.min(parts.legs.length, slots.length); i++) {
      const leg = parts.legs[i];
      const lh = (leg.height || 15) * scaleU;
      const lr = (leg.width || 8) * scaleU * 0.35;
      const lg = new THREE.CylinderGeometry(lr, lr * 0.85, lh, 8);
      const lm = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({
        color: parseColor(leg.color, primaryColor), roughness: 0.5, metalness: 0.2,
      }));
      lm.position.set(slots[i].x, -lh * 0.5, slots[i].z);
      lm.castShadow = true;
      group.add(lm);
    }
  }

  // === TAIL ===
  for (const tail of parts.tail) {
    const tc = parseColor(tail.color, primaryColor);
    if (tail.type === 'line') {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, bodyCenterY, bodyBackZ),
        new THREE.Vector3(0, bodyCenterY + baseH * 0.4, bodyBackZ - baseW * 0.2),
        new THREE.Vector3(0, bodyCenterY + baseH * 0.6, bodyBackZ - baseW * 0.4),
      );
      group.add(new THREE.Mesh(
        new THREE.TubeGeometry(curve, 10, baseW * 0.03, 6, false),
        new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.2 }),
      ));
    } else if (tail.type === 'circle') {
      const tr = (tail.radius || 5) * scaleU;
      const tm = new THREE.Mesh(
        new THREE.SphereGeometry(tr, 8, 8),
        new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.2 }),
      );
      tm.position.set(0, bodyCenterY + baseH * 0.3, bodyBackZ - baseW * 0.35);
      group.add(tm);
    }
  }

  // === WINGS ===
  for (const wing of parts.wings) {
    const wc = parseColor(wing.color, primaryColor);
    const side = (wing.label || '').includes('right') ? 1 : -1;
    const ww = (wing.type === 'circle' ? (wing.radius || 15) * 2 : (wing.width || 20)) * scaleU;
    const wh = (wing.type === 'circle' ? (wing.radius || 15) * 2 : (wing.height || 15)) * scaleU;
    const wm = new THREE.Mesh(
      new THREE.BoxGeometry(ww, wh, 0.05),
      new THREE.MeshStandardMaterial({ color: wc, roughness: 0.5, metalness: 0.2 }),
    );
    wm.position.set(side * (baseW * 0.5 + ww * 0.4), bodyCenterY + baseH * 0.15, 0);
    wm.rotation.z = side * -0.3;
    wm.castShadow = true;
    group.add(wm);
  }

  // === UNCATEGORIZED features → coordinate fallback ===
  for (const feature of parts.other) {
    const mesh = buildFeature3D(feature, visual, baseW, baseH, baseD, 0);
    if (mesh) {
      mesh.position.y += baseH;
      group.add(mesh);
    }
  }

  // Eye glow
  const accentColor = parseColor(visual.color_accent, primaryColor);
  const eyeLight = new THREE.PointLight(accentColor, 0.5, 5);
  eyeLight.position.set(0, headY, headZ);
  group.add(eyeLight);

  return group;
}

/**
 * Determine z-position for a feature based on its label.
 * Spreads features in depth instead of piling everything on the front face.
 */
function getFeatureZ(label, feature, vw, baseD, headRadius3D) {
  const l = label.toLowerCase();

  // Tail goes behind the body
  if (l.includes('tail')) return -baseD * 0.4;

  // Wings sit at the sides/back
  if (l.includes('wing')) return -baseD * 0.15;

  // Legs: use x position to determine front vs back
  if (l.includes('leg') || l.includes('foot') || l.includes('paw')) {
    const fx = feature.x || 0;
    const midX = vw / 2;
    if (l.includes('front') || l.includes('fore')) return baseD * 0.2;
    if (l.includes('back') || l.includes('hind') || l.includes('rear')) return -baseD * 0.2;
    // Infer from x position: left side of 2D = front in 3D
    return fx < midX ? baseD * 0.2 : -baseD * 0.2;
  }

  // Face features: position on the surface of the head sphere
  const headZ = baseD * 0.45;
  const surfaceZ = headRadius3D > 0 ? headZ + headRadius3D * 0.85 : baseD * 0.6;
  if (l.includes('pupil')) return surfaceZ + 0.05;
  if (l.includes('eye')) return surfaceZ;
  if (l.includes('nose') || l.includes('mouth') || l.includes('beak') || l.includes('snout')) return surfaceZ;

  // Head: at the front
  if (l.includes('head') || l.includes('face')) return headZ;

  // Mane wraps around head
  if (l.includes('mane')) return baseD * 0.35;

  // Ears, horns: slightly forward
  if (l.includes('ear') || l.includes('horn') || l.includes('antenna')) return baseD * 0.35;

  // Shell, armor: at the back
  if (l.includes('shell') || l.includes('armor') || l.includes('back')) return -baseD * 0.3;

  // Default: front face
  return baseD * 0.4;
}

function buildFeature3D(feature, visual, baseW, baseH, baseD, headRadius3D) {
  const color = parseColor(feature.color, 0x888888);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.2,
  });

  const vw = visual.width || 50;
  const vh = visual.height || 45;
  const scaleX = baseW / vw;
  const scaleY = baseH / vh;
  const halfW = vw / 2;
  const label = (feature.label || '').toLowerCase();
  const zPos = getFeatureZ(label, feature, vw, baseD, headRadius3D || 0);

  switch (feature.type) {
    case 'circle': {
      const r = (feature.radius || 5) * scaleX;
      const geo = new THREE.SphereGeometry(r, 10, 10);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        ((feature.x || 0) - halfW) * scaleX,
        ((feature.y || 0)) * -scaleY,
        zPos,
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
        ((feature.x || 0) + (feature.width || 10) / 2 - halfW) * scaleX,
        ((feature.y || 0) + (feature.height || 10) / 2) * -scaleY,
        zPos,
      );
      mesh.castShadow = true;
      return mesh;
    }
    case 'triangle':
    case 'polygon': {
      if (feature.points && feature.points.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(
          (feature.points[0][0] - halfW) * scaleX,
          feature.points[0][1] * -scaleY,
        );
        for (let i = 1; i < feature.points.length; i++) {
          shape.lineTo(
            (feature.points[i][0] - halfW) * scaleX,
            feature.points[i][1] * -scaleY,
          );
        }
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.z = zPos;
        mesh.castShadow = true;
        return mesh;
      }
      return null;
    }
    case 'line': {
      const points = [
        new THREE.Vector3(((feature.x1 || 0) - halfW) * scaleX, (feature.y1 || 0) * -scaleY, zPos),
        new THREE.Vector3(((feature.x2 || 20) - halfW) * scaleX, (feature.y2 || 20) * -scaleY, zPos),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
      return new THREE.Line(lineGeo, lineMat);
    }
    case 'arc': {
      const r = (feature.radius || 10) * scaleX;
      const curve = new THREE.EllipseCurve(
        ((feature.x || 0) - halfW) * scaleX,
        (feature.y || 0) * -scaleY,
        r, r,
        feature.startAngle || 0,
        feature.endAngle || Math.PI,
        false, 0,
      );
      const arcPoints = curve.getPoints(20);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(
        arcPoints.map(p => new THREE.Vector3(p.x, p.y, zPos)),
      );
      const arcMat = new THREE.LineBasicMaterial({ color });
      return new THREE.Line(arcGeo, arcMat);
    }
    default:
      return null;
  }
}

/**
 * Stop the asset viewer and clean up all resources.
 */
export function stopAssetViewer() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (controls) {
    controls.dispose();
    controls = null;
  }
  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
    scene = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  camera = null;
  meshGroup = null;
}

function parseColor(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'number') return str;
  if (str.startsWith('#')) return parseInt(str.replace('#', ''), 16);
  return fallback;
}
