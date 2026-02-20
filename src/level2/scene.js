/**
 * Scene — Three.js scene setup: renderer, camera, lights, fog.
 * Supports orbital camera that can be rotated by touch/mouse/keyboard.
 */

import * as THREE from 'three';
import { CANVAS_WIDTH, CANVAS_HEIGHT, L2_CAMERA_DISTANCE, L2_CAMERA_HEIGHT } from '../constants.js';

let renderer = null;
let scene = null;
let camera = null;
let clock = null;

// Camera orbit state
let cameraYaw = 0;        // Horizontal orbit angle (radians)
let cameraPitch = 0.55;    // Vertical orbit angle (radians), 0 = level, PI/2 = top-down
const CAMERA_PITCH_MIN = 0.15;
const CAMERA_PITCH_MAX = 1.25;
const CAMERA_SENSITIVITY = 0.004;  // Radians per pixel of touch/mouse drag

export function createScene(canvas3d) {
  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
  renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x1a1a2e, 0.015);

  // Camera
  camera = new THREE.PerspectiveCamera(60, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 200);
  camera.position.set(0, L2_CAMERA_HEIGHT, L2_CAMERA_DISTANCE);
  camera.lookAt(0, 1, 0);

  // Lights
  const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 60;
  dirLight.shadow.camera.left = -35;
  dirLight.shadow.camera.right = 35;
  dirLight.shadow.camera.top = 35;
  dirLight.shadow.camera.bottom = -35;
  scene.add(dirLight);

  // Rim light for dramatic effect
  const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4);
  rimLight.position.set(-10, 5, -10);
  scene.add(rimLight);

  // Point light for arena glow
  const arenaGlow = new THREE.PointLight(0xffd700, 0.5, 50);
  arenaGlow.position.set(0, 3, 0);
  scene.add(arenaGlow);

  // Clock
  clock = new THREE.Clock();

  // Reset orbit
  cameraYaw = 0;
  cameraPitch = 0.55;

  return { renderer, scene, camera, clock };
}

/**
 * Apply camera input (from touch swipe or mouse drag).
 * @param {number} dx — horizontal pixel delta (positive = swipe right = rotate right)
 * @param {number} dy — vertical pixel delta (positive = swipe down = look up)
 */
export function applyCameraInput(dx, dy) {
  cameraYaw -= dx * CAMERA_SENSITIVITY;
  cameraPitch += dy * CAMERA_SENSITIVITY;
  cameraPitch = Math.max(CAMERA_PITCH_MIN, Math.min(CAMERA_PITCH_MAX, cameraPitch));
}

/**
 * Rotate camera yaw by a fixed amount (for keyboard Q/E).
 */
export function rotateCameraYaw(amount) {
  cameraYaw += amount;
}

/**
 * Get the current camera yaw for camera-relative player movement.
 */
export function getCameraYaw() {
  return cameraYaw;
}

/**
 * Update the camera to orbit around and follow the player.
 */
export function updateCamera(cam, targetPos, dt) {
  // Spherical offset from player
  const dist = L2_CAMERA_DISTANCE;
  const height = dist * Math.sin(cameraPitch);
  const horizontalDist = dist * Math.cos(cameraPitch);

  const idealX = targetPos.x + Math.sin(cameraYaw) * horizontalDist;
  const idealY = targetPos.y + height;
  const idealZ = targetPos.z + Math.cos(cameraYaw) * horizontalDist;

  // Smooth follow
  cam.position.lerp(new THREE.Vector3(idealX, idealY, idealZ), 5.0 * dt);

  // Look at a point slightly above the player
  const lookTarget = new THREE.Vector3(targetPos.x, targetPos.y + 1.0, targetPos.z);
  cam.lookAt(lookTarget);
}

/**
 * Reset camera orbit to default.
 */
export function resetCameraOrbit() {
  cameraYaw = 0;
  cameraPitch = 0.55;
}

export function renderScene() {
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

export function disposeScene() {
  if (renderer) {
    renderer.dispose();
  }
  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    scene.clear();
  }
  renderer = null;
  scene = null;
  camera = null;
  clock = null;
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getClock() { return clock; }
export function getRenderer() { return renderer; }
