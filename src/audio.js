/**
 * Audio — retro sound effects via Web Audio API.
 * No audio files needed; everything is synthesized.
 */

let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

/** Ensure AudioContext is resumed (must be called from user gesture). */
export function resumeAudio() {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
}

// ── Helpers ──

function playTone(freq, duration, type = 'square', volume = 0.15) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

function playNoise(duration, volume = 0.1) {
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  source.connect(gain);
  gain.connect(c.destination);
  source.start(c.currentTime);
}

// ── Sound effects ──

export function sfxJump() {
  playTone(300, 0.1, 'square', 0.12);
  playTone(500, 0.1, 'square', 0.1);
}

export function sfxAttack() {
  playNoise(0.08, 0.15);
  playTone(200, 0.06, 'sawtooth', 0.1);
}

export function sfxHitDeal() {
  playTone(600, 0.08, 'square', 0.15);
  playTone(800, 0.06, 'square', 0.1);
}

export function sfxHitTake() {
  playTone(300, 0.15, 'sawtooth', 0.15);
  playTone(150, 0.2, 'sawtooth', 0.1);
}

export function sfxDeath() {
  const c = getCtx();
  const notes = [400, 350, 300, 200, 100];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, c.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.1 + 0.15);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + i * 0.1);
    osc.stop(c.currentTime + i * 0.1 + 0.15);
  });
  // Small explosion
  setTimeout(() => playNoise(0.25, 0.12), notes.length * 100);
}

export function sfxItemUse() {
  const c = getCtx();
  const notes = [250, 400, 600, 900];
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, c.currentTime + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.08 + 0.12);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + i * 0.08);
    osc.stop(c.currentTime + i * 0.08 + 0.12);
  });
}

export function sfxVictory() {
  const c = getCtx();
  const notes = [523, 659, 784, 1047, 784]; // C5 E5 G5 C6 G5
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.1, c.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.15 + 0.2);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + i * 0.15);
    osc.stop(c.currentTime + i * 0.15 + 0.2);
  });
}

export function sfxMenuSelect() {
  playTone(800, 0.05, 'square', 0.08);
}
