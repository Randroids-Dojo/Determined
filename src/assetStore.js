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
 * Each entry has { word, type, entityData, timestamp }.
 */
export function getAssetList() {
  const store = loadAllSessions();
  const list = [];
  const seen = new Set();

  for (const entry of store) {
    if (!entry.data) continue;

    const items = [
      { word: entry.words.creature, type: 'creature', entityData: entry.data.obstacle },
      { word: entry.words.weapon, type: 'weapon', entityData: entry.data.weapon },
      { word: entry.words.environment, type: 'environment', entityData: entry.data.environment_item },
    ];

    for (const item of items) {
      // Deduplicate by word+type
      const key = `${item.type}:${item.word}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (item.entityData) {
        list.push({
          word: item.word,
          type: item.type,
          entityData: item.entityData,
          timestamp: entry.timestamp,
        });
      }
    }
  }

  return list;
}
