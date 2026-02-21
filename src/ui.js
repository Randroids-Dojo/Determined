/**
 * UI — menu screens, word entry, loading screen, victory, leaderboard display.
 * All rendered on the main canvas or as HTML overlays.
 * Includes Level 2 transition screens.
 */

import {
  CANVAS_WIDTH, CANVAS_HEIGHT, WORD_MAX_LENGTH,
  COLOR_TEXT, COLOR_ACCENT, FLAVOR_TEXTS, PROFANITY_LIST,
  STATE_MENU, STATE_WORD_ENTRY, STATE_LOADING, STATE_VICTORY, STATE_LEADERBOARD,
} from './constants.js';
import { sfxMenuSelect, resumeAudio } from './audio.js';

// ── References ──
let overlayEl = null;

export function initUI() {
  overlayEl = document.getElementById('ui-overlay');
}

// ── Helpers ──

function clearOverlay() {
  if (overlayEl) overlayEl.innerHTML = '';
  overlayEl.style.display = 'none';
}

function showOverlay() {
  overlayEl.style.display = 'flex';
}

function sanitizeWord(word) {
  return word.trim().toLowerCase().replace(/[^a-z0-9 '-]/g, '').slice(0, WORD_MAX_LENGTH);
}

function hasProfanity(word) {
  const lower = word.toLowerCase();
  return PROFANITY_LIST.some(p => lower.includes(p));
}

// ── Main Menu ──

export function showMainMenu(onPlay, onLeaderboard, onAssets) {
  clearOverlay();
  showOverlay();
  overlayEl.innerHTML = `
    <div class="menu-screen">
      <h1 class="game-title">DETERMINED</h1>
      <p class="tagline">"Your words. Your chaos. Your problem."</p>
      <div class="menu-buttons">
        <button id="btn-assets" class="btn btn-assets">ASSETS</button>
        <button id="btn-play" class="btn btn-primary">PLAY</button>
        <button id="btn-leaderboard" class="btn btn-secondary">LEADERBOARD</button>
      </div>
    </div>
  `;
  document.getElementById('btn-assets').addEventListener('click', () => {
    sfxMenuSelect();
    onAssets();
  });
  document.getElementById('btn-play').addEventListener('click', () => {
    resumeAudio();
    sfxMenuSelect();
    onPlay();
  });
  document.getElementById('btn-leaderboard').addEventListener('click', () => {
    sfxMenuSelect();
    onLeaderboard();
  });
}

// ── Word Entry ──

export function showWordEntry(onSubmit) {
  clearOverlay();
  showOverlay();
  overlayEl.innerHTML = `
    <div class="word-entry-screen">
      <h2>CHOOSE YOUR FATE</h2>
      <div class="word-inputs">
        <label>
          <span class="word-label">Enter a creature</span>
          <div class="word-input-row">
            <input type="text" id="word1" maxlength="${WORD_MAX_LENGTH}" placeholder="e.g. Lion" autocomplete="off" />
            <button type="button" class="btn-random" data-category="creature" data-target="word1" title="Generate random word">?</button>
          </div>
        </label>
        <label>
          <span class="word-label">Enter a weapon</span>
          <div class="word-input-row">
            <input type="text" id="word2" maxlength="${WORD_MAX_LENGTH}" placeholder="e.g. Sword" autocomplete="off" />
            <button type="button" class="btn-random" data-category="weapon" data-target="word2" title="Generate random word">?</button>
          </div>
        </label>
        <label>
          <span class="word-label">Enter a weather or force of nature</span>
          <div class="word-input-row">
            <input type="text" id="word3" maxlength="${WORD_MAX_LENGTH}" placeholder="e.g. Lightning" autocomplete="off" />
            <button type="button" class="btn-random" data-category="environment" data-target="word3" title="Generate random word">?</button>
          </div>
        </label>
      </div>
      <p id="word-error" class="error-text"></p>
      <button id="btn-submit-words" class="btn btn-primary">LET'S GO</button>
    </div>
  `;

  const inputs = [
    document.getElementById('word1'),
    document.getElementById('word2'),
    document.getElementById('word3'),
  ];
  const errorEl = document.getElementById('word-error');
  const submitBtn = document.getElementById('btn-submit-words');

  // ── Random word buttons ──
  let cachedWords = {};  // Cache unused words from batch API response
  let fetching = false;

  for (const btn of overlayEl.querySelectorAll('.btn-random')) {
    btn.addEventListener('click', async () => {
      const category = btn.dataset.category;
      const input = document.getElementById(btn.dataset.target);

      // Use cached word if available
      if (cachedWords[category]) {
        input.value = cachedWords[category];
        delete cachedWords[category];
        sfxMenuSelect();
        return;
      }

      // Fetch a new batch
      if (fetching) return;
      fetching = true;
      btn.classList.add('loading');

      try {
        const resp = await fetch('/api/random-words');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        // Fill the clicked field, cache the rest
        if (data[category]) {
          input.value = data[category];
        }
        for (const key of ['creature', 'weapon', 'environment']) {
          if (key !== category && data[key]) {
            cachedWords[key] = data[key];
          }
        }
        sfxMenuSelect();
      } catch (err) {
        errorEl.textContent = 'Could not generate word. Try again!';
        console.warn('Random word fetch failed:', err);
      } finally {
        fetching = false;
        btn.classList.remove('loading');
      }
    });
  }

  submitBtn.addEventListener('click', () => {
    const words = inputs.map(inp => sanitizeWord(inp.value));

    // Validate
    if (words.some(w => w.length === 0)) {
      errorEl.textContent = 'All three words are required!';
      return;
    }
    if (words.some(w => hasProfanity(w))) {
      errorEl.textContent = 'Let\'s keep it creative, not offensive.';
      return;
    }

    sfxMenuSelect();
    onSubmit({
      creature: words[0],
      weapon: words[1],
      environment: words[2],
    });
  });

  // Allow Enter key to submit
  inputs.forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitBtn.click();
    });
  });

  // Focus first input
  setTimeout(() => inputs[0].focus(), 100);
}

