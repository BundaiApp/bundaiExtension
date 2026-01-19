# Bundai Extension Status

## Overview

A Chrome/Chromium browser extension for Japanese language learning. Features dual subtitle support for YouTube, universal text reader for any website, WordCard integration with asbplayer subtitles, and flashcard integration with Bundai app.

---

## Vision

The Bundai Extension aims to help Japanese learners learn from video content:

1. **YouTube Dual Subtitles** ✅ (Active Priority)

   - Show dual subtitle for YouTube using custom subtitle container
   - Fetch automated subtitles via youtube-transcript-api (Python script at ~/projects/ytTranscript)
   - Use Node.js server at ~/projects/server as bridge to Python script
   - Use our custom WordCard for subtitle word lookups
   - Support YouTube's native auto-generated subtitles
   - **Future**: User upload support (from 10k subtitle list or kitsuneko)

2. **Netflix & Crunchyroll Dual Subtitles** ❌ (Planned)

   - Show dual subtitles similar to YouTube implementation
   - Subtitle sources: (1) Download provided subs, (2) User uploads, (3) Generate on fly
   - Create custom subtitle container and control video
   - Word hover integration with WordCard
   - **Status**: Planned after YouTube implementation is complete

3. ~~Universal Reader~~ ❌ (Abandoned)

   - ~~Reader mode for any Japanese text on the web~~
   - ~~10Ten-like hover dictionary functionality~~
   - ~~Works on any website (Twitter, news, blogs, etc.)~~
   - **Status**: Feature abandoned - moved to kaiyes branch as separate project

---

## ✅ Completed Features

### 1. Core Infrastructure

- **Plasmo Framework**: Extension built with Plasmo (v0.90.5) for Chrome MV3 compatibility
- **Authentication System**: Login, register, password reset, email verification via GraphQL API
- **Background Script**: Centralized state management with persistent storage (extension enabled, mode selection, WordCard styles)
- **Secure Storage**: Using `@plasmohq/storage/secure` for sensitive data (auth tokens, settings)

### 2. Japanese Dictionary (JMdict)

- **IndexedDB Storage**: Full JMdict database (~200k entries) stored locally
- **Service Implementation** (`services/dictionaryDB.ts`):
  - Batch loading with progress indicators
  - Indexes by kanji and kana for fast lookups
  - Random entry generation for quiz answers
  - Database only loads once (persistent across sessions)

### 3. Universal Japanese Reader (10Ten-like)

**File**: `contents/japanese-reader.tsx`

- Works on **ALL websites** (`<all_urls>` match pattern)
- Kuromoji tokenization for word segmentation
- Hover over Japanese text → show WordCard popup
- Click to make card sticky
- Lookup in local JMdict database
- Romaji conversion via wanakana
- Customizable WordCard styles

### 4. YouTube Dual Subtitle System (Custom Container)

**File**: `contents/custom-subtitles-container.tsx`

#### Subtitle Rendering

- Dual subtitle overlay (JP top, EN bottom)
- VTT and SRT format parsing
- Real-time sync with video playback
- Tokenized Japanese words (clickable/hoverable)
- Subtitle text pauses video on hover

#### Word Hover & Flashcards

- Hover on tokenized words → show WordCard with definitions
- Click to add to Bundai flashcards
- Auto-generates quiz answers (3 distractors from dictionary)
- GraphQL mutation to `https://api.bundai.app/graphql`

### 5. Subtitle API Integration

**File**: `hooks/useSubtitle.ts`, `popup/index.tsx`

- Fetches from `https://api.bundai.app/subtitles/${videoId}?subtitle_format=vtt` (manual subtitles)
- **NEW**: Python script at `~/projects/ytTranscript` using youtube-transcript-api for automated subtitles
- Direct Python script calls from extension (no Node.js server for subtitles)
- Local caching (24hr expiry, 3MB limit)
- Auto-load saved subtitles on page navigation
- Manual fetch button in popup

### 6. Popup UI

**File**: `popup/index.tsx`

