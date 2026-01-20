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
