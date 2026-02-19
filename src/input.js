/**
 * Input handler — keyboard + touch controls.
 * Tracks which actions are currently active each frame.
 */

const keys = {};
const actions = {
  left: false,
  right: false,
  jump: false,
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
  actions.attack = !!(keys['KeyJ'] || keys['KeyZ']);
  actions.item = !!(keys['KeyK'] || keys['KeyX']);
  actions.reset = !!keys['KeyR'];
}

// ── Touch controls ──

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
  if (touchBtns.jump) actions.jump = true;
  if (touchBtns.attack) actions.attack = true;
  if (touchBtns.item) actions.item = true;
  if (touchBtns.reset) actions.reset = true;
}

// ── Public API ──

export function initInput() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  createTouchControls();
}

export function pollInput() {
  // Reset actions, then rebuild from current state
  actions.left = false;
  actions.right = false;
  actions.jump = false;
  actions.attack = false;
  actions.item = false;
  actions.reset = false;
  updateActionsFromKeys();
  updateActionsFromTouch();
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
