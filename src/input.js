/**
 * Input handler — keyboard + touch controls.
 * Tracks which actions are currently active each frame.
 *
 * Level 1: Simple touch buttons (left/right/jump/attack/item/reset)
 * Level 2: Dual-stick — left joystick (movement) + right swipe (camera) + action buttons
 */

const keys = {};
const actions = {
  left: false,
  right: false,
  jump: false,
  forward: false,   // Level 2: move forward (into arena)
  backward: false,   // Level 2: move backward
  attack: false,
  item: false,
  reset: false,
  moveX: 0,          // Analog movement -1..1 (left/right)
  moveY: 0,          // Analog movement -1..1 (forward/backward)
};

// Camera input — accumulated pixel deltas each frame
let cameraDeltaX = 0;
let cameraDeltaY = 0;

// ── Keyboard ──

function onKeyDown(e) {
  keys[e.code] = true;
  // Prevent default for game keys to stop page scrolling
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
}

function onKeyUp(e) {
  keys[e.code] = false;
}

function updateActionsFromKeys() {
  actions.left = !!(keys['ArrowLeft'] || keys['KeyA']);
  actions.right = !!(keys['ArrowRight'] || keys['KeyD']);
  // Level 2 (3D): W/Up = move forward, Space = jump only.
  // Level 3 (space shooter): no jumping — Space also fires (mapped to attack below).
  // Level 1 (platformer): W/Up/Space all jump.
  if (level2Active) {
    actions.jump = !!(keys['Space']);
  } else if (level3Active) {
    actions.jump = false;
  } else {
    actions.jump = !!(keys['ArrowUp'] || keys['KeyW'] || keys['Space']);
  }
  actions.forward = !!(keys['ArrowUp'] || keys['KeyW']);
  actions.backward = !!(keys['ArrowDown'] || keys['KeyS']);
  // In Level 3, Space also fires (no jump on a spaceship)
  actions.attack = !!(keys['KeyZ'] || keys['KeyJ'] || (level3Active && keys['Space']));
  actions.item = !!(keys['KeyX']);
  actions.reset = !!keys['KeyR'];

  // Keyboard → analog movement (binary -1/0/+1)
  if (actions.left) actions.moveX = -1;
  if (actions.right) actions.moveX = 1;
  if (actions.forward) actions.moveY = -1;
  if (actions.backward) actions.moveY = 1;
}

// Keyboard camera rotation (Q/E keys)
function updateCameraFromKeys(dt) {
  const rotSpeed = 2.5; // radians per second
  if (keys['KeyQ']) cameraDeltaX -= rotSpeed * dt * (1 / 0.004); // convert to pixel-equivalent
  if (keys['KeyE']) cameraDeltaX += rotSpeed * dt * (1 / 0.004);
}

// ── Touch controls (Level 1 — simple buttons) ──

let touchBtns = {};

function createTouchControls() {
  // Only show on touch devices
  if (!('ontouchstart' in window)) return;

  const container = document.getElementById('touch-controls');
  if (!container) return;
  container.style.display = 'flex';

  const buttons = container.querySelectorAll('[data-action]');
  buttons.forEach(btn => {
    const action = btn.dataset.action;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchBtns[action] = true;
    }, { passive: false });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      touchBtns[action] = false;
    }, { passive: false });
    btn.addEventListener('touchcancel', () => {
      touchBtns[action] = false;
    });
  });
}

function updateActionsFromTouch() {
  if (touchBtns.left) actions.left = true;
  if (touchBtns.right) actions.right = true;
  if (touchBtns.jump) { actions.jump = true; actions.forward = true; }
  if (touchBtns.attack) actions.attack = true;
  if (touchBtns.item) actions.item = true;
  if (touchBtns.reset) actions.reset = true;
}

// ── Touch controls (Level 2 — dual stick + action buttons) ──

