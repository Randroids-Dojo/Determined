/**
 * Scene — Three.js scene setup: renderer, camera, lights, fog, skybox.
 */

import * as THREE from 'three';
import { CANVAS_WIDTH, CANVAS_HEIGHT, L2_CAMERA_DISTANCE, L2_CAMERA_HEIGHT } from '../constants.js';

let renderer = null;
let scene = null;
let camera = null;
let clock = null;

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

  return { renderer, scene, camera, clock };
}

/**
 * Update the camera to follow a target position (the player).
 */
export function updateCamera(camera, targetPos, dt) {
  const idealOffset = new THREE.Vector3(
    targetPos.x * 0.3,
    L2_CAMERA_HEIGHT,
    targetPos.z + L2_CAMERA_DISTANCE,
  );

  // Smooth camera follow
  camera.position.lerp(idealOffset, 3.0 * dt);
  camera.lookAt(targetPos.x * 0.5, 1.0, targetPos.z * 0.5);
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
