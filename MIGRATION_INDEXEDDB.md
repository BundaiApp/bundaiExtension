# Dictionary Database Migration

## Overview
The extension now uses **IndexedDB** to store the JMdict dictionary instead of bundling it in memory. This makes the extension significantly lighter.

## How it works

### Singleton Service
- **Location**: `services/dictionaryDB.ts`
- **Pattern**: Singleton (one instance across entire extension)
- **Initialization**: Automatically loads JSON into IndexedDB on first run
- **Subsequent runs**: Checks if database is already populated, skips loading if so

### Database Details
- **Database name**: `BundaiDictionaryDB`
- **Store name**: `jmdict`
- **Indexes**:
  - `kanji`: For kanji-based lookups (multiEntry)
  - `kana`: For kana-based lookups (multiEntry)

### Lookup Methods
```typescript
// Import the singleton
import dictionaryDB from "~services/dictionaryDB"

// Lookup by kanji
const entry = await dictionaryDB.lookupByKanji("日本")

// Lookup by kana
const entry = await dictionaryDB.lookupByKana("にほん")

// Lookup (tries kanji first, then kana)
const entry = await dictionaryDB.lookup("日本")

// Initialize explicitly (optional, auto-initializes on first lookup)
await dictionaryDB.initialize()

// Clear database (for debugging)
await dictionaryDB.clear()
```

## What Changed

### 1. Created IndexedDB Service
- **File**: `services/dictionaryDB.ts`
- Singleton pattern ensures only one database instance
- Checks if database is populated before loading JSON
- Batch inserts for performance (1000 entries per batch)
- Indexed lookups for fast queries

### 2. Updated Components
- **WordCard.tsx**: Now uses `dictionaryDB.lookup(word)` instead of `window.jmdictIndex[word]`
- **auto-subtitle-extractor.tsx**: Calls `dictionaryDB.initialize()` instead of loading JSON
- **custom-subtitles-container.tsx**: Same as above

### 3. Removed Global Window State
- Removed: `window.jmdictData`, `window.jmdictIndex`, `window.jmdictKanaIndex`, `window.jmdictLoaded`
- Kept: `window.kuromojiTokenizer` (still needed for tokenization)

## Benefits

1. **Lighter extension bundle**: JSON file can be removed from bundle after first load
2. **Persistent storage**: Database survives browser restarts
3. **Fast lookups**: Indexed queries are faster than in-memory object lookups
4. **Memory efficient**: Data is not loaded into RAM, queried on-demand
5. **One-time load**: JSON is only fetched and processed once

## Optional: Remove JSON from Bundle

To make the extension even lighter, you can:

### Option A: Host JSON on your backend
1. Upload `assets/data/japanese/jmdict-simplified-flat-full.json` to your backend
2. Update `services/dictionaryDB.ts` line 100:
   ```typescript
   const response = await fetch(
     "https://api.bundai.app/static/jmdict-simplified-flat-full.json"
   )
   ```
3. Remove the JSON file from `assets/data/japanese/`
4. Remove it from `web_accessible_resources` in manifest

### Option B: Keep it as is (recommended for now)
- JSON file remains in extension as `web_accessible_resource`
- Still loads only once per user
- Works offline after first load
- No external dependencies

## Testing

1. **First install**: Watch console for "Database empty, loading JMdict data..."
2. **Subsequent loads**: Should see "Database already populated with X entries"
3. **Word lookups**: Hover over Japanese words, should still show dictionary entries
4. **Performance**: Lookups should be instant (IndexedDB is very fast)

## Troubleshooting

If users experience issues:
```typescript
// Clear the database (run in console on YouTube page)
import("chrome-extension://YOUR_EXTENSION_ID/services/dictionaryDB.js")
  .then(m => m.default.clear())
  .then(() => console.log("Database cleared, reload page"))
```

Or provide a button in the extension UI to clear/reinitialize the database.