// Movement joystick (left side)
let touch3dBtns = {};
let touch3dJustPressed = {};  // Latched presses — survives until consumed
let joystickActive = false;
let joystickX = 0; // -1 to 1
let joystickY = 0; // -1 to 1
let joystickTouchId = null;
let joystickBaseEl = null;
let joystickThumbEl = null;
let joystickZoneEl = null;
let joystickCenterX = 0;
let joystickCenterY = 0;
const JOYSTICK_RADIUS = 50; // pixels — max thumb displacement
const JOYSTICK_DEADZONE = 0.15; // ignore tiny movements

// Camera joystick (right side)
let cameraTouchId = null;
let cameraLastX = 0;
let cameraLastY = 0;
let cameraZoneEl = null;
let camJoystickBaseEl = null;
let camJoystickThumbEl = null;
let camCenterX = 0;
let camCenterY = 0;
const CAM_JOYSTICK_RADIUS = 50;

function createTouch3DControls() {
  if (!('ontouchstart' in window)) return;

  // Movement joystick
  joystickZoneEl = document.getElementById('joystick-zone');
  joystickBaseEl = document.getElementById('joystick-base');
  joystickThumbEl = document.getElementById('joystick-thumb');
  if (joystickZoneEl && joystickBaseEl && joystickThumbEl) {
    joystickZoneEl.addEventListener('touchstart', onJoystickStart, { passive: false });
    joystickZoneEl.addEventListener('touchmove', onJoystickMove, { passive: false });
    joystickZoneEl.addEventListener('touchend', onJoystickEnd, { passive: false });
    joystickZoneEl.addEventListener('touchcancel', onJoystickEnd, { passive: false });
  }

  // Camera joystick zone
  cameraZoneEl = document.getElementById('camera-zone');
  camJoystickBaseEl = document.getElementById('cam-joystick-base');
  camJoystickThumbEl = document.getElementById('cam-joystick-thumb');
  if (cameraZoneEl) {
    cameraZoneEl.addEventListener('touchstart', onCameraStart, { passive: false });
    cameraZoneEl.addEventListener('touchmove', onCameraMove, { passive: false });
    cameraZoneEl.addEventListener('touchend', onCameraEnd, { passive: false });
    cameraZoneEl.addEventListener('touchcancel', onCameraEnd, { passive: false });
  }

  // 3D action buttons
  const container3d = document.getElementById('touch-controls-3d');
  if (!container3d) return;
  const buttons = container3d.querySelectorAll('[data-action3d]');
  buttons.forEach(btn => {
    const action = btn.dataset.action3d;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      touch3dBtns[action] = true;
      touch3dJustPressed[action] = true;  // Latch — survives until next pollInput
    }, { passive: false });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      touch3dBtns[action] = false;
    }, { passive: false });
    btn.addEventListener('touchcancel', (e) => {
      e.stopPropagation();
      touch3dBtns[action] = false;
    });
  });
}

// ── Movement Joystick Handlers ──

function onJoystickStart(e) {
  e.preventDefault();
  if (joystickTouchId !== null) return; // Already tracking a touch

  const touch = e.changedTouches[0];
  joystickTouchId = touch.identifier;

  // Position the joystick base at the touch point
  const rect = joystickZoneEl.getBoundingClientRect();
  const localX = touch.clientX - rect.left;
  const localY = touch.clientY - rect.top;

  joystickCenterX = touch.clientX;
  joystickCenterY = touch.clientY;

  joystickBaseEl.style.left = localX + 'px';
  joystickBaseEl.style.top = localY + 'px';
  joystickBaseEl.style.opacity = '1';

  joystickThumbEl.style.transform = 'translate(-50%, -50%)';
  joystickActive = true;
}

