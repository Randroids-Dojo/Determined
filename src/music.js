/**
 * Music — procedural background music via Web Audio API.
 * Each level has a unique style; word hash influences key, scale, and tempo.
 */

let musicCtx = null;
let masterGain = null;
let isPlaying = false;
let schedulerHandle = null;
let seqStep = 0;
let seqNextTime = 0;
let seqConfig = null;

const LOOKAHEAD = 0.12;        // seconds to look ahead when scheduling
const SCHEDULE_INTERVAL = 50;  // ms between scheduler ticks
const _ = null;                // rest shorthand for pattern arrays

// ── Scales (semitone intervals from root) ──
const SCALES = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
};

// ── Patterns: 16 steps (1 bar of 16th notes), integers = scale degree index, null = rest ──

// Level 1: Platformer — bouncy chiptune
const L1_BASS = [
  [0,_,_,_, 4,_,_,_, 5,_,_,_, 4,_,_,_],   // I–V–vi–V
  [0,_,_,4, 0,_,5,_, 3,_,_,4, 3,_,_,_],   // syncopated rhythm
  [0,_,_,_, 0,_,4,_, 5,_,_,_, 5,_,4,_],   // driving eighths
];
const L1_MELODY = [
  [2,_,3,_, 4,_,3,_, 2,_,0,_, 4,_,_,_],   // stepwise, playful
  [4,_,_,_, 6,4,_,_, 2,_,4,_, 6,_,_,_],   // leaping, adventurous
  [0,_,2,4, 2,_,0,_, 4,_,6,_, 4,_,2,_],   // running scale
];
const L1_ARP = [0,2,4,2, 0,2,4,6, 4,2,0,2, 4,6,4,2]; // triangle bubbles, always loops

// Level 2: Arena — driving battle music
const L2_BASS = [
  [0,_,_,_, _,0,_,_, 4,_,_,_, _,4,_,_],   // syncopated power
  [0,_,0,_, 4,_,4,_, 3,_,3,_, 4,_,_,_],   // relentless eighths
  [0,_,_,_, 0,_,_,3, 4,_,_,_, 3,_,_,_],   // riff feel
];
const L2_MELODY = [
  [6,_,_,_, 4,_,3,_, 2,_,_,_, 4,_,_,_],   // aggressive descend
  [4,_,4,_, _,_,3,_, 2,_,4,_, _,_,_,_],   // battle stabs
  [0,_,2,_, 3,_,4,_, 6,_,_,_, 4,3,_,_],   // war cry ascend
];
const L2_COUNTER = [3,_,_,_, 5,_,_,_, 4,_,_,_, 3,_,_,_]; // background counter-melody

// Level 3: Space — atmospheric synthwave
const L3_BASS = [
  [0,_,_,_, _,_,0,_, _,_,_,_, _,_,0,_],   // ultra-sparse pulse
  [0,_,2,_, 4,_,2,_, 3,_,_,_, 4,_,_,_],   // arpeggiated
  [0,_,_,_, 0,_,_,_, 3,_,_,_, 4,_,_,_],   // minimal anchor
];
const L3_MELODY = [
  [4,_,_,_, _,_,2,_, 0,_,_,_, _,_,4,_],   // floating
  [2,_,4,_, _,6,_,_, 4,_,2,_, 0,_,_,_],   // synthwave glide
  [0,2,4,_, 6,_,4,2, 0,_,_,_, 4,6,_,_],   // arpeggiated sweep
];
const L3_PAD_STEPS = [0, 8]; // steps where 3-note sustain chord fires

// Level 4: Farm — gentle, pastoral
const L4_BASS = [
  [0,_,_,_, _,_,_,_, 4,_,_,_, _,_,_,_],   // minimal, spacious
  [0,_,_,_, 4,_,_,_, 3,_,_,_, 4,_,_,_],   // simple I–V–IV–V
  [0,_,_,_, _,4,_,_, 5,_,_,_, _,4,_,_],   // off-beat lilt
];
const L4_MELODY = [
  [4,_,_,_, 3,_,2,_, 0,_,_,_, 2,_,_,_],   // descending sigh
  [0,_,2,_, 4,_,_,_, 2,_,4,_, 6,_,_,_],   // ascending joy
  [2,_,4,6, 4,_,2,_, 0,_,_,_, 4,_,2,_],   // dancing phrase
];

// ── Audio context ──

function getMusicCtx() {
  if (!musicCtx) {
    musicCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = musicCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(musicCtx.destination);
  }
  return musicCtx;
}

// ── Synthesis helpers ──

function midiFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/** Convert a scale degree index into a frequency. Degrees outside [0, scale.length)
 *  wrap chromatically and shift octave accordingly. */
function scaleDeg(rootMidi, scale, deg, octaveShift = 0) {
  const len = scale.length;
  const normalized = ((deg % len) + len) % len;
  const octBonus = Math.floor(deg / len);
  return midiFreq(rootMidi + scale[normalized] + (octaveShift + octBonus) * 12);
}

function schedNote(freq, startTime, dur, wave, vol) {
  const ctx = getMusicCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(dur * 0.88, 0.015));
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(startTime);
  osc.stop(startTime + dur + 0.02);
}

function schedKick(startTime, vol = 0.18) {
  const ctx = getMusicCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, startTime);
  osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.1);
  gain.gain.setValueAtTime(vol, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(startTime);
  osc.stop(startTime + 0.25);
}

function schedSnare(startTime, vol = 0.12) {
  const ctx = getMusicCtx();
  const bufSize = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 1200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
  src.connect(filt);
  filt.connect(gain);
  gain.connect(masterGain);
  src.start(startTime);
  src.stop(startTime + 0.14);
}

// ── Word → musical parameter derivation ──

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h | 0);
}

function deriveParams(level, words, llmData) {
  const hC = hashStr(words?.creature ?? '');
  const hW = hashStr(words?.weapon ?? '');
  const hE = hashStr(words?.environment ?? '');
  const hAll = hashStr(`${words?.creature ?? ''}${words?.weapon ?? ''}${words?.environment ?? ''}`);

  // Root note: C3(48) D3(50) E3(52) F3(53) G3(55) A3(57) B3(59)
  const roots = [48, 50, 52, 53, 55, 57, 59];
  const rootMidi = roots[hC % 7];

  // Scale options per level — weapon hash selects from three distinct modes
  const scalesByLevel = {
    1: [SCALES.major, SCALES.dorian, SCALES.pentatonic],
    2: [SCALES.minor, SCALES.phrygian, SCALES.dorian],
    3: [SCALES.dorian, SCALES.pentatonic, SCALES.minor],
    4: [SCALES.major, SCALES.pentatonic, SCALES.dorian],
  };
  const scale = scalesByLevel[level][hW % 3];

  // Tempo: environment word shifts BPM within the level's range
  const bpmRanges = { 1: [122, 154], 2: [138, 172], 3: [90, 124], 4: [72, 104] };
  const [lo, hi] = bpmRanges[level];
  const bpm = Math.round(lo + (hE % 100) / 100 * (hi - lo));

  // Pattern variant (0/1/2) — all three words combined
  const variant = hAll % 3;

  // Melody wave timbre: weapon damage_type → oscillator character
  const damageType = llmData?.weapon?.damage_type || '';
  const waveMap = {
    fire: 'sawtooth', electric: 'square', ice: 'sine',
    arcane: 'triangle', holy: 'triangle', dark: 'sawtooth',
  };
  const melodyWave = waveMap[damageType] || (['square', 'sawtooth', 'triangle'][hW % 3]);

  return { rootMidi, scale, bpm, variant, melodyWave };
}

// ── Per-level step renderers ──

function playStepL1(step, time, cfg) {
  const { rootMidi, scale, variant, melodyWave, stepDur } = cfg;
  const qn = stepDur * 4; // quarter note

  const bd = L1_BASS[variant][step];
  if (bd !== null) schedNote(scaleDeg(rootMidi, scale, bd, -1), time, qn * 0.78, 'square', 0.13);

  const md = L1_MELODY[variant][step];
  if (md !== null) schedNote(scaleDeg(rootMidi, scale, md, 1), time, stepDur * 1.85, melodyWave, 0.1);

  // Always-on arp (triangle, two octaves up, very soft)
  const ad = L1_ARP[step];
  schedNote(scaleDeg(rootMidi, scale, ad, 2), time, stepDur * 0.55, 'triangle', 0.045);

  if (step === 0 || step === 8) schedKick(time, 0.11);
}

function playStepL2(step, time, cfg) {
  const { rootMidi, scale, variant, melodyWave, stepDur } = cfg;
  const qn = stepDur * 4;
  const hn = stepDur * 8;

  const bd = L2_BASS[variant][step];
  if (bd !== null) schedNote(scaleDeg(rootMidi, scale, bd, -1), time, qn * 0.68, 'sawtooth', 0.14);

  const md = L2_MELODY[variant][step];
  if (md !== null) schedNote(scaleDeg(rootMidi, scale, md, 1), time, stepDur * 1.8, melodyWave, 0.09);

  const cd = L2_COUNTER[step];
  if (cd !== null) schedNote(scaleDeg(rootMidi, scale, cd, 0), time, hn * 0.88, 'triangle', 0.055);

  if (step === 0 || step === 8) schedKick(time, 0.2);
  if (step === 4 || step === 12) schedSnare(time, 0.14);
}