- Extension on/off toggle
- Mode selection (API Subtitles vs Reader Mode)
- Subtitle selection dropdown (when API mode active)
- WordCard style editor (color, font size, border radius)
- Current video/page info display
- Refresh prompt after settings changes

### 7. WordCard Component

**File**: `components/WordCard.tsx`

- Displays word, kana, romaji, meanings
- Custom styling support (background, text, border, fonts)
- Add to flashcards button with quiz generation
- Success/error feedback
- Close button

### 8. Flashcard Service

**File**: `hooks/useFlashcardService.ts`, `graphql/mutations/addFlashCard.mutation.ts`

- Apollo GraphQL client integration
- Auto-generates quiz answers (4 options: 1 correct + 3 random)
- Source tracking (extension, app, etc.)

---

## 🚧 In Progress / Current Priority

### YouTube Transcript API Integration

**Priority**: 1st (Main Goal)
**Files**: `popup/index.tsx`, `hooks/useSubtitle.ts`, `~/projects/ytTranscript/`

#### Requirements:

1. **Replace yt-dlp with youtube-transcript-api**

   - Modify `~/projects/ytTranscript/download.py` to output VTT format
   - Extension calls Python script directly instead of api.bundai.app/subtitles
   - Support both automated and manual subtitle fetching
   - Get full transcript at once (not chunk by chunk)

2. **Update extension to use Python script**

   - Modify popup/index.tsx to call local Python endpoint
   - Parse VTT output from youtube-transcript-api
   - Maintain existing dual subtitle container functionality

3. **Test with various videos**

   - Test with Japanese auto-generated subtitles
   - Test with English subtitles
   - Verify timing and synchronization

---

## 📋 TODO / Plan

### Phase 1: YouTube Transcript API Integration ⚠️ CURRENT PRIORITY

**Status**: In Progress
**Required**:

- [x] Review youtube-transcript-api capabilities
- [x] Modify `~/projects/ytTranscript` to output VTT format
- [x] Create Node.js endpoint in ~/projects/server to call Python script
- [x] Update extension popup to fetch from GraphQL endpoint
- [ ] Test full transcript fetch with extension
- [ ] Verify VTT parsing in custom-subtitles-container.tsx

### Phase 2: User Subtitle Upload (Future)

**Status**: Planned
**Required**:

- Upload UI in popup for subtitle files (VTT/SRT)
- Parse uploaded subtitle files
- Store uploaded subtitles per video in Chrome storage
- Integrate with existing dual subtitle system
- Fetch subtitles from 10k subtitle list or kitsuneko website

### Phase 3: Netflix & Crunchyroll Support (Future)

**Status**: Not Started
**Required**:

- Subtitle source options: (1) Download provided subs, (2) User uploads, (3) Generate on fly
- Create platform adapters for Netflix and Crunchyroll
- Implement dual subtitle container for both platforms
- Word hover integration with WordCard
- Video control (pause/play on subtitle hover)

### ~~Abandoned Features~~

- ~~asbplayer integration~~ (abandoned)
- ~~Universal Reader Mode~~ (abandoned - moved to separate project in kaiyes branch)

---

## 🗂️ File Structure

