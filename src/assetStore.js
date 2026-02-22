/**
 * AssetStore — persists generated game assets in localStorage
 * so the Assets screen can list all previously generated words.
 */

const STORAGE_KEY = 'determined_assets';

/**
 * Save a completed game session's words and LLM data.
 */
export function saveAssets(words, data) {
  const store = loadAllSessions();
  store.push({
    timestamp: Date.now(),
    words,
    data,
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('Failed to save assets:', e);
  }
}

/**
 * Load all saved sessions from localStorage.
 */
function loadAllSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Failed to load assets:', e);
    return [];
  }
}

/**
 * Get a flat list of individual assets for the Assets screen.
 * Each entry has { word, type, entityData, words, timestamp }.
 * Deduplicates by word+type, keeping the most recent version.
 */
export function getAssetList() {
  const store = loadAllSessions();
  const map = new Map();

  for (const entry of store) {
    if (!entry.data) continue;

    const items = [
      { word: entry.words.creature, type: 'creature', entityData: entry.data.obstacle },
      { word: entry.words.weapon, type: 'weapon', entityData: entry.data.weapon },
      { word: entry.words.environment, type: 'environment', entityData: entry.data.environment_item },
    ];

    for (const item of items) {
      if (!item.entityData) continue;
      // Later entries overwrite earlier ones (keeps most recent)
      const key = `${item.type}:${item.word}`;
      map.set(key, {
        word: item.word,
        type: item.type,
        entityData: item.entityData,
        words: entry.words,
        timestamp: entry.timestamp,
      });
    }
  }

  return Array.from(map.values());
}
