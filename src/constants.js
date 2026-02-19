// ── Screen ──
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 450;

// ── Physics ──
export const GRAVITY = 0.6;
export const GROUND_Y = CANVAS_HEIGHT - 60; // top of ground plane
export const FRICTION = 0.8;

// ── Player ──
export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 3;
export const PLAYER_JUMP_FORCE = -12; // negative = upward
export const PLAYER_WIDTH = 20;
export const PLAYER_HEIGHT = 40;
export const PLAYER_START_X = 60;
export const PLAYER_INVINCIBILITY_TIME = 1000; // ms

// ── Flag ──
export const FLAG_X = CANVAS_WIDTH - 50;
export const FLAG_HEIGHT = 80;

// ── Obstacle (LLM output constraints) ──
export const OBSTACLE_HP_MIN = 50;
export const OBSTACLE_HP_MAX = 200;
export const OBSTACLE_DMG_MIN = 5;
export const OBSTACLE_DMG_MAX = 30;
export const OBSTACLE_AGGRO_MIN = 80;
export const OBSTACLE_AGGRO_MAX = 200;
export const OBSTACLE_PATROL_CENTER_X = CANVAS_WIDTH * 0.6;
export const OBSTACLE_PATROL_RANGE = CANVAS_WIDTH * 0.1;

// ── Weapon (LLM output constraints) ──
export const WEAPON_DMG_MIN = 10;
export const WEAPON_DMG_MAX = 50;
export const WEAPON_COOLDOWN_MIN = 0.2;
export const WEAPON_COOLDOWN_MAX = 2.0;
export const WEAPON_EFFECTIVENESS_MIN = 0.5;
export const WEAPON_EFFECTIVENESS_MAX = 3.0;

// ── Environment item ──
export const ENV_DMG_MIN = 0;
export const ENV_DMG_MAX = 100;

// ── Game states ──
export const STATE_MENU = 'menu';
export const STATE_WORD_ENTRY = 'word_entry';
export const STATE_LOADING = 'loading';
export const STATE_PLAYING = 'playing';
export const STATE_VICTORY = 'victory';
export const STATE_GAME_OVER = 'game_over';
export const STATE_LEADERBOARD = 'leaderboard';
export const STATE_LEVEL2_INTRO = 'level2_intro';
export const STATE_LEVEL2_LOADING = 'level2_loading';
export const STATE_LEVEL2_PLAYING = 'level2_playing';
export const STATE_LEVEL2_VICTORY = 'level2_victory';

// ── Level 2 (3D) constants ──
export const L2_ARENA_RADIUS = 30;
export const L2_ARENA_WALL_HEIGHT = 4;
export const L2_PLAYER_SPEED = 0.15;
export const L2_PLAYER_JUMP_FORCE = 0.28;
export const L2_GRAVITY = 0.012;
export const L2_PLAYER_HP = 100;
export const L2_PLAYER_HEIGHT = 2.0;
export const L2_PLAYER_RADIUS = 0.3;
export const L2_CAMERA_DISTANCE = 8;
export const L2_CAMERA_HEIGHT = 5;
export const L2_GROUND_FRICTION = 0.85;

// ── Colors ──
export const COLOR_SKY_TOP = '#4A90D9';
export const COLOR_SKY_BOTTOM = '#87CEEB';
export const COLOR_GROUND = '#5B8731';
export const COLOR_GROUND_DARK = '#4A6F28';
export const COLOR_PLAYER = '#222222';
export const COLOR_FLAG_POLE = '#666666';
export const COLOR_FLAG = '#FF4444';
export const COLOR_HUD_BG = 'rgba(0, 0, 0, 0.6)';
export const COLOR_HP_BAR = '#44DD44';
export const COLOR_HP_BG = '#DD4444';
export const COLOR_TEXT = '#FFFFFF';
export const COLOR_ACCENT = '#FFD700';

// ── Input ──
export const WORD_MAX_LENGTH = 30;