```
bundaiExtension/
├── assets/
│   └── data/japanese/
│       └── jmdict-simplified-flat-full.json    # Dictionary data
├── components/
│   ├── DictionaryLoadingOverlay.tsx           # Loading indicator
│   ├── PageLayout.tsx                          # Tab page layout
│   ├── SubtitlesSection.tsx                    # Subtitle dropdown UI
│   └── WordCard.tsx                           # Definition popup
├── contents/
│   ├── japanese-reader.tsx                     # Universal reader (all sites) 🚧 Needs asbplayer support
│   └── custom-subtitles-container.tsx         # YouTube dual subs (custom container)
├── graphql/
│   └── mutations/
│       ├── addFlashCard.mutation.ts
│       ├── logIn.mutation.ts
│       ├── signUp.mutation.ts
│       ├── forgetPassword.mutation.ts
│       ├── resendVerification.mutation.ts
│       └── verification.mutation.ts
├── hooks/
│   ├── useFlashcardService.ts                  # Flashcard GraphQL
│   └── useSubtitle.ts                          # Subtitle API hook
├── popup/
│   ├── index.tsx                               # Main popup UI
│   ├── login.tsx
│   ├── register.tsx
│   ├── forgotPassword.tsx
│   └── verification.tsx
├── services/
│   └── dictionaryDB.ts                         # IndexedDB JMdict
├── tabs/
│   ├── auth.tsx                                # Auth tab page
│   └── delta-flyer.tsx
├── utils/
│   └── secure-storage.ts
├── background.ts                               # State management, flashcard handler
└── options.tsx                                 # Extension options page
```

---

## 🔧 Key Technologies

- **Framework**: Plasmo 0.90.5 (React-based extension framework)
- **Language**: TypeScript 5.3.3
- **Styling**: Tailwind CSS + PostCSS
- **Dictionary**: IndexedDB (JMdict)
- **Japanese NLP**: kuromoji (tokenization), wanakana (romaji)
- **API**: GraphQL (@apollo/client)
- **Storage**: @plasmohq/storage (chrome.storage wrapper)
- **Subtitle Backend**: Python youtube-transcript-api at ~/projects/ytTranscript (NEW)

---

## 🌐 API Endpoints Used

| Endpoint                                      | Purpose                                                        |
| --------------------------------------------- | -------------------------------------------------------------- |
| `https://api.bundai.app/graphql`              | GraphQL for auth, flashcards                                   |
| `~/projects/ytTranscript`                     | Python script for automated subtitles (youtube-transcript-api) |
| `https://api.bundai.app/subtitles/${videoId}` | Fetch manual subtitle URLs (VTT) - kept for future             |

---

## ⚙️ Configuration

### Manifest Permissions

- `activeTab`, `storage`, `tabs`, `cookies`
- Host permissions: `*://*.youtube.com/*`, `http://localhost:*/*`, `https://api.bundai.app/*`

### Web Accessible Resources

- `tabs/*`, `node_modules/kuromoji/dict/*.dat.gz`, `assets/data/japanese/jmdict-simplified-flat-full.json`

---

## 📝 Mode Logic

**Two Modes:**

1. **API Subtitles** (`useAutoGeneratedSubtitles = false`)

   - Uses `custom-subtitles-container.tsx`
   - Fetches subtitles from Python script (youtube-transcript-api)
   - Dual subtitle overlay (custom container)
   - Tokenized Japanese with word hover
   - Pause video on hover (custom container only)

2. **Auto-Generated** (`useAutoGeneratedSubtitles = true`)

   - Uses YouTube's native subtitle display
   - No custom overlay
   - WordCard integration on YouTube's subtitle elements
   - Leverages YouTube's auto-generated subtitles directly

**Platform Logic:**

- **YouTube**: Can use API Subtitles OR Auto-Generated mode
- **Netflix/Crunchyroll**: Planned for future (same approach: download, upload, or generate subs)
- **Non-YouTube**: Extension disabled (YouTube-only feature for now)

---

## 🐛 Known Issues

1. YouTube page navigation sometimes requires refresh after mode changes (UI shows prompt)
2. Dictionary initial load shows overlay (large JSON ~10-50MB)
3. Auto-generated mode WordCard integration needs implementation

---

## 🎯 Next Priority

1. **Test transcript fetching** - Verify extension fetches from GraphQL endpoint correctly
2. **Test VTT parsing** - Verify custom-subtitles-container.tsx parses VTT properly
3. **Test with various videos** - Ensure Japanese and English subtitles work correctly
4. **User subtitle upload UI** - Add ability to upload VTT/SRT files for videos
5. **Auto-generated mode integration** - Add WordCard to YouTube's native subtitles (future)
6. **Netflix & Crunchyroll support** - Implement after YouTube is complete
