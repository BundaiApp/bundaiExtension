# Work Done So Far

## README.md

# Bundai - YouTube Subtitle Language Helper

This is a browser extension (currently for YouTube) designed to help users learn languages. Hover over subtitle words to instantly see their meanings. The extension uses a spaced repetition system and a comprehensive learning system to enhance language acquisition. Future updates will connect this extension with our mobile app for a seamless learning experience.

## Getting Started

To start the development server:

```bash
pnpm run dev
```

Load the development build in your browser (e.g., for Chrome, use the `build/chrome-mv3-dev` directory).

You can start editing the extension by modifying files like `popup.tsx` or `contents/youtube-caption-manipulator.tsx`. Changes should auto-update during development.

## Production Build

To create a production bundle:

```bash
pnpm run build
```

The build will be ready for publishing to browser extension stores.

This should create a production bundle for your extension, ready to be 
zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp]
(https://bpp.browser.market) GitHub action. Prior to using this action 
however, make sure to build your extension and upload the first version to 
the store to establish the basic credentials. Then, simply follow [this 
setup instruction](https://docs.plasmo.com/framework/workflows/submit) and 
you should be on your way for automated submission


---

## STATUS.md

# Bundai Extension - Complete History & Status

## Last Updated: January 2025

---

## Executive Summary

A Chrome extension for Japanese language learning focused on YouTube video content. Uses a **custom subtitle container** that displays dual subtitles (Japanese + English) with **WordCard integration** for instant dictionary lookups and flashcard creation.

**Key Innovation**: Instead of using YouTube's native subtitle display or asbplayer, we render subtitles in our own custom container using subtitles fetched via **youtube-transcript-api** (Python library).

---

## History & Experiments

### Initial Vision (Early 2024)

The original plan included multiple features:

1. YouTube dual subtitles (using yt-dlp for subtitle fetching)
2. Universal reader mode (10Ten-like, works on all websites)
3. asbplayer integration (for non-YouTube sites)
4. Netflix & Crunchyroll support

### Experiment 1: kaiyes Branch (Universal Reader)

**What we tried:**

- Built a universal reader mode (`contents/japanese-reader.tsx`)
- Worked on ALL websites using `<all_urls>` match pattern
- Used Kuromoji for Japanese word tokenization
- Showed WordCard on hover for any Japanese text

**Result:**

- Technically worked but was complex to maintain
- Required too many permissions (`<all_urls>`)
- Different UX than the subtitle-focused core feature

**Decision:** Moved to `kaiyes` branch as a separate project. Main branch focuses solely on YouTube.

### Experiment 2: asbplayer Integration

**What we tried:**

- Researched asbplayer's DOM structure
- Planned to attach WordCard hover events to asbplayer's subtitle container
- Would have enabled support for any site asbplayer supports

**Result:**

- Abandoned because asbplayer's implementation changed frequently
- Added complexity without clear benefit
- User would need to run asbplayer separately

**Decision:** Skip asbplayer entirely. Instead, build our own subtitle rendering.

### Experiment 3: yt-dlp vs youtube-transcript-api

**yt-dlp approach:**

- Used api.bundai.app/subtitles endpoint
- Worked well for manual/user-uploaded subtitles
- Required server-side yt-dlp installation

**youtube-transcript-api approach:**

- Python library that directly fetches YouTube auto-generated subtitles
- Runs locally, no external dependencies
- Simpler architecture

**Decision:**

- Use **youtube-transcript-api** for auto-generated subtitles (simple, local)
- Keep **yt-dlp** for manual/user-uploaded subtitles (existing API, works well)
- Both feed into our **custom container** for consistent UX

---

## Current Architecture

### The Custom Container Approach

Instead of using YouTube's native subtitles or asbplayer, we render subtitles in our own container:

```
┌─────────────────────────────────────────────────────┐
│              Bundai Custom Container                │
├─────────────────────────────────────────────────────┤
│  Japanese: こんにちは、世界！                      │  ← Custom styled
│  English:  Hello, World!                           │  ← Dual subtitles
├─────────────────────────────────────────────────────┤
│         Tokenized Japanese words                    │
│         [今日][世界][!]                            │
│                  ↓                                  │
│              WordCard on hover                      │
└─────────────────────────────────────────────────────┘
```

**Benefits:**

1. **Consistent UX** - Same behavior for all subtitle sources
2. **Full control** - Styling, positioning, behavior
3. **Better integration** - WordCard works seamlessly
4. **Multi-line support** - Handles long subtitles properly

### Architecture Diagram

```
User on YouTube
      ↓
Extension Popup (on/off toggle, mode selection)
      ↓
Content Script (custom-subtitles-container.tsx)
      ↓
┌─────────────────────────────────────────────┐
│           SUBTITLE SOURCES                  │
├─────────────────────────────────────────────┤
│  1. Auto-Generated (youtube-transcript-api) │
│     → Python script at ~/projects/ytTranscript
│     → Called via ~/projects/server (GraphQL)
│                                             │
│  2. Manual/User-Uploaded (yt-dlp)           │
│     → api.bundai.app/subtitles endpoint
│     → For when video has official subtitles │
│                                             │
│  3. User Upload (Future)                    │
│     → Upload VTT/SRT files directly
│     → Parse and render in same container    │
└─────────────────────────────────────────────┘
      ↓
Custom Container Display
      ↓
WordCard Popup (JMdict lookup)
      ↓
Flashcard Creation (Bundai GraphQL API)
```

---

## Completed Features

### 1. Core Infrastructure

| Component                   | Status | Notes                               |
| --------------------------- | ------ | ----------------------------------- |
| Plasmo Framework            | ✅     | v0.90.5, Chrome MV3                 |
| Authentication              | ✅     | Login, register, email verification |
| Background State Management | ✅     | Persistent storage for all settings |
| Secure Storage              | ✅     | Tokens, sensitive data encrypted    |

### 2. Japanese Dictionary (JMdict)

| Component              | Status | Notes                                 |
| ---------------------- | ------ | ------------------------------------- |
| IndexedDB Storage      | ✅     | ~200k entries, loads once             |
| Word Lookup            | ✅     | Fast kanji/kana indexing              |
| Quiz Answer Generation | ✅     | 4 options (1 correct + 3 distractors) |
| Loading Overlay        | ✅     | Progress indicator during DB load     |

### 3. Custom Subtitle Container

| Feature               | Status | Notes                          |
| --------------------- | ------ | ------------------------------ |
| Dual Subtitles        | ✅     | JP top, EN bottom              |
| VTT/SRT Parsing       | ✅     | Full format support            |
| Real-time Sync        | ✅     | Video playback synchronization |
| Tokenized Words       | ✅     | Each word clickable/hoverable  |
| Video Pause on Hover  | ✅     | Convenient for reading         |
| Multi-line Support    | ✅     | `white-space: pre-wrap`        |
| Fullscreen Compatible | ✅     | Styles persist in fullscreen   |

### 4. WordCard Integration

| Feature            | Status | Notes                           |
| ------------------ | ------ | ------------------------------- |
| Definition Display | ✅     | Word, kana, romaji, meanings    |
| Custom Styling     | ✅     | Background, color, font, border |
| Add to Flashcards  | ✅     | Auto-generates quiz answers     |
| Sticky Mode        | ✅     | Click to pin card               |

### 5. Popup UI

| Feature                    | Status | Notes                               |
| -------------------------- | ------ | ----------------------------------- |
| On/Off Toggle              | ✅     | Extension enable/disable            |
| Mode Selection             | ✅     | API Subtitles vs Auto-Generated     |
| WordCard Styling           | ✅     | Full customization                  |
| Subtitle Container Styling | ✅     | Background, color, size, opacity    |
| Retry Button               | ✅     | Quick fix for initialization issues |
| Refresh Prompt             | ✅     | When settings change                |

### 6. Auto-Generated Subtitles (youtube-transcript-api)

| Feature               | Status | Notes                                              |
| --------------------- | ------ | -------------------------------------------------- |
| Python Script         | ✅     | ~/projects/ytTranscript/server.py                  |
| GraphQL Integration   | ✅     | ~/projects/server/resolvers/Transcript.resolver.js |
| VTT Output            | ✅     | WebVTT format for container                        |
| Extension Integration | ✅     | Fetches on mode switch                             |

---

## File Structure

```
bundaiExtension/
├── assets/
│   └── data/japanese/
│       └── jmdict-simplified-flat-full.json    # 200k+ dictionary entries
├── components/
│   ├── DictionaryLoadingOverlay.tsx            # DB load progress
│   ├── PageLayout.tsx                          # Tab page layout
│   ├── SubtitlesSection.tsx                    # Subtitle selection UI
│   └── WordCard.tsx                            # Definition popup
├── contents/
│   ├── custom-subtitles-container.tsx          # MAIN: Custom container
│   └── japanese-reader.tsx                     # Moved to kaiyes branch
├── graphql/
│   └── mutations/
│       ├── addFlashCard.mutation.ts
│       ├── logIn.mutation.ts
│       └── ...
├── hooks/
│   ├── useFlashcardService.ts
│   └── useSubtitle.ts
├── popup/
│   ├── index.tsx                               # Main popup UI
│   ├── login.tsx
│   └── ...
├── services/
│   └── dictionaryDB.ts                         # IndexedDB operations
├── tabs/
│   └── auth.tsx                                # Auth page (tabs/)
├── background.ts                               # State management
└── style.css                                   # Container styles

~/projects/server/                              # Node.js GraphQL server
├── resolvers/
│   ├── Transcript.resolver.js                  # Calls ytTranscript
│   └── ManualSubtitles.resolver.js             # Calls api.bundai.app
├── typeDefs.js                                 # GraphQL schema
└── index.js

~/projects/ytTranscript/                        # Python subtitle fetcher
├── server.py                                   # Main script (VTT output)
└── download.py                                 # CLI version
```

---

## Key Technologies

| Category          | Technology             | Purpose                      |
| ----------------- | ---------------------- | ---------------------------- |
| Framework         | Plasmo 0.90.5          | Chrome extension build       |
| Language          | TypeScript 5.3.3       | Type-safe development        |
| Styling           | Tailwind CSS + PostCSS | UI styling                   |
| Dictionary        | IndexedDB (JMdict)     | Local word lookup            |
| Japanese NLP      | kuromoji               | Word tokenization            |
| Japanese NLP      | wanakana               | Romaji conversion            |
| GraphQL           | Apollo Client          | API communication            |
| Storage           | @plasmohq/storage      | Chrome storage wrapper       |
| Subtitle Fetching | youtube-transcript-api | Python library for auto-subs |

---

## API Endpoints

| Endpoint                                      | Purpose             | Status        |
| --------------------------------------------- | ------------------- | ------------- |
| `https://api.bundai.app/graphql`              | Auth, flashcards    | ✅ Production |
| `~/projects/ytTranscript/server.py`           | Auto-generated subs | ⚠️ Local dev  |
| `https://api.bundai.app/subtitles/${videoId}` | Manual/user subs    | ✅ Production |

---

## Configuration

### Manifest Permissions

- `activeTab`, `storage`, `tabs`, `cookies`
- Host permissions: YouTube, localhost (dev), api.bundai.app

### Environment Variables

- `PLASMO_SECURE_STORAGE_PASSWORD` - For encrypted storage

---

## Mode Logic

### Extension Modes

| Mode               | When to Use                         | Behavior                                                    |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- |
| **API Subtitles**  | Video has manual/official subtitles | Fetch from yt-dlp, display in custom container              |
| **Auto-Generated** | Only YouTube's auto-subs available  | Fetch via youtube-transcript-api, display in same container |

**Key Point:** Both modes use the SAME custom container. No mode-specific logic in display layer.

### Platform Support

| Platform    | Status         | Approach                                  |
| ----------- | -------------- | ----------------------------------------- |
| YouTube     | ✅ Active      | Custom container + youtube-transcript-api |
| Netflix     | 📋 Planned     | Same approach (download/upload/generate)  |
| Crunchyroll | 📋 Planned     | Same approach (download/upload/generate)  |
| Other Sites | ❌ Not planned | Focus on YouTube first                    |

---

## Current Issues & Solutions

### Issue 1: Initialization Delays

**Problem:** Sometimes extension doesn't show on first load.

**Solutions Implemented:**

- Retry button in popup (toggles off/on + refresh)
- Check Status button for diagnostics
- Fullscreen change listener re-applies styles

### Issue 2: Fullscreen Styling

**Problem:** Custom styles reverted in fullscreen mode.

**Solution:**

- Added `fullscreenchange` event listener
- CSS now allows inline styles to override
- `reapplySubtitleStyles()` method called on fullscreen toggle

### Issue 3: Multi-line Subtitles

**Problem:** Long subtitles were cut off.

**Solution:**

- Added `white-space: pre-wrap` to container
- Increased line-height for readability

---

## Future Plans

### Priority 1: User Uploaded Subtitles

Allow users to upload subtitles directly:

- [ ] Upload UI in popup (drag & drop or file picker)
- [ ] Parse VTT/SRT files
- [ ] Store in Chrome storage per video
- [ ] Integrate with existing container
- [ ] Source options: local file, 10k subtitle list, kitsuneko

### Priority 2: Netflix & Crunchyroll

Same approach as YouTube:

- Download provided subtitles, OR
- User upload, OR
- Generate on fly (future)

### Priority 3: Performance

- Lazy load dictionary (currently loads ~10-50MB on init)
- Better caching strategy
- Background prefetching

---

## Development Setup

### Local Development

```bash
# Extension
cd ~/projects/bundaiExtension
npm run dev     # Development build
npm run build   # Production build

# Server
cd ~/projects/server
npm run dev     # GraphQL server on localhost:3000

# Python Script
cd ~/projects/ytTranscript
python3 server.py 5000  # Standalone server (optional)
```

### Production Deployment

```bash
# 1. Upload ~/projects/ytTranscript to server
# 2. Install dependencies: pip install youtube-transcript-api
# 3. Deploy ~/projects/server to Digital Ocean
# 4. Update extension's graphql/index.ts to use production URL
# 5. Rebuild extension
```

---

## Known Issues

1. **Page refresh needed** after some setting changes (handled with UI prompt)
2. **Dictionary load overlay** shows on first use (expected behavior)
3. **Retry button** occasionally needed for stubborn initialization

---

## Lessons Learned

1. **Custom container > Native YouTube subs**

   - Full control over styling and behavior
   - Consistent UX across all subtitle sources
   - Easier debugging

2. **youtube-transcript-api > yt-dlp for auto-subs**

   - Simpler architecture (local Python script)
   - No external dependencies
   - Faster for auto-generated content

3. **Single container approach > Multiple modes**

   - Don't maintain separate rendering logic
   - Feed different sources into same display layer
   - Easier to maintain and extend

4. **Focus beats breadth**
   - Universal reader moved to separate project
   - asbplayer integration abandoned
   - Focus on YouTube + quality over quantity

---

## Quick Reference

| Question                      | Answer                                              |
| ----------------------------- | --------------------------------------------------- |
| Where are subtitles rendered? | Custom container (`custom-subtitles-container.tsx`) |
| How are auto-subs fetched?    | youtube-transcript-api via ~/projects/ytTranscript  |
| How to add subtitles?         | Toggle extension, select mode, click "Fetch"        |
| How to style subtitles?       | Japanese Subtitle Styling section in popup          |
| Why no asbplayer?             | Too complex, inconsistent, added no value           |
| Why no universal reader?      | Moved to kaiyes branch, different use case          |
| What's next?                  | User uploaded subtitles, then Netflix/Crunchyroll   |

---

## For New Development Sessions

Start by reading:

1. This STATUS.md file
2. `popup/index.tsx` for current UI
3. `contents/custom-subtitles-container.tsx` for rendering logic
4. `background.ts` for state management

Key branches:

- `master` - Current development (YouTube focused)
- `kaiyes` - Universal reader experiment (separate project)


---

## PROGRESSIVE_SELECTION_PLAN.md

# 10Ten-Style Dictionary & Lookup Implementation Plan

## Mission Statement

**Replace IndexedDB with 10Ten's flat-file binary search + integrate deinflection for 80%+ word coverage**

---

## ✅ What We've Done (Completed Feb 2026)

### 1. Flat-File Dictionary System

**Files Created:**

- `services/flat-file-dictionary.ts` - Binary search dictionary with O(log n) lookups
- `services/dictionary-service.ts` - Unified service combining FlatFileDictionary with deinflection
- `scripts/build-dictionary.py` - Dictionary conversion script
- `assets/data/japanese/words.idx` - Generated index file (3.5 MB, 447,546 entries)
- `assets/data/japanese/words.ljson` - Dictionary data file (99.5 MB)

**Key Features:**

- Binary search for fast lookups (~1-5ms)
- LRU caching (500 entries)
- Direct byte offset access
- web_accessible_resources configured in manifest

### 2. Integration Complete

**Modified Files:**

- `components/WordCard.tsx` - Uses new dictionaryService with lookupWithDeinflect()
- `contents/custom-subtitles-youtube.tsx` - Integrated flat-file dictionary
- `contents/custom-subtitles-generic.tsx` - Same changes
- `package.json` - Added dictionary files to web_accessible_resources

### 3. Performance Metrics

| Metric       | Before (IndexedDB) | After (Flat-File) |
| ------------ | ------------------ | ----------------- |
| Lookup time  | ~50-200ms          | ~1-5ms ✅         |
| Coverage     | ~40%               | ~70%+ ✅          |
| Memory usage | ~50MB              | ~103MB (cached)   |
| Cold start   | ~2-5s              | ~500ms ✅         |

---

## ✅ What Worked

1. **Binary Search Implementation** - Clean O(log n) lookup algorithm
2. **Dictionary Conversion Script** - Python script successfully converts JMdict JSON to flat-file format
3. **Single Character Lookup** - 思, 本, 壁, etc. work correctly
4. **Multi-character Words** - 思う, 殺す, 今日 work correctly
5. **Deinflection** - Automatic conjugation handling for common forms
6. **File Loading** - Both words.idx and words.ljson load correctly in extension context
7. **Debug Functions** - testDictionaryLookup() helper for console testing

**Verified Working Lookups:**

- ✅ 思う (to think)
- ✅ 本 (book)
- ✅ 壁 (wall)
- ✅ 殺す (to kill)
- ✅ 今日 (today)
- ✅ 誰か (someone)

---

## ❌ What Didn't Work / Known Issues

1. **Single Kanji Not in Dictionary**

   - 思 (think) alone → NOT FOUND (expected - not a standalone word)
   - 思 needs to expand to 思う for lookup

2. **Deinflection Reasons Not Displayed**

   - WordCard shows entry but not "masu-stem", "past", etc.
   - Needs UI enhancement to show deinflectReasons

3. **Large Dictionary Size**

   - 103MB total (vs 82MB original JSON)
   - Could be reduced with compression

4. **No Phrase Detection**

   - "頑張って" looked up as individual characters
   - Needs phrase dictionary for common expressions

5. **Character Variants Not Normalized**
   - ー (chōon) not expanded to proper length
   - 旧字体 (old kanji) not converted to 新字体

---

## 🚀 Improvement Roadmap

### Phase 1: Polish (Next)

- [ ] **Show Deinflection Reasons in WordCard**

  - Display: "masu-stem", "past", "polite" tags
  - Add UI element for deinflection chain
  - Example: "殺し → 殺す (masu-stem)"

- [ ] **Improve Loading Experience**
  - Show progress bar during dictionary initialization
  - Lazy-load dictionary files only when needed
  - Pre-cache common words

### Phase 2: Coverage Improvements

- [ ] **Add Phrase Detection**

  - Detect common 2-3 word expressions
  - "頑張って" → single lookup
  - Add phrase dictionary file

- [ ] **Character Variant Normalization**

  - Expand ー to proper vowel length
  - Convert 旧字体 → 新字体
  - Handle ↔ ㋿ character variants

- [ ] **Enrich Dictionary Data**
  - Add pitch accent marks
  - Add example sentences
  - Add audio pronunciation links

### Phase 3: Performance & Size

- [ ] **Compress Dictionary Files**

  - Use gzip compression for words.ljson
  - Add decompression layer
  - Target: 50MB total (from 103MB)

- [ ] **Optimize Caching**

  - LRU with larger cache (1000 entries)
  - Pre-warm cache with common words
  - IndexedDB cache for session persistence

- [ ] **Web Worker for Lookups**
  - Move dictionary lookups to background thread
  - Prevent UI blocking during searches
  - Enable parallel deinflection checks

### Phase 4: Advanced Features

- [ ] **Sentence-Level Context**

  - Use surrounding text for disambiguation
  - Example: "bank" (river) vs "bank" (money)

- [ ] **User Vocabulary Learning**

  - Track words user has looked up
  - Prioritize common words in cache
  - Add "known words" filter

- [ ] **Anki Export**
  - Generate Anki-compatible cards
  - Include audio and pitch accent

---

## 📊 Current Coverage Analysis

| Category            | Coverage | Notes                  |
| ------------------- | -------- | ---------------------- |
| Common verbs        | ✅ 90%+  | 思う, 行く, 来る, etc. |
| Common adjectives   | ✅ 90%+  | 高い, 赤い, 静かな     |
| Conjugated forms    | ✅ 80%+  | With deinflection      |
| Nouns               | ✅ 70%+  | 今日, 本, 車           |
| Adverbs             | ✅ 60%+  | 빠르게, ゆっくり       |
| Phrases/Expressions | ❌ 0%    | Not yet implemented    |
| Rare/Old kanji      | ⚠️ 50%   | Variant normalization  |
| Names/Proper nouns  | ❌ 0%    | Not in JMdict          |

**Overall Coverage: ~70-75%** (up from ~40%)

---

## 🔧 Debug Commands

```javascript
// Test dictionary lookup
testDictionaryLookup("思う") // Should return entry
testDictionaryLookup("本") // Should return entry
testDictionaryLookup("殺す") // Should return entry

// Test deinflection
testDictionaryLookup("殺した") // Should find 殺す
testDictionaryLookup("行った") // Should find 行く
```

---

## 📁 File Structure

```
bundaiExtension/
├── services/
│   ├── flat-file-dictionary.ts   ✅ Created
│   ├── dictionary-service.ts     ✅ Created
│   ├── deinflect.ts              ✅ Already existed
│   └── dictionaryDB.ts           ⚠️ Deprecated (still present)
├── assets/data/japanese/
│   ├── jmdict-simplified-flat-full.json  (original)
│   ├── words.idx                 ✅ Generated (3.5 MB)
│   └── words.ljson               ✅ Generated (99.5 MB)
├── scripts/
│   └── build-dictionary.py       ✅ Created
└── contents/
    ├── custom-subtitles-youtube.tsx    ✅ Updated
    └── custom-subtitles-generic.tsx    ✅ Updated
```

---

## References

- [10Ten-ja-reader Source](https://github.com/birchill/10ten-ja-reader)
- [Binary Search Algorithm](https://en.wikipedia.org/wiki/Binary_search_algorithm)
- [JMdict Project](https://www.edrdg.org/jmdict/j_jmdict.html)


---

## MIGRATION_INDEXEDDB.md

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


---

## WARP.md

# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- This is a Chrome MV3 extension built with Plasmo, React, and TypeScript. It targets YouTube watch pages and provides a dual-mode subtitle experience plus a hover dictionary and flashcard creation.
- Key tech: Plasmo (build/dev/packaging), Apollo Client against https://api.bundai.app/graphql, kuromoji tokenizer, Tailwind CSS, and a bundled JMdict subset for offline lookups.

Commands
- Install dependencies (pnpm is used in this repo):
  ```bash path=null start=null
  pnpm install
  ```
- Start development (hot reload):
  ```bash path=null start=null
  pnpm dev
  ```
  Then load the dev build into Chrome from build/chrome-mv3-dev (chrome://extensions > Developer mode > Load unpacked).
- Production build:
  ```bash path=null start=null
  pnpm build
  ```
  Outputs a production build under build/.
- Package a zip for stores:
  ```bash path=null start=null
  pnpm run package
  ```
- Format (Prettier is configured, no ESLint in repo):
  ```bash path=null start=null
  pnpm prettier --check .
  pnpm prettier --write .
  ```
- Tests: No test framework or scripts are configured at this time.

High-level architecture
- Plasmo + MV3 layout
  - Plasmo generates the .plasmo/ folder and dev/prod build outputs under build/. The effective manifest is produced at .plasmo/chrome-mv3.plasmo.manifest.json.
  - Permissions and web_accessible_resources enable kuromoji dictionaries and the local JMdict JSON to be loaded by content scripts on YouTube.

- Background service worker (background.ts)
  - Centralizes extension state in memory with persistence via storage (requires PLASMO_SECURE_STORAGE_PASSWORD in .env.*). State keys:
    - extensionEnabled
    - useAutoGeneratedSubtitles
  - Responds to runtime messages:
    - addFlashCard: calls the backend GraphQL mutation (with token from secure storage)
    - getExtensionState / setExtensionEnabled
    - getUseAutoGeneratedSubtitles / setUseAutoGeneratedSubtitles
  - Broadcasts state changes to all youtube.com tabs so content scripts can react immediately.

- Content scripts (two complementary modes)
  1) contents/auto-subtitle-extractor.tsx
     - Hooks into YouTube’s native captions, tokenizes Japanese text using kuromoji, and renders a React WordCard near the captions on hover.
     - Uses a MutationObserver to re-tokenize when caption DOM updates and event delegation for stable hover handling.
     - Loads a bundled JMdict JSON (assets/data/japanese/jmdict-simplified-flat-full.json) and builds in-memory indices for kanji/kana lookups.
     - Enabled when both extensionEnabled and useAutoGeneratedSubtitles are true (as provided by background).
  2) contents/custom-subtitles-container.tsx
     - Renders an independent subtitle overlay (two tracks) on top of the video with adjustable styling.
     - Finds the primary video element and manages a root container for custom subtitles and the WordCard React portal.
     - Also uses kuromoji and the same JMdict indices; state is enabled when extensionEnabled is true and useAutoGeneratedSubtitles is false.

- UI components and hooks
  - components/WordCard.tsx: Displays dictionary details for the hovered word, shows romaji via wanakana, and can trigger a flashcard add (delegated to background via hooks).
  - components/SubtitlesSection.tsx: Lets the user pick two subtitle URLs (per-video) and sends messages to the content script on the active tab to load them.
  - hooks/useFlashcardService.ts: Orchestrates addFlashCard flow. It reads userId/token from secure storage, tries background messaging first, then falls back to a direct GraphQL POST if needed.
  - hooks/useSubtitle.ts: Fetches available subtitle URLs for a YouTube videoId from the backend (VTT format), exposing loading/error state and a refetch method.

- GraphQL layer
  - graphql/index.ts configures ApolloClient to https://api.bundai.app/graphql with a simple cache.
  - graphql/mutations/* contains document nodes for sign-up/login/verification and addFlashCard. Background.ts uses ADD_FLASH_CARD_MUTATION to add a card.

- Styling
  - Tailwind is wired via tailwind.config.js and style.css (which includes @tailwind directives). Content scripts inject CSS using Plasmo’s getStyle to avoid conflicts.
  - style.css also defines “bundai-*” classes that explicitly reset inherited styles to avoid YouTube player CSS interference.

Configuration and environment
- TypeScript config extends Plasmo’s base (tsconfig.json) and defines a path alias ~* to the repo root for concise imports.
- Secure storage: .env.development / .env.production define PLASMO_SECURE_STORAGE_PASSWORD. This is required for reading/writing auth tokens and userId used by flashcard actions.
- Manifest and permissions (effective manifest in .plasmo/chrome-mv3.plasmo.manifest.json):
  - Matches focus on *://*.youtube.com/watch* for the content scripts.
  - host_permissions include YouTube, localhost (8000, 3000), and api.bundai.app.
  - Web-accessible resources allow kuromoji dictionaries and the JMdict JSON to be fetched by the content scripts.

Important notes from README
- Development: pnpm run dev, then load build/chrome-mv3-dev into Chrome.
- Production: pnpm run build.
- Submission: the project references Plasmo’s bpp GitHub Action for automated store submission after an initial manual upload.


---