function playStepL3(step, time, cfg) {
  const { rootMidi, scale, variant, stepDur } = cfg;
  const hn = stepDur * 8;

  // Sine bass (one octave below melody root — audible on all speakers)
  const bd = L3_BASS[variant][step];
  if (bd !== null) schedNote(scaleDeg(rootMidi, scale, bd, -1), time, hn * 0.88, 'sine', 0.2);

  // Detuned dual-saw melody for that spacey shimmer
  const md = L3_MELODY[variant][step];
  if (md !== null) {
    const freq = scaleDeg(rootMidi, scale, md, 1);
    schedNote(freq * 1.004, time, hn * 0.92, 'sawtooth', 0.055);
    schedNote(freq * 0.996, time, hn * 0.92, 'sawtooth', 0.055);
  }

  // Sustained pad chord on designated steps (root + 3rd + 5th of scale)
  if (L3_PAD_STEPS.includes(step)) {
    const padDur = hn * 0.95;
    [0, 2, 4].forEach(d => {
      schedNote(scaleDeg(rootMidi, scale, d, 0), time, padDur, 'sine', 0.038);
    });
  }
}

function playStepL4(step, time, cfg) {
  const { rootMidi, scale, variant, stepDur } = cfg;
  const qn = stepDur * 4;
  const hn = stepDur * 8;

  // Warm sine bass
  const bd = L4_BASS[variant][step];
  if (bd !== null) schedNote(scaleDeg(rootMidi, scale, bd, -1), time, hn * 0.65, 'sine', 0.1);

  // Gentle triangle melody with harmony a 3rd above
  const md = L4_MELODY[variant][step];
  if (md !== null) {
    schedNote(scaleDeg(rootMidi, scale, md, 1), time, qn * 0.82, 'triangle', 0.1);
    schedNote(scaleDeg(rootMidi, scale, md + 2, 1), time, qn * 0.78, 'triangle', 0.055);
  }

  // Soft bell accent on every quarter note
  if (step % 4 === 0) {
    schedNote(scaleDeg(rootMidi, scale, 4, 2), time, stepDur * 2.8, 'sine', 0.036);
  }
}

// ── Sequencer ──

function runScheduler() {
  if (!isPlaying || !seqConfig) return;
  const ctx = getMusicCtx();
  while (seqNextTime < ctx.currentTime + LOOKAHEAD) {
    seqConfig.playStep(seqStep, seqNextTime, seqConfig);
    seqStep = (seqStep + 1) % 16;
    seqNextTime += seqConfig.stepDur;
  }
  schedulerHandle = setTimeout(runScheduler, SCHEDULE_INTERVAL);
}

// ── Public API ──

/**
 * Start background music for a given level.
 * @param {1|2|3|4} level
 * @param {{ creature: string, weapon: string, environment: string }} words
 * @param {object} llmData  — full LLM response (may be null in fallback mode)
 */
export function startLevelMusic(level, words, llmData) {
  stopMusic(0.05); // cut any previous music quickly
  const ctx = getMusicCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const params = deriveParams(level, words, llmData);
  const stepDur = 60 / params.bpm / 4; // 16th note in seconds

  const playStepFns = { 1: playStepL1, 2: playStepL2, 3: playStepL3, 4: playStepL4 };

  seqConfig = { ...params, stepDur, playStep: playStepFns[level] };
  seqStep = 0;
  seqNextTime = ctx.currentTime + 0.05;

  // Fade in
  masterGain.gain.cancelScheduledValues(ctx.currentTime);
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 2.0);

  isPlaying = true;
  runScheduler();
}

/** Fade out and stop all music. */
export function stopMusic(fadeTime = 1.2) {
  isPlaying = false;
  if (schedulerHandle !== null) {
    clearTimeout(schedulerHandle);
    schedulerHandle = null;
  }
  seqConfig = null;
  if (masterGain && musicCtx) {
    const now = musicCtx.currentTime;
    const g = masterGain.gain;
    // cancelAndHoldAtTime holds the current mid-automation value cleanly;
    // cancelScheduledValues would snap back to the last setValueAtTime (potentially 0).
    if (typeof g.cancelAndHoldAtTime === 'function') {
      g.cancelAndHoldAtTime(now);
    } else {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
    }
    g.linearRampToValueAtTime(0, now + Math.max(fadeTime, 0.05));
  }
}