function onJoystickMove(e) {
  e.preventDefault();
  if (joystickTouchId === null) return;

  // Find our tracked touch
  let touch = null;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joystickTouchId) {
      touch = e.changedTouches[i];
      break;
    }
  }
  if (!touch) return;

  let dx = touch.clientX - joystickCenterX;
  let dy = touch.clientY - joystickCenterY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Clamp to radius
  if (dist > JOYSTICK_RADIUS) {
    dx = (dx / dist) * JOYSTICK_RADIUS;
    dy = (dy / dist) * JOYSTICK_RADIUS;
  }

  // Normalize to -1..1
  joystickX = dx / JOYSTICK_RADIUS;
  joystickY = dy / JOYSTICK_RADIUS;

  // Apply deadzone
  if (Math.abs(joystickX) < JOYSTICK_DEADZONE) joystickX = 0;
  if (Math.abs(joystickY) < JOYSTICK_DEADZONE) joystickY = 0;

  // Move thumb visual
  joystickThumbEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function onJoystickEnd(e) {
  e.preventDefault();
  // Check if our tracked touch ended
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joystickTouchId) {
      joystickTouchId = null;
      joystickActive = false;
      joystickX = 0;
      joystickY = 0;
      joystickBaseEl.style.opacity = '0.5';
      joystickThumbEl.style.transform = 'translate(-50%, -50%)';
      return;
    }
  }
}

// ── Camera Swipe Handlers ──

function onCameraStart(e) {
  e.preventDefault();
  if (cameraTouchId !== null) return; // Already tracking

  const touch = e.changedTouches[0];
  cameraTouchId = touch.identifier;
  cameraLastX = touch.clientX;
  cameraLastY = touch.clientY;
  camCenterX = touch.clientX;
  camCenterY = touch.clientY;

  // Show camera joystick at touch point
  if (camJoystickBaseEl && cameraZoneEl) {
    const rect = cameraZoneEl.getBoundingClientRect();
    camJoystickBaseEl.style.left = (touch.clientX - rect.left) + 'px';
    camJoystickBaseEl.style.top = (touch.clientY - rect.top) + 'px';
    camJoystickBaseEl.style.opacity = '1';
  }
  if (camJoystickThumbEl) {
    camJoystickThumbEl.style.transform = 'translate(-50%, -50%)';
  }
}

function onCameraMove(e) {
  e.preventDefault();
  if (cameraTouchId === null) return;

  let touch = null;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === cameraTouchId) {
      touch = e.changedTouches[i];
      break;
    }
  }
  if (!touch) return;

  // Accumulate delta for camera rotation
  cameraDeltaX += touch.clientX - cameraLastX;
  cameraDeltaY += touch.clientY - cameraLastY;
  cameraLastX = touch.clientX;
  cameraLastY = touch.clientY;

  // Update camera joystick thumb visual
  if (camJoystickThumbEl) {
    let dx = touch.clientX - camCenterX;
    let dy = touch.clientY - camCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > CAM_JOYSTICK_RADIUS) {
      dx = (dx / dist) * CAM_JOYSTICK_RADIUS;
      dy = (dy / dist) * CAM_JOYSTICK_RADIUS;
    }
    camJoystickThumbEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

function onCameraEnd(e) {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === cameraTouchId) {
      cameraTouchId = null;
      // Reset camera joystick visual
      if (camJoystickBaseEl) camJoystickBaseEl.style.opacity = '0.5';
      if (camJoystickThumbEl) camJoystickThumbEl.style.transform = 'translate(-50%, -50%)';
      return;
    }
  }
}

// ── Joystick → Actions ──

function updateActionsFromTouch3D() {
  // Joystick → analog movement (proportional to tilt)
  if (joystickActive) {
    actions.moveX = joystickX;  // -1..1, already deadzone-applied
    actions.moveY = joystickY;  // -1..1, already deadzone-applied
    // Also set boolean flags for code that checks them
    if (joystickX < -JOYSTICK_DEADZONE) actions.left = true;
    if (joystickX > JOYSTICK_DEADZONE) actions.right = true;
    if (joystickY < -JOYSTICK_DEADZONE) actions.forward = true;
    if (joystickY > JOYSTICK_DEADZONE) actions.backward = true;
  }

  // 3D buttons → action flags (check both held and latched press)
  if (touch3dBtns.attack || touch3dJustPressed.attack) actions.attack = true;
  if (touch3dBtns.jump || touch3dJustPressed.jump) actions.jump = true;
  if (touch3dBtns.item || touch3dJustPressed.item) actions.item = true;
  if (touch3dBtns.reset || touch3dJustPressed.reset) actions.reset = true;
  // Clear latched presses after consuming
  touch3dJustPressed = {};
}

