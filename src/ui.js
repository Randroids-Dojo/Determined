/**
 * UI — menu screens, word entry, loading screen, victory, leaderboard display.
 * All rendered on the main canvas or as HTML overlays.
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

export function showMainMenu(onPlay, onLeaderboard) {
  clearOverlay();
  showOverlay();
  overlayEl.innerHTML = `
    <div class="menu-screen">
      <h1 class="game-title">DETERMINED</h1>
      <p class="tagline">"Your words. Your chaos. Your problem."</p>
      <div class="menu-buttons">
        <button id="btn-play" class="btn btn-primary">PLAY</button>
        <button id="btn-leaderboard" class="btn btn-secondary">LEADERBOARD</button>
      </div>
    </div>
  `;
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
          <input type="text" id="word1" maxlength="${WORD_MAX_LENGTH}" placeholder="e.g. Lion" autocomplete="off" />
        </label>
        <label>
          <span class="word-label">Enter a weapon</span>
          <input type="text" id="word2" maxlength="${WORD_MAX_LENGTH}" placeholder="e.g. Sword" autocomplete="off" />
        </label>
        <label>
          <span class="word-label">Enter a weather or force of nature</span>
          <input type="text" id="word3" maxlength="${WORD_MAX_LENGTH}" placeholder="e.g. Lightning" autocomplete="off" />
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

export function showVictoryScreen(deaths, elapsedMs, words, onSubmitScore, onPlayAgain) {
  clearOverlay();
  showOverlay();
  const secs = Math.floor(elapsedMs / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;

  overlayEl.innerHTML = `
    <div class="victory-screen">
      <h2>VICTORY!</h2>
      <p class="victory-stats">
        Deaths: <strong>${deaths}</strong> &nbsp;|&nbsp;
        Time: <strong>${mins}:${String(s).padStart(2, '0')}</strong>
      </p>
      <p class="victory-words">
        ${words.creature} vs ${words.weapon} + ${words.environment}
      </p>
      <div class="initials-entry">
        <label>Enter your initials:
          <input type="text" id="initials" maxlength="3" placeholder="AAA" autocomplete="off" />
        </label>
        <button id="btn-submit-score" class="btn btn-primary">SUBMIT</button>
      </div>
      <button id="btn-play-again" class="btn btn-secondary">PLAY AGAIN</button>
    </div>
  `;

  const initialsInput = document.getElementById('initials');
  document.getElementById('btn-submit-score').addEventListener('click', () => {
    const initials = initialsInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (initials.length < 1) return;
    sfxMenuSelect();
    onSubmitScore(initials);
  });
  document.getElementById('btn-play-again').addEventListener('click', () => {
    sfxMenuSelect();
    onPlayAgain();
  });
  setTimeout(() => initialsInput.focus(), 100);
}

// ── Leaderboard ──

export function showLeaderboard(entries, onBack) {
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
      <button id="btn-lb-back" class="btn btn-secondary">BACK</button>
    </div>
  `;
  document.getElementById('btn-lb-back').addEventListener('click', () => {
    sfxMenuSelect();
    onBack();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