// ── Flavor text pool ──
export const FLAVOR_TEXTS = [
  "Consulting the ancient word spirits...",
  "Your words are being forged into reality...",
  "Assembling pixels with questionable intent...",
  "The universe is judging your word choices...",
  "Generating chaos in 3... 2... 1...",
  "Your stick figure is stretching and preparing...",
  "Somewhere, a game designer is crying...",
  "Warning: results may vary. Dramatically.",
  "The LLM is doing its best. No promises.",
  "Summoning something from the word-void...",
  "Rearranging the laws of physics for you...",
  "Translating your imagination into pain...",
  "This is either genius or a disaster...",
  "Compiling chaos from raw syllables...",
  "Your words have consequences. Literal ones.",
  "Building a nightmare from your vocabulary...",
  "The stick figure has concerns about your choices...",
  "Rendering the absurd in real-time...",
  "This is going to be interesting...",
  "Folding your words into something fightable...",
  "Weaponizing language, one pixel at a time...",
  "Hold on, the universe needs a moment...",
  "Creating your custom existential crisis...",
  "The arena is being prepared for maximum chaos...",
  "Your opponent is warming up...",
  "Processing words of questionable wisdom...",
  "Chaos engine initializing...",
  "Making your stick figure regret everything...",
  "Bending reality to fit your vocabulary...",
  "Pixel artisans are panicking...",
  "The word spirits are confused but willing...",
  "Converting syllables to suffering...",
  "Assembling your doom with care...",
  "One moment, the absurdity meter is calibrating...",
  "Your fate is being procedurally generated...",
  "Loading questionable life choices...",
  "Building something you'll immediately regret...",
  "The stick figure read your words and sighed...",
  "Generating: please lower your expectations...",
  "Your words have been received. Condolences.",
  "Constructing a fair and balanced encounter... just kidding.",
  "Manifesting your word salad into game salad...",
  "Reality is buffering...",
  "The creature is rehearsing its entrance...",
  "Forging your weapon from pure imagination...",
  "Weather forecast: chaotic with a chance of doom...",
  "Computing optimal absurdity levels...",
  "Please wait while we ruin your day creatively...",
  "The pixels are assembling themselves reluctantly...",
  "Your words echo through the void...",
  "Designing a boss fight you didn't ask for...",
  "Generating consequences for your creativity...",
  "Loading screen loading...",
  "Converting entropy to entertainment...",
  "The word forge burns bright...",
  "Preparing something deeply unserious...",
  "Your vocabulary is being stress-tested...",
  "A wild encounter is being born...",
  "Transmuting words into weapons-grade content...",
  "Calibrating jank levels to maximum...",
  "The algorithm is scratching its head...",
  "Deploying stick figure to a hostile environment...",
  "Generating terrain that may or may not cooperate...",
  "Your choices have been noted. And judged.",
  "Cooking up a fresh batch of chaos...",
  "The game engine is muttering to itself...",
  "Improvising game design at machine speed...",
  "Cross-referencing your words with the absurdity database...",
  "Creating art. Loosely defined.",
  "Preparing an unforgettable* experience...\n*Results not guaranteed.",
  "Assembling your arena of questionable decisions...",
  "The creature is doing vocal warm-ups...",
  "Your weapon is being sharpened (metaphorically)...",
  "Nature is preparing to not cooperate...",
  "Rendering the battlefield of your own making...",
  "Combining words like a mad scientist...",
  "Generating content with reckless enthusiasm...",
  "Please hold while we defy common sense...",
  "Your stick figure is signing a waiver...",
  "The chaos engine is purring...",
  "One does not simply generate a game level...",
  "Translating vibes into violence...",
  "The word spirits confer in hushed tones...",
  "Something wicked this way computes...",
  "Assembling your personalized ordeal...",
  "The prophecy of your words is being fulfilled...",
  "Fabricating fun from the fabric of language...",
  "Loading the dice of fate...",
  "The arena awaits your questionable readiness...",
  "Generating: this might take a sec, it's a weird one...",
  "Computing the exact right amount of unfairness...",
  "Preparing obstacles with loving malice...",
  "Converting creativity to calamity...",
  "The game is thinking about your choices...",
  "Stand by for procedurally generated regret...",
  "Your opponent is being assembled from spare parts...",
  "The environment is conspiring against you...",
  "Rendering something between art and accident...",
  "Your words have been weaponized. Literally.",
  "Almost done. Brace yourself.",
  "The final touches of chaos are being applied...",
  "Here goes nothing. And everything.",
];

// ── Profanity filter (basic blocklist) ──
export const PROFANITY_LIST = [
  // Keeping this minimal and focused on the most common slurs/vulgarities
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'dick', 'pussy', 'cock',
  'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'slut', 'whore',
];