// ── Level switching ──

let level2Active = false;
let level3Active = false;

/**
 * Show Level 2 touch controls (dual-stick + action buttons).
 * Hides Level 1 touch controls.
 */
export function showTouch3DControls() {
  level2Active = true;
  if (!('ontouchstart' in window)) return;

  const l1 = document.getElementById('touch-controls');
  const l2 = document.getElementById('touch-controls-3d');
  if (l1) l1.style.display = 'none';
  if (l2) l2.style.display = 'flex';
}

/**
 * Show Level 1 touch controls (simple buttons).
 * Hides Level 2 touch controls.
 */
export function showTouchL1Controls() {
  level2Active = false;
  level3Active = false;
  if (!('ontouchstart' in window)) return;

  const l1 = document.getElementById('touch-controls');
  const l2 = document.getElementById('touch-controls-3d');
  if (l1) l1.style.display = 'flex';
  if (l2) l2.style.display = 'none';

  // Reset joystick state
  joystickActive = false;
  joystickX = 0;
  joystickY = 0;
  joystickTouchId = null;
  cameraTouchId = null;
  cameraDeltaX = 0;
  cameraDeltaY = 0;
  touch3dBtns = {};
}

/**
 * Show Level 3 touch controls (same L1 buttons, but Space fires instead of jumping).
 */
export function showTouchL3Controls() {
  level2Active = false;
  level3Active = true;
  if (!('ontouchstart' in window)) return;

  const l1 = document.getElementById('touch-controls');
  const l2 = document.getElementById('touch-controls-3d');
  if (l1) l1.style.display = 'flex';
  if (l2) l2.style.display = 'none';

  joystickActive = false;
  joystickX = 0;
  joystickY = 0;
  joystickTouchId = null;
  cameraTouchId = null;
  cameraDeltaX = 0;
  cameraDeltaY = 0;
  touch3dBtns = {};
}

/**
 * Hide all touch controls (for menus/overlays).
 */
export function hideAllTouchControls() {
  const l1 = document.getElementById('touch-controls');
  const l2 = document.getElementById('touch-controls-3d');
  if (l1) l1.style.display = 'none';
  if (l2) l2.style.display = 'none';
}

// ── Public API ──

export function initInput() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  createTouchControls();
  createTouch3DControls();
}

/**
 * Poll actions and camera input each frame.
 * @param {number} [dt] — delta time for keyboard camera rotation
 */
export function pollInput(dt) {
  // Reset actions, then rebuild from current state
  actions.left = false;
  actions.right = false;
  actions.jump = false;
  actions.forward = false;
  actions.backward = false;
  actions.attack = false;
  actions.item = false;
  actions.reset = false;
  actions.moveX = 0;
  actions.moveY = 0;
  updateActionsFromKeys();

  if (level2Active) {
    updateActionsFromTouch3D();
    if (dt) updateCameraFromKeys(dt);
  } else {
    updateActionsFromTouch();
  }

  return actions;
}

/**
 * Get accumulated camera delta since last call, then reset.
 * Returns { dx, dy } in pixels.
 */
export function consumeCameraInput() {
  const dx = cameraDeltaX;
  const dy = cameraDeltaY;
  cameraDeltaX = 0;
  cameraDeltaY = 0;
  return { dx, dy };
}

export function destroyInput() {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
}

// For one-shot checks (e.g. menus) — was a key *just* pressed this frame?
const prevKeys = {};

export function wasKeyJustPressed(code) {
  const justPressed = keys[code] && !prevKeys[code];
  return justPressed;
}

export function snapshotKeys() {
  Object.assign(prevKeys, keys);
}
