/**
 * Input handler — keyboard + touch controls.
 * Tracks which actions are currently active each frame.
 * Supports both 2D (Level 1) and 3D (Level 2) control schemes.
 *
 * Level 2 adds a virtual joystick for movement and dedicated 3D action buttons.
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
};

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
  actions.jump = !!(keys['ArrowUp'] || keys['KeyW'] || keys['Space']);
  actions.forward = !!(keys['ArrowUp'] || keys['KeyW']);
  actions.backward = !!(keys['ArrowDown'] || keys['KeyS']);
  actions.attack = !!(keys['KeyJ'] || keys['KeyZ']);
  actions.item = !!(keys['KeyK'] || keys['KeyX']);
  actions.reset = !!keys['KeyR'];
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

// ── Touch controls (Level 2 — virtual joystick + 3D buttons) ──

let touch3dBtns = {};
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

function createTouch3DControls() {
  if (!('ontouchstart' in window)) return;

  joystickZoneEl = document.getElementById('joystick-zone');
  joystickBaseEl = document.getElementById('joystick-base');
  joystickThumbEl = document.getElementById('joystick-thumb');
  if (!joystickZoneEl || !joystickBaseEl || !joystickThumbEl) return;

  // Joystick touch handling
  joystickZoneEl.addEventListener('touchstart', onJoystickStart, { passive: false });
  joystickZoneEl.addEventListener('touchmove', onJoystickMove, { passive: false });
  joystickZoneEl.addEventListener('touchend', onJoystickEnd, { passive: false });
  joystickZoneEl.addEventListener('touchcancel', onJoystickEnd, { passive: false });

  // 3D action buttons
  const container3d = document.getElementById('touch-controls-3d');
  if (!container3d) return;
  const buttons = container3d.querySelectorAll('[data-action3d]');
  buttons.forEach(btn => {
    const action = btn.dataset.action3d;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touch3dBtns[action] = true;
    }, { passive: false });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      touch3dBtns[action] = false;
    }, { passive: false });
    btn.addEventListener('touchcancel', () => {
      touch3dBtns[action] = false;
    });
  });
}

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

function updateActionsFromTouch3D() {
  // Joystick → movement actions
  if (joystickActive) {
    if (joystickX < -JOYSTICK_DEADZONE) actions.left = true;
    if (joystickX > JOYSTICK_DEADZONE) actions.right = true;
    if (joystickY < -JOYSTICK_DEADZONE) actions.forward = true;
    if (joystickY > JOYSTICK_DEADZONE) actions.backward = true;
  }

  // 3D buttons → action flags
  if (touch3dBtns.attack) actions.attack = true;
  if (touch3dBtns.jump) actions.jump = true;
  if (touch3dBtns.item) actions.item = true;
  if (touch3dBtns.reset) actions.reset = true;
}

// ── Level switching ──

let level2Active = false;

/**
 * Show Level 2 touch controls (virtual joystick + 3D buttons).
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

export function pollInput() {
  // Reset actions, then rebuild from current state
  actions.left = false;
  actions.right = false;
  actions.jump = false;
  actions.forward = false;
  actions.backward = false;
  actions.attack = false;
  actions.item = false;
  actions.reset = false;
  updateActionsFromKeys();

  if (level2Active) {
    updateActionsFromTouch3D();
  } else {
    updateActionsFromTouch();
  }

  return actions;
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