// ── Loading Screen ──

export function showLoadingScreen() {
  clearOverlay();
  showOverlay();
  const flavor = FLAVOR_TEXTS[Math.floor(Math.random() * FLAVOR_TEXTS.length)];
  overlayEl.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <p class="loading-text">${flavor}</p>
    </div>
  `;
}

// ── Hide overlay (game is running) ──

export function hideUI() {
  clearOverlay();
}

// ── Victory Screen ──

export function showVictoryScreen(deaths, elapsedMs, words, onContinue, onPlayAgain) {
  clearOverlay();
  showOverlay();
  const secs = Math.floor(elapsedMs / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;

  overlayEl.innerHTML = `
    <div class="victory-screen">
      <h2>LEVEL 1 COMPLETE!</h2>
      <p class="victory-stats">
        Deaths: <strong>${deaths}</strong> &nbsp;|&nbsp;
        Time: <strong>${mins}:${String(s).padStart(2, '0')}</strong>
      </p>
      <p class="victory-words">
        ${escapeHtml(words.creature)} vs ${escapeHtml(words.weapon)} + ${escapeHtml(words.environment)}
      </p>
      <button id="btn-continue-l2" class="btn btn-level2">CONTINUE TO LEVEL 2</button>
      <button id="btn-play-again" class="btn btn-secondary">PLAY AGAIN</button>
    </div>
  `;

  document.getElementById('btn-continue-l2').addEventListener('click', () => {
    sfxMenuSelect();
    onContinue();
  });
  document.getElementById('btn-play-again').addEventListener('click', () => {
    sfxMenuSelect();
    onPlayAgain();
  });
}

// ── Leaderboard ──

export function showLeaderboard(entries, onBack, onContinueToLevel2) {
  clearOverlay();
  showOverlay();
  let rows = '';
  if (entries && entries.length > 0) {
    rows = entries.map((e, i) => {
      const secs = Math.floor(e.time);
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      return `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(e.initials)}</td>
        <td>${e.deaths}</td>
        <td>${mins}:${String(s).padStart(2, '0')}</td>
        <td class="words-col">${escapeHtml(e.word_1)} / ${escapeHtml(e.word_2)} / ${escapeHtml(e.word_3)}</td>
      </tr>`;
    }).join('');
  } else {
    rows = '<tr><td colspan="5">No entries yet. Be the first!</td></tr>';
  }

  const continueBtn = onContinueToLevel2
    ? '<button id="btn-lb-continue" class="btn btn-level2">CONTINUE TO LEVEL 2</button>'
    : '';

  overlayEl.innerHTML = `
    <div class="leaderboard-screen">
      <h2>LEADERBOARD</h2>
      <div class="leaderboard-table-wrapper">
        <table class="leaderboard-table">
          <thead>
            <tr><th>#</th><th>Name</th><th>Deaths</th><th>Time</th><th>Words</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="leaderboard-buttons">
        ${continueBtn}
        <button id="btn-lb-back" class="btn btn-secondary">BACK</button>
      </div>
    </div>
  `;

  if (onContinueToLevel2) {
    document.getElementById('btn-lb-continue').addEventListener('click', () => {
      sfxMenuSelect();
      onContinueToLevel2();
    });
  }
  document.getElementById('btn-lb-back').addEventListener('click', () => {
    sfxMenuSelect();
    onBack();
  });
}

// ── Level 2 Intro Screen ──

export function showLevel2Intro(words, onStart) {
  clearOverlay();
  showOverlay();
  overlayEl.innerHTML = `
    <div class="level2-intro-screen">
      <div class="level2-badge">LEVEL 2</div>
      <h2>ENTERING THE ARENA</h2>
      <p class="level2-subtitle">The battle continues... in three dimensions.</p>
      <div class="level2-info">
        <p>Your ${escapeHtml(words?.creature || 'creature')} has evolved.</p>
        <p>Your ${escapeHtml(words?.weapon || 'weapon')} feels different here.</p>
        <p>The ${escapeHtml(words?.environment || 'environment')} surrounds the arena.</p>
      </div>
      <div class="level2-controls-info">
        <p class="controls-header">3D ARENA CONTROLS</p>
        <div class="controls-grid">
          <span class="key">WASD</span> <span>Move (camera-relative)</span>
          <span class="key">Q/E</span> <span>Rotate camera</span>
          <span class="key">SPACE</span> <span>Jump</span>
          <span class="key">J/Z</span> <span>Attack</span>
          <span class="key">K/X</span> <span>Use item</span>
          <span class="key">R</span> <span>Reset</span>
        </div>
        <p class="controls-header" style="margin-top:8px">TOUCH</p>
        <div class="controls-grid">
          <span class="key">Left</span> <span>Joystick to move</span>
          <span class="key">Right</span> <span>Swipe to look around</span>
        </div>
      </div>
      <p class="level2-objective">Reach the flag on the elevated platform to win.</p>
      <button id="btn-start-level2" class="btn btn-level2">ENTER THE ARENA</button>
    </div>
  `;
  document.getElementById('btn-start-level2').addEventListener('click', () => {
    sfxMenuSelect();
    onStart();
  });
}

// ── Level 2 Loading Screen ──

export function showLevel2Loading() {
  clearOverlay();
  showOverlay();
  const flavors = [
    'Constructing the third dimension...',
    'Extruding reality from a flat plane...',
    'Adding depth to your problems. Literally.',
    'Polygons are being recruited...',
    'The arena is assembling itself in 3D space...',
    'Your stick figure is learning perspective...',
    'Upgrading chaos to volumetric chaos...',
    'Adding shadows and regret...',
    'Rendering the unrenderable...',
    'The creature is practicing its 3D entrance...',
    'Inflating 2D pixels into 3D voxels of pain...',
    'Three dimensions of hurt, loading...',
    'The Z-axis was a mistake. Proceeding anyway.',
    'Adding an extra dimension of suffering...',
    'Depth buffer filling with dread...',
  ];
  const flavor = flavors[Math.floor(Math.random() * flavors.length)];
  overlayEl.innerHTML = `
    <div class="loading-screen level2-loading">
      <div class="loading-spinner level2-spinner"></div>
      <p class="level2-loading-badge">LEVEL 2</p>
      <p class="loading-text">${flavor}</p>
    </div>
  `;
}

// ── Level 2 Victory Screen ──

export function showLevel2Victory(totalDeaths, totalTimeMs, words, onSubmitScore, onBack) {
  clearOverlay();
  showOverlay();
  const secs = Math.floor(totalTimeMs / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;

  overlayEl.innerHTML = `
    <div class="level2-victory-screen">
      <div class="level2-badge victory-badge">COMPLETE</div>
      <h2>YOU ARE TRULY DETERMINED</h2>
      <p class="victory-subtitle">Both levels conquered. Both dimensions defeated.</p>
      <div class="final-stats">
        <div class="stat-row">
          <span class="stat-label">Total Deaths</span>
          <span class="stat-value">${totalDeaths}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Time</span>
          <span class="stat-value">${mins}:${String(s).padStart(2, '0')}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Words</span>
          <span class="stat-value">${escapeHtml(words?.creature)} / ${escapeHtml(words?.weapon)} / ${escapeHtml(words?.environment)}</span>
        </div>
      </div>
      <p class="victory-flavor">"Your words shaped reality. Reality fought back. You won anyway."</p>
      <div class="initials-entry">
        <label>Enter your initials:
          <input type="text" id="initials" maxlength="3" placeholder="AAA" autocomplete="off" />
        </label>
        <button id="btn-submit-score" class="btn btn-primary">SUBMIT SCORE</button>
      </div>
      <button id="btn-final-back" class="btn btn-secondary">BACK TO MENU</button>
    </div>
  `;

  const initialsInput = document.getElementById('initials');
  document.getElementById('btn-submit-score').addEventListener('click', () => {
    const initials = initialsInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (initials.length < 1) return;
    sfxMenuSelect();
    onSubmitScore(initials);
  });
  document.getElementById('btn-final-back').addEventListener('click', () => {
    sfxMenuSelect();
    onBack();
  });
  setTimeout(() => initialsInput.focus(), 100);
}

// ── Assets Screen ──

export function showAssetsScreen(assetList, onSelectAsset, onBack) {
  clearOverlay();
  showOverlay();

  let listHtml = '';
  if (assetList.length === 0) {
    listHtml = '<p class="assets-empty">No assets yet. Play a game to generate some!</p>';
  } else {
    for (let i = 0; i < assetList.length; i++) {
      const item = assetList[i];
      listHtml += `
        <button class="asset-item" data-index="${i}">
          <span class="asset-type-badge asset-type-${item.type}">${item.type.toUpperCase()}</span>
          <span class="asset-word">${escapeHtml(item.word)}</span>
          <span class="asset-name">${escapeHtml(item.entityData?.name || '')}</span>
        </button>
      `;
    }
  }

  overlayEl.innerHTML = `
    <div class="assets-screen">
      <h2>ASSETS</h2>
      <p class="assets-subtitle">Your generated creations</p>
      <div class="assets-list">
        ${listHtml}
      </div>
      <button id="btn-assets-back" class="btn btn-secondary">BACK</button>
    </div>
  `;

  for (const btn of overlayEl.querySelectorAll('.asset-item')) {
    btn.addEventListener('click', () => {
      sfxMenuSelect();
      onSelectAsset(assetList[parseInt(btn.dataset.index)]);
    });
  }

  document.getElementById('btn-assets-back').addEventListener('click', () => {
    sfxMenuSelect();
    onBack();
  });
}

// ── Asset Detail Screen ──

/**
 * Show the asset detail view with 2D and 3D canvases side by side.
 * Returns the canvas elements so the caller can start the viewer.
 */
export function showAssetDetail(assetItem, onBack) {
  clearOverlay();
  showOverlay();

  overlayEl.innerHTML = `
    <div class="asset-detail-screen">
      <div class="asset-detail-header">
        <button id="btn-detail-back" class="btn btn-secondary btn-back">BACK</button>
        <div class="asset-detail-info">
          <span class="asset-type-badge asset-type-${assetItem.type}">${assetItem.type.toUpperCase()}</span>
          <h3>${escapeHtml(assetItem.entityData?.name || assetItem.word)}</h3>
          <p class="asset-description">${escapeHtml(assetItem.entityData?.description || '')}</p>
        </div>
      </div>
      <div class="asset-viewers">
        <div class="asset-viewer-panel">
          <p class="viewer-label">2D</p>
          <canvas id="asset-canvas-2d" width="300" height="300"></canvas>
        </div>
        <div class="asset-viewer-panel">
          <p class="viewer-label">3D</p>
          <canvas id="asset-canvas-3d" width="300" height="300"></canvas>
          <p class="viewer-hint">Drag to rotate</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-detail-back').addEventListener('click', () => {
    sfxMenuSelect();
    onBack();
  });

  return {
    canvas2d: document.getElementById('asset-canvas-2d'),
    canvas3d: document.getElementById('asset-canvas-3d'),
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
