# Bundai Extension — Complete Reference

> The single source of truth. Architecture, history, dictionary system, server stack, subtitle lookup plan, subscription plan, and session notes — all in one place.
>
> Last updated: 2026-08-11

---

## Table of Contents

1. [What Is Bundai Extension?](#1-what-is-bundai-extension)
2. [Ecosystem](#2-ecosystem)
3. [Tech Stack](#3-tech-stack)
4. [Three Subtitle Modes](#4-three-subtitle-modes)
5. [Content Script Pipeline](#5-content-script-pipeline)
6. [Dictionary System](#6-dictionary-system)
7. [Word Selection / Hover System](#7-word-selection--hover-system)
8. [Subtitle Styling](#8-subtitle-styling)
9. [React Component Tree](#9-react-component-tree)
10. [Message Flow](#10-message-flow)
11. [Server Architecture](#11-server-architecture)
12. [ASR History — Every Approach Tried](#12-asr-history--every-approach-tried)
13. [Session Notes (2026-08-10/11)](#13-session-notes-2026-08-1011)
14. [Subtitle Lookup Improvement Plan](#14-subtitle-lookup-improvement-plan)
15. [Subscription + Paddle Integration Plan](#15-subscription--paddle-integration-plan)
16. [Failure Log](#16-failure-log)
17. [Key Numbers](#17-key-numbers)
18. [Key Files Reference](#18-key-files-reference)
19. [Build Instructions](#19-build-instructions)

---

## 1. What Is Bundai Extension?

A Chrome MV3 extension (Plasmo + React + TypeScript) for learning Japanese while watching anime on YouTube. It renders dual subtitles (JP + EN) in a custom container with tokenized word hover for instant dictionary lookups and flashcard creation.

**Core experience:**
- Japanese subtitles appear as Netflix-style one-liners over the video
- Hover any word → instant dictionary popup (WordCard) with meanings, reading, POS
- Video auto-pauses on hover, resumes on mouse leave
- Click a word to create a flashcard (synced to server via GraphQL)
- 447,000-entry dictionary with binary search — lookups in 1-5ms

---

## 2. Ecosystem

| Repo | Role |
|------|------|
| `bundaiExtension` | Primary product — YouTube anime learning (this repo) |
| `bundai` | iOS companion — SRS, kanji deep study |
| `bundaMac` | Desktop app companion |
| `bundaiWeb` | Conversion router, accounts, Paddle checkout |
| `server` | Shared GraphQL backend + REST endpoints (Node.js/Apollo) |
| `api.bundai.app` | Public endpoint for the server (Cloudflare Tunnel → Pi 1) |

---

## 3. Tech Stack

- **Framework**: Plasmo 0.90.5 (Chrome MV3)
- **UI**: React 18, TypeScript 5.3, Tailwind CSS
- **Tokenizer**: kuromoji (Japanese morphological analysis)
- **Dictionary**: Flat-file JMdict (binary search, 447k entries, 110MB on disk)
- **State**: `@plasmohq/storage` (chrome.storage wrapper)
- **GraphQL**: Apollo Client (auth, flashcards, user data)
- **Backend**: Node.js 20 + Apollo Server + Express + Mongoose (MongoDB Atlas)
- **Subtitle fetching**: yt-dlp (standalone, running on Pi 1 via `uv`-installed Python 3.12)
- **ASR** (deferred): Qwen3-ASR-0.6B on Pi 2

---

## 4. Three Subtitle Modes

| Mode | Source | How it works |
|------|--------|-------------|
| **API** | YouTube's own subtitles (manual + auto) | Popup → `GET api.bundai.app/subtitles/{videoId}?subtitle_format=vtt` → Pi 1 shells out to `yt-dlp --dump-json` → returns VTT URLs per language → user picks language → content script fetches the VTT URL directly from YouTube → parses + tokenizes |
| **User** | User uploads .vtt/.srt/.ass file | Popup reads file → parses cues → sends to content script via `loadUserSubtitle` message |
| **ASR** (deferred) | Local Qwen3-ASR model on Pi 2 | Popup → `GET api.bundai.app/asr/subtitles?videoId=X&model=Y` → Pi 1 proxies to Pi 2 → Qwen transcribes → returns JP/EN VTT |

### API mode flow (detailed)
```
Extension popup
  → fetchAndCacheSubtitles(videoId)
  → fetch(`https://api.bundai.app/subtitles/${videoId}?subtitle_format=vtt`)
  → Server endpoint (Pi 1):
      spawn('yt-dlp', ['--list-subs', '--skip-download', '--dump-json', '--no-warnings', videoUrl])
      → Parse stdout JSON
      → Extract subtitles (manual) + automatic_captions (auto)
      → Filter for VTT format URLs
      → Return { langCode: [url, ...] }
  → Extension receives subtitle URL map
  → User selects language from dropdown
  → loadSubtitleInContentScript(url, trackNumber)
  → Content script fetches the YouTube VTT URL directly
  → Parses cues → tokenizes → renders
```

### User upload flow
```
Extension popup
  → User selects .vtt/.srt/.ass file
  → parseSubtitleText(text, fileName) → SubtitleCue[]
  → chrome.tabs.sendMessage(tab.id, { action: "loadUserSubtitle", trackNumber, cues })
  → Content script receives cues → stores in subtitle1Data/subtitle2Data
```

---

## 5. Content Script Pipeline

**File**: `contents/custom-subtitles-youtube.tsx` (~2300 lines)

### Initialization
```
YouTube page loads
  → Constructor: setupMessageListener(), initializeJapanese(), requestInitialState()
  → initializeJapanese():
      ├── kuromoji.builder({ dicPath: node_modules/kuromoji/dict/ }).build()
      └── dictionaryService.initialize() → loads words.idx + words.ljson
      → isInitialized = true

  → init() → findAndSetupVideo() → createSubtitleContainer()
```

### Subtitle update loop (100ms interval)
```
updateSubtitles()
  → Find cue matching video.currentTime
  → If new cue text: processSubtitleElement(element, text)
      ├── Normalize text (strip newlines, collapse spaces)
      ├── Check: isJapaneseEnabled && isInitialized && isJapaneseText()
      ├── tokenizeJapanese(text) via kuromoji → tokens[]
      ├── Wrap each char in <span data-char-index data-token-id data-reading ...>
      ├── Attach mouseenter/mouseleave/click handlers per char span
      ├── precomputeTokenMatches() — background dictionary lookup per token
      └── Store in tokenMatchCache keyed by generation:tokenStartIndex
```

### Hover pipeline
```
User hovers a character:
  → mouseenter → 20ms debounce → handleCharacterHover(charIndex, ...)
  → getTokenStartIndex() → tokenMatchCache.get() → synchronous result (95% of time)
  → If cache miss → findBestMatch() progressive matching (async fallback)
  → highlightRegion() — highlight matched word
  → WordCard popup with dictionary entry + flashcard button

Mouse enters subtitle area:
  → handleSubtitleMouseEnter() → video.pause()
Mouse leaves subtitle area:
  → handleSubtitleLeave() → video.play()
```

### Token-first precomputed match system (current)
```
subtitle appears → precomputeTokenMatches()
  → for each token: lookup surface_form → basic_form → deinflected forms
  → store in tokenMatchCache keyed by generation:tokenStartIndex

user hovers → getTokenStartIndex(charIndex) → cache.get() → synchronous result
```
- ~95% of hovers are synchronous (no async, no DOM queries)
- Progressive matching still exists as safety net for cache misses

---

## 6. Dictionary System

### Evolution

| System | When | Performance | Status |
|--------|------|-------------|--------|
| IndexedDB (JMdict JSON) | Original | 50–200ms, 50MB RAM | Deprecated |
| Flat-file binary search | Feb 2026 | 1–5ms, 110MB disk | Current |

### Flat-file dictionary

**File**: `services/flat-file-dictionary.ts`

```
words.idx (3.4MB) — binary index:
  [count (4 bytes)][offset (4 bytes) + length (4 bytes)] per entry
  447,546 entries

words.ljson (107MB) — line-delimited data:
  "word\t[{entry_json}]\n" per line

binarySearch(word) — O(log n), ~19 iterations for 447k entries
LRU cache (500 entries)
```

### Dictionary service

**File**: `services/dictionary-service.ts`

```
lookup(word)
  ├── generateVariants(word):
  │   ├── Original word
  │   ├── NFKC normalization
  │   ├── Full-width ↔ half-width number conversion
  │   ├── Kyuujitai → shinjitai conversion (學→学, 國→国, etc.)
  │   └── Choon (ー) expansion
  ├── For each variant: flatFileDictionary.lookup(variant)
  └── selectBestEntry(entries, options)

lookupWithDeinflect(word)
  ├── Try exact lookup first
  ├── If not found: deinflect(word) → try each deinflected form
  └── selectBestEntry(entries, options)

selectBestEntry(entries, options)
  ├── POS filtering (kuromoji POS tags → JMdict POS tags)
  ├── Reading disambiguation (katakana → hiragana, match against entry kana)
  └── Numeric context detection (digits + counters like 間/前/後 → prefer time-unit glosses)
```

### Deinflection

**File**: `services/deinflect.ts`

Rule-based suffix stripping for verb/adjective conjugations. Single-pass only (no stacked forms like causative+passive+past). Uses bitmask-based word type system (ichidan, godan, i-adj, etc.).

### Build script

**File**: `scripts/build-dictionary.py`

Converts `jmdict-simplified-flat-full.json` (82MB) → `words.idx` + `words.ljson`. Run once to generate dictionary files (gitignored due to size).

### Variant generation details
```python
generateVariants(word):
  - Original: word
  - NFKC normalized: word.normalize("NFKC")
  - Full-width numbers: 123 → １２３
  - Half-width numbers: １２３ → 123
  - Kyuujitai → shinjitai: 學→学, 國→国, 體→体, ...
  - Choon expansion: ー → extended vowel variants
```

---

## 7. Word Selection / Hover System

### History of bugs (2026-04-25)

| Bug | Root Cause | Symptom |
|-----|-----------|---------|
| **Limit clamped at hover position** | `limit = Math.min(maxLength, startIndex - candidateStartIndex + 1)` | Hovering first char of "答え" only tried "答" |
| **Stale hover on subtitle change** | 20ms debounce fires with old `charIndex`, queries new DOM | Getting "び/美" while hovering "答えは" |
| **Document-wide querySelector** | Both subtitle tracks share `data-char-index` → wrong track found | EN subtitle data returned for JP hover |
| **Single kanji dropped reading** | `isSingleKanji` guard zeroed out `readingForLookup` | 間 → random entry instead of kuromoji reading (あいだ/ま/かん) |
| **Over-highlighting particles** | `hasAuxOrParticle` branch returned `chars.length` not `matchedLength` | "食べた" highlighted 3 chars instead of 2 |

### Fixes applied
- Fixed limit calculation → always use `maxLength`
- Added `subtitleGeneration` counter → stale hovers silently abort
- Scoped all `querySelector` calls to subtitle element
- Always pass kuromoji reading (removed `isSingleKanji` guard)
- Fixed highlight length in `hasAuxOrParticle` branch
- Added `tokenMatchCache` (lazy, keyed by `generation:startIndex`)
- Token-first rewrite: precompute matches when subtitle appears, cache hit on hover

---

## 8. Subtitle Styling

- Container: `position: fixed`, centered, bottom-aligned, `max-width: 80%`
- Subtitle elements: `white-space: nowrap` (Netflix-style one-liner), bold, dark background, rounded corners
- Two tracks stacked vertically (JP top, EN bottom)
- Position adjustable via popup (vertical position slider)
- Styles persist via `chrome.storage`
- Configurable: background color, text color, font size, opacity, border radius, vertical position, fullscreen vertical position

### CSS (applied via `applySubtitleStyles`)
```css
background: rgba(0, 0, 0, 0.9);
color: #ffffff;
font-size: 40px;
font-family: Arial, sans-serif;
font-weight: bold;
padding: 8px 16px;
border-radius: 8px;
text-align: center;
text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
line-height: 1.4;
white-space: nowrap;
max-width: 90vw;
overflow: hidden;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
```

---

## 9. React Component Tree

```
popup/index.tsx (Plasmo popup)
  ├── Subtitle mode toggle (API / User / ASR)
  ├── SubtitlesSection.tsx — language dropdowns, fetch button
  │   ├── Track 1 (top) — select from available languages or upload file
  │   └── Track 2 (bottom) — select from available languages or upload file
  ├── ASR section (deferred) — model selector, generate button
  └── Subtitle styling — bg color, text color, font size, opacity, border radius

contents/custom-subtitles-youtube.tsx (content script, ~2300 lines)
  ├── YouTubeSubtitleContainer class
  │   ├── Subtitle rendering + update loop (100ms interval)
  │   ├── Kuromoji tokenization
  │   ├── Dictionary lookup (precomputed + fallback)
  │   ├── Hover/click handlers per character span
  │   ├── Video pause/play on hover
  │   ├── precomputeTokenMatches() — background dict lookups per token
  │   ├── handleCharacterHover() — cache.get() synchronous, fallback async
  │   ├── findBestMatch() — progressive matching (fallback only)
  │   └── React WordCard mount (createReactWordCard)
  └── WordCardManager → WordCard component

components/WordCard.tsx
  ├── Dictionary entry display (word, reading, meanings, POS)
  ├── Flashcard creation (sends to server via GraphQL mutation)
  └── Sticky mode (click to pin, click away to close)

components/SubtitlesSection.tsx
  ├── Language dropdown (from API subtitle response)
  ├── File upload (.vtt, .srt, .ass)
  ├── Time offset adjustment (±0.1s, ±0.5s buttons)
  └── Selection persistence per video (chrome.storage)

components/UserSubtitleUpload.tsx
  └── File parsing (VTT, SRT, ASS formats)
```

---

## 10. Message Flow

### Popup ↔ Content Script

| Message | Direction | Purpose |
|---------|-----------|---------|
| `loadSubtitle` | popup → content | Send VTT URL for a track |
| `loadUserSubtitle` | popup → content | Send parsed cues from uploaded file |
| `loadAsrSubtitle` | popup → content | Send ASR-generated cues |
| `clearAsrSubtitle` | popup → content | Clear ASR cues |
| `clearUserSubtitle` | popup → content | Clear a user-uploaded track |
| `setSubtitleMode` | popup → content | Switch mode (API/User/ASR) |
| `getPlaybackState` | popup → content | Get video.currentTime |
| `getSubtitleMode` | popup → background | Get current subtitle mode |
| `enabled` | background → content | Toggle extension on/off |
| `styling` | popup → content | Update subtitle CSS |

### Background script (`background.ts`)
- Message routing between popup and content scripts
- State persistence (`extensionState`: enabled, subtitleMode)
- Broadcasts subtitle mode changes to all tabs
- Handles auth token storage (SecureStorage)

---

## 11. Server Architecture

### Pi stack

| Pi | Hostname | IP | Role | Status |
|----|----------|-----|------|--------|
| Pi 1 | `bundai1` | `192.168.50.229` | Original API server (Node.js 20, Apollo, Express, MongoDB Atlas) + yt-dlp subtitle fetching | Code host only — app DOWN since 2026-08-13 reboot (pm2 not resurrected, cloudflared disabled) |
| Pi 2 | `bundai2` | `192.168.50.156` | ASR worker (Qwen3-ASR-0.6B, Python 3.12, yt-dlp) + `/subtitles` listing service with per-video cache | Live |
| Pi 3 | `bundai3` | `192.168.50.45` | **Live origin for `api.bundai.app`**: runs cloudflared tunnel (systemd, active) + bundai Node server on :3000 — older build (has `/graphql` + `/asr/*` proxy to Pi 2, lacks `/subtitles/:videoId`) | Live (discovered 2026-08-14) |
| Pi 4 | — | — | Cold spare / future HA | Available |

**IMPORTANT (2026-08-14):** `api.bundai.app` is served by **Pi 3**, not Pi 1. Pi 1 and Pi 3 rebooted simultaneously on 2026-08-13; Pi 3's cloudflared auto-started and it took over the tunnel. Pi 1's cloudflared unit is `disabled` and its pm2 table is empty. `server/index.js` on Pi 1 remains the newest code (has `/subtitles/:videoId`); Pi 3 runs a stale build.

Both Pi 4 boards (4GB RAM, Bullseye). Pi 1 is exposed publicly via Cloudflare Tunnel.

### Server endpoints (Pi 1, `server/index.js`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/graphql` | POST | Apollo GraphQL (auth, flashcards, kanji, anime vocab) |
| `/subtitles/:videoId` | GET | YouTube subtitle listing via yt-dlp (returns `{ lang: [vtt_url] }`) |
| `/asr/health` | GET | ASR service health check |
| `/asr/subtitles` | GET | ASR subtitle generation (proxied to Pi 2) |
| `/asr/jobs/start` | GET | Start async ASR job |
| `/asr/jobs/status` | GET | Check ASR job status |
| `/asr/jobs/latest` | GET | Get latest ASR job for a video |

### `/subtitles/:videoId` endpoint details

Shells out to yt-dlp on Pi 1:
```
spawn('/home/bundai/.local/bin/yt-dlp', [
  '--list-subs', '--skip-download', '--dump-json', '--no-warnings',
  videoUrl
])
```
- Parses stdout JSON for `subtitles` (manual) and `automatic_captions` (auto-generated)
- Filters for VTT format URLs
- Returns `{ langCode: [url, ...] }`
- Tries to parse stdout even on non-zero exit (yt-dlp sometimes exits with warnings but still outputs JSON)
- Cookies from extension are currently **ignored** (YouTube auth cookies cause yt-dlp failures via `--add-headers`; Netscape cookies file approach attempted but deferred)

### Pi 1 yt-dlp setup (legacy — no longer used)
> **Note:** Pi 1 no longer runs yt-dlp. The `/subtitles/:videoId` endpoint is now a pure HTTP proxy to Pi 2. The following cruft remains on Pi 1 from the initial attempt and is harmless but unnecessary:
- `~/.local/bin/uv` + `~/.local/share/uv/` — uv installer + standalone Python 3.12
- `~/.local/bin/yt-dlp` — uv tool-installed yt-dlp with EJS plugin
- `/usr/local/bin/yt-dlp` — old standalone binary (first failed attempt, v2024.12.13)
- To clean up: `rm -rf ~/.local/bin/uv ~/.local/bin/yt-dlp ~/.local/share/uv && sudo rm -f /usr/local/bin/yt-dlp`

### Pi 2 setup (current — handles yt-dlp + ASR)
- Python 3.12 venv (`~/.venvs/qwen3-asr`) with `torch`, `qwen_asr`, `yt-dlp` (v2026.07.04), `yt-dlp-ejs` (v0.8.0)
- Deno 2.9.5 installed at `/usr/local/bin/deno` (symlinked from `~/.deno/bin/deno`) — required JS runtime for yt-dlp's n-challenge solver
- Qwen3-ASR-0.6B model (loads on 4GB RAM with 2GB swap)
- HTTP service `~/asr_service.py` on `:8088`:
  - `GET /health` — health check
  - `GET /subtitles?videoId=X&format=vtt` — YouTube subtitle listing via yt-dlp (current)
  - `POST /transcribe` — ASR transcription via Qwen (deferred)
- systemd service `bundai-asr` (autostarts)
- Pi 1 proxies subtitle requests via `BUNDAI_ASR_SERVICE_URL=http://192.168.50.156:8088`
- Extension also calls Pi 2 directly: `http://192.168.50.156:8088/subtitles`

### Operations
| Task | Command |
|------|---------|
| SSH Pi 1 | `sshpass -p '84pk8uu3K' ssh bundai@192.168.50.229` |
| SSH Pi 2 | `sshpass -p '84pk8uu3K' ssh bundai@192.168.50.156` |
| SSH Pi 3 (live api origin) | `sshpass -p '84pk8uu3K' ssh bundai@192.168.50.45` |
| App status (Pi 1) | `ssh bundai@192.168.50.229 'pm2 status'` |
| App logs (Pi 1) | `ssh bundai@192.168.50.229 'pm2 logs bundai --lines 50'` |
| Restart app (Pi 1) | `ssh bundai@192.168.50.229 'pm2 restart bundai'` |
| Restart ASR service (Pi 2) | `ssh bundai@192.168.50.156 'sudo systemctl restart bundai-asr'` |
| GraphQL (public) | `POST https://api.bundai.app/graphql` (origin: Pi 3) |
| GraphQL (LAN) | `POST http://192.168.50.45:3000/graphql` |
| ASR worker health | `curl http://192.168.50.156:8088/health` |

### Cloudflare setup
- `api.bundai.app` → Cloudflare Tunnel → Pi 1:3000
- No router port-forward, no exposed home IP, HTTPS automatic
- `cloudflared` runs as systemd service (survives reboots)
- `bundai.app` (apex) + `www` stay on Netlify as DNS-only records

### Pi hardware constraints
1. **OS must be Bullseye** — Pi 4 boards have old bootloader EEPROM that won't boot Bookworm/Trixie
2. **MongoDB capped at 4.4.18** — Pi 4 (ARMv8.0-A) can't run MongoDB ≥ 4.4.19 (requires ARMv8.2-A → SIGILL). Uses Atlas instead.
3. **WiFi country**: BD (Bangladesh), SSID: Sawda

---

## 12. ASR History — Every Approach Tried

### 12.1 Original Local Server (Python, yt-dlp CLI + openai-whisper CLI)

**File**: `scripts/local_asr_server.py` (deprecated)

Ran on `127.0.0.1:8765`. Called `yt-dlp` as subprocess to download YouTube audio, then `whisper` CLI to transcribe.

**Why it failed:**
- `yt-dlp` CLI binary was a Python wrapper script that couldn't find its `yt_dlp` module
- Both tools needed to be installed as system binaries, fragile cross-platform
- No model caching, re-downloaded everything each run

### 12.2 Browser Whisper (`@huggingface/transformers` + ONNX Runtime WASM)

**When**: 2026-02-26 (entire day, 14 version bumps)

| Attempt | Technique | Why it failed |
|---------|-----------|---------------|
| Static import | Direct import of `@huggingface/transformers` | Parcel tree-shook the module; missing from bundle |
| Runtime URL import | `import(chrome.runtime.getURL(...))` | CSP blocked `unsafe-eval` for `new Function()` |
| Direct static | Static import of `.web.js` build | References `onnxruntime-web` / `onnxruntime-common` — not resolved in extension context |
| Worker module | Dedicated `whisper-worker.mjs` loaded via `new Worker(url, {type:"module"})` | Worker couldn't find its own ORT WASM dependencies |
| Bundled TS worker | Parcel-bundled TypeScript worker entry | Module specifier resolution failed for WASM paths |
| Static assets + shims | `prepare-browser-whisper-runtime.mjs` copied runtime files + created shim modules | Extension CSP blocked external `script-src`, WASM paths broken |
| Tab audio capture | `chrome.tabCapture` → MediaRecorder → decode → resample to 16kHz mono | Audio pipeline worked, but Whisper runtime never loaded reliably |

**Result**: Total failure. Parcel + CSP + ONNX WASM + Chrome extension = combinatorial hell. Abandon in-browser ML.

### 12.3 Browser Whisper + Local Server Hybrid

Popup offered two backends:
- "Local Server" → `127.0.0.1:8765`
- "Browser Whisper" → The broken transformers.js runtime

Both were non-functional. Dual radio buttons confused users.

### 12.4 Python ASR Server (yt-dlp library + faster-whisper)

**When**: 2026-04-23

Moved from subprocess CLI → Python library imports:
- `yt_dlp.YoutubeDL` class (no more binary path issues)
- `faster_whisper.WhisperModel` (CTranslate2 backend, 4x faster)

Architecture:
```
Extension popup → HTTP GET /subtitles?videoId=X&model=tiny
  → bundai-asr/server.py
  ├── yt_dlp.YoutubeDL: download best audio → WAV
  ├── faster_whisper.WhisperModel("tiny"): transcribe → ja.vtt
  └── faster_whisper.WhisperModel("tiny"): translate → en.vtt
```

### 12.5 Pi-based ASR (Qwen3-ASR — current, deferred)

**When**: 2026-08-09

- Pi 2 runs Qwen3-ASR-0.6B model in Python 3.12 venv
- HTTP service on `:8088` with `GET /health`, `POST /transcribe`
- Pi 1 (API server) offloads ASR work to Pi 2 via `BUNDAI_ASR_SERVICE_URL`
- Cache/jobs/locks stay on Pi 1
- Extension calls `api.bundai.app/asr/subtitles` → Pi 1 → Pi 2

### What was removed from extension (cleanup)
- `@huggingface/transformers` dependency (saved ~52 packages)
- Browser Whisper UI (backend radio buttons, model selector)
- Tab audio capture (`chrome.tabCapture`, `MediaRecorder`, audio resampling)
- Whisper Web Worker (`assets/whisper-worker.mjs`)
- ONNX Runtime WASM assets (`assets/onnxruntime/`, `assets/transformers/`)
- `tabCapture` permission from manifest
- `prepare-browser-whisper-runtime.mjs` build step
- All `browserWhisper*` state and refs from popup

---

## 13. Session Notes (2026-08-10/11)

### 13.1 Server: Added `/subtitles/:videoId` endpoint

**Problem**: Extension's "API Subtitles" mode called `GET api.bundai.app/subtitles/{videoId}?subtitle_format=vtt` but this endpoint **never existed** on the server. Every request 404'd.

**Fix**: Added REST endpoint to `server/index.js`:
- Shells out to `yt-dlp --list-subs --skip-download --dump-json --no-warnings`
- Parses JSON output for `subtitles` (manual) and `automatic_captions` (auto-generated)
- Filters for VTT format URLs
- Returns `{ langCode: [url, ...] }`

**Pi 1 setup:**
- Installed Python 3.12 via `uv` (system Python 3.9 too old for latest yt-dlp)
- Installed yt-dlp + yt-dlp-ejs via `uv tool install yt-dlp --with yt-dlp-ejs --python 3.12 --force`
- EJS plugin required for YouTube's n-challenge solver

**Cookies issue**: Real YouTube auth cookies cause yt-dlp to fail with "Requested format is not available" via `--add-headers`. Current workaround: cookies are ignored. Works for all public videos.

**Resilience**: Endpoint tries to parse stdout JSON even on non-zero yt-dlp exit codes.

### 13.2 Dictionary files were missing

**Problem**: `words.idx` + `words.ljson` missing from source tree (`*.ljson` in `.gitignore`). Without these, `dictionaryService.initialize()` fails → `isInitialized` stays `false` → subtitles render as plain text (no tokenization, no hover, no pause).

**Fix**:
- Restored `jmdict-simplified-flat-full.json` (82MB) from git history (commit `b41e87a`)
- Ran `scripts/build-dictionary.py` to regenerate `words.idx` (3.4MB) + `words.ljson` (107MB)
- Rebuilt extension with dictionary assets included

### 13.3 Netflix-style one-liner subtitles

**Problem**: `white-space: pre-wrap` + `word-wrap: break-word` caused multi-line wrapping.

**Fix**:
- Changed to `white-space: nowrap`, removed `word-wrap: break-word`
- Added newline normalization in `processSubtitleElement()` (strips `\n`, collapses spaces)

### 13.4 Dictionary lookup performance

**Problem**: `binarySearch()` had ~19 `console.log` calls per lookup (one per iteration of 447k-entry binary search).

**Fix**: Stripped all debug logs from `binarySearch()`, `loadIndexFile()`, `loadDataFile()`. Lookups now silent and fast.

### 13.5 ASR URL changes (deferred)

- `127.0.0.1:8765` → `https://api.bundai.app/asr` (routes through Pi 1's proxy to Pi 2)
- Feature 2 is deferred — user focusing on Feature 1

### 13.6 Server deployment

- Server is NOT a git repo on the Pi — patches applied via Python scripts (base64-encoded over SSH)
- pm2 process name: `bundai`
- SSH: `sshpass -p '84pk8uu3K' ssh bundai@192.168.50.229`
- Cloudflare Tunnel: `api.bundai.app` → Pi 1:3000 *(outdated — see 13.7; live origin is Pi 3)*

### 13.7 Session 2026-08-14: yt-dlp timeouts, Pi 2 cache, Pi 3 discovery

**Timeout fixes (yt-dlp `--list-subs`):**
- Pi 2 `asr_service.py` subprocess timeout: 30s → **120s** (Pi 4 needs ~36s for some videos; 30s killed them)
- Pi 1 `server/index.js` proxy timeout: `AbortSignal.timeout(45000)` → **95000** (must stay under Cloudflare's ~100s edge limit)
- Verified end-to-end: previously-failing video `7stgWxH5478` now returns 200 in ~36.4s

**Per-video list-subs cache on Pi 2 (`~/asr_cache/`):**
- `handle_list_subtitles()` now reads/writes `listsubs_{videoId}_{fmt}.json`
- Validity is **expire-aware**: capped at min URL `expire=` param minus 600s margin (YouTube caption URLs are signed, ~6h life), max TTL 6h, negative results cached 1h
- Atomic writes (tmp + `os.replace`); env-tunable: `BUNDAI_LIST_SUBS_CACHE_DIR`, `BUNDAI_LIST_SUBS_TTL`
- Verified: cold 37.1s → warm **0.57s**, identical payloads
- Note: `HTTPServer` is single-threaded — one cold call blocks concurrent requests (incl. `/health`). Acceptable now; switch to `ThreadingHTTPServer` if it bites.

**Pi 3 is the live `api.bundai.app` origin:**
- `api.bundai.app` → Cloudflare → tunnel 3264d0ec → **Pi 3 (192.168.50.45, `bundai3`):3000**
- Pi 3 build is stale: has `/graphql` + `/asr/*` proxy (→ Pi 2:8088), lacks `/subtitles/:videoId` (404s publicly)
- Extension unaffected for subtitles (popup hits Pi 2 :8088 directly via `SUBTITLE_SERVICE_URL`)
- Backups on Pi 2: `asr_service.py.bak`, `asr_service.py.pre-cache`

### Current state after session

**What works:**
- API Subtitles mode: Fetches YouTube subtitles via yt-dlp on Pi 1
- Netflix-style one-liner display
- Dictionary lookup: 447k entries, fast binary search
- Hover popups: WordCard with dictionary entries, flashcard creation
- Video pause: Auto-pause on subtitle hover
- User Upload mode: Upload your own .vtt/.srt/.ass files

**Known issues / TODO:**
- Cookies: Not passed to yt-dlp (public videos only)
- Deinflection: Single-pass only, misses stacked conjugations
- No phrase dictionary for common multi-token expressions
- Binary search uses JS default string comparison (may not match Python's sorted() for supplementary plane characters — negligible for Japanese text)

---

## 14. Subtitle Lookup Improvement Plan

### Goals
- Match 10Ten-level word coverage for hover lookups
- Fix current errors where words exist in the dictionary but are not found
- Disambiguate homographs like "十分" using reading context
- Keep performance fast (≤5ms lookup where possible)

### Completed phases

- **Phase 1** ✅: Binary search uses code-point ordering (JS `<` operator), matches Python's `sorted()`
- **Phase 2** ✅: Dictionary build stores all entries per surface form (JSON array per word)
- **Phase 3** ✅: Reading-aware entry selection (katakana → hiragana, match against entry kana)
- **Phase 4** ✅: Hover anchoring (token boundaries, `getTokenStartIndex`)
- **Phase 5** ✅: Normalization and variants (choon, kyuujitai, full/half-width numbers, NFKC)

### Remaining phases

**Phase 6: Deinflection Improvements**
- Add full multi-step deinflection with type checks
- Show deinflection reasons in the WordCard UI
- Currently single-pass only, misses stacked conjugations (causative+passive+past)

**Phase 7: Phrase List (1k–5k) + Corpus-Driven Improvements**
- Build a compact phrase list from subtitle corpora (PMI / t-score / frequency)
- Keep only phrases that appear across many shows (general Japanese)
- Include base-form mapping + gloss for each phrase
- Use phrases only when they improve confidence (never block single-word matches)

**Phase 8: Audio + Subtitle Alignment (optional but powerful)**
- Align subtitle lines to audio timestamps (forced alignment)
- Use aligned clips to add "audio playback" for WordCard entries
- Use alignment to improve sense selection by context (spoken usage)

### LLM-Assisted Offline Workflow (local models)
- Use local LLMs to:
  - Suggest phrase candidates and filter junk
  - Disambiguate homographs using surrounding text
  - Generate short definitions/usage notes (optional)
- Training the extension itself is not needed; use LLMs to generate better lookup data

### Acceptance checks
- Hovering any character inside こいつら returns こいつら
- Hovering それで returns それで, not 祖
- Hovering 十分 with reading じゅうぶん returns "enough", not "ten minutes"
- Regression checks: 人類 and other known-good words still match

---

## 15. Subscription + Paddle Integration Plan

### Overview
Extension is the paid entry point. Web app handles signup + payment via Paddle. Extension just checks `hasPaid` from `me` query.

**Traffic flows: website → extension** (not extension → website).

### Pricing
- Monthly: $8.99/mo
- Yearly: $29.99/yr
- Lifetime: $69 (occasional promo, not now)

### Flow
```
User lands on bundai.app → signs up → Paddle checkout → pays
→ Paddle webhook hits server → server sets hasPaid=true
→ User installs extension → logs in → extension checks hasPaid → allows access
```

### Phase 1: Extension Changes — Paywall
1. "Sign Up" button opens `bundai.app/signup` in new tab
2. Add `hasPaid` check after login (`me` query) → if false, show paywall
3. Check subscription on video load (re-fetch `me` before fetching subtitles)
4. No free tier for extension — fully gated behind subscription

### Phase 2: Web App Changes — Paddle Checkout
1. Install `@paddle/paddle-js`, remove unused Stripe packages
2. If logged in but `hasPaid === false` → open `Paddle.Checkout.open()`
3. Paddle.js init with sandbox mode for testing
4. After checkout success → redirect to dashboard, refresh `me` query

### Phase 3: Server Changes — Webhooks + Subscription State
1. Add `POST /webhooks/paddle` endpoint (verify signature)
2. Update User model: `paddleCustomerId`, `paddleSubscriptionId`, `subscriptionStatus`
3. Update GraphQL schema: `hasPaid: Boolean`, `subscriptionStatus: String`
4. Env vars: `PADDLE_WEBHOOK_SECRET`, `PADDLE_VENDOR_ID`, `PADDLE_CLIENT_AUTH_CODE`

### Phase 4: Testing (Sandbox)
1. Use Paddle sandbox test cards
2. Test: signup → checkout → webhook → `hasPaid` set to true
3. Test: login in extension → `hasPaid` check passes → full access
4. Test: cancel subscription → webhook → `hasPaid` set to false → extension locked

### Current User Model (`server/models/user.model.js`)
```js
{
  email: String,
  password: String,
  hasPaid: Boolean,           // exists but never set
  stripeCustomerId: String,   // exists but never used (switch to Paddle)
}
```

### Prerequisites
1. Paddle account with sandbox mode enabled
2. Two subscription products created in Paddle sandbox (Monthly $8.99, Yearly $29.99)
3. Paddle seller ID and client token from dashboard
4. Webhook URL configured: `https://api.bundai.app/webhooks/paddle`

---

## 16. Failure Log

| Date | What | Lesson |
|------|------|--------|
| 2026-02-26 | 14 attempts to bundle `@huggingface/transformers` in MV3 extension | Parcel + CSP + ONNX WASM + Chrome extension = combinatorial hell. Abandon in-browser ML. |
| 2026-02-25 | Agent/grammar modes in iOS app (llama.rn + whisper.rn) | AI tutor UX too complex. Replaced with deterministic scenario practice. |
| 2026-04-21 | `yt-dlp` CLI downloads (local_asr_server.py) | Python binary wrappers break across environments. Use library imports. |
| 2026-04-25 | Progressive character matching for word selection | kuromoji already knows word boundaries. Don't re-discover them. Trust the tokenizer. |
| 2026-08-10 | `*.ljson` in `.gitignore` — dictionary files silently missing | Large data files must be documented in setup instructions, not just gitignored. |
| 2026-08-10 | Server `/subtitles/:videoId` endpoint never existed | The extension was calling a non-existent endpoint since the API mode was written. Always smoke-test endpoints end-to-end. |
| 2026-08-10 | YouTube auth cookies cause yt-dlp format extraction failure | Auth cookies change YouTube's player response. Use Netscape cookies file or skip cookies for public videos. |
| 2026-08-10 | yt-dlp 2024.12.13 can't handle YouTube's current player (nsig) | yt-dlp must be kept up-to-date. Use `uv tool install` with `--force` to update. |
| 2026-08-10 | Pi 1 Python 3.9 too old for latest yt-dlp (needs 3.10+) | Use `uv python install 3.12` for standalone Python that doesn't touch system Python. |
| 2026-08-13 | Pi 1 + Pi 3 simultaneous reboot: Pi 1's cloudflared (disabled) + pm2 (no resurrect) never came back; Pi 3's cloudflared auto-started and silently became the live `api.bundai.app` origin with a STALE build | Infrastructure drift is invisible without monitoring. One host per public role, `systemctl enable` everything meant to survive reboots, `pm2 startup + pm2 resurrect`, and alert on origin identity (e.g. version header). |
| 2026-08-14 | `--list-subs` on Pi 4 takes ~36s (6s on desktop) — 30s subprocess timeout killed it | Never port desktop timings to Pi hardware. Budget 3–6x. |

---

## 17. Key Numbers

| Metric | Value |
|--------|-------|
| Extension version | 2.4.0+ |
| Dictionary entries | 447,546 |
| Dictionary size | 110MB (idx 3.4MB + ljson 107MB) |
| Dict lookup time | 1–5ms (cached), ~19 iterations binary search (uncached) |
| Dict LRU cache | 500 entries |
| Kuromoji dict size | ~6MB (compressed .dat.gz files) |
| ASR model options | Qwen3-ASR-0.6B (Pi 2, deferred) |
| ASR server (Pi 2) | `192.168.50.156:8088` |
| API server (Pi 1) | `192.168.50.229:3000` → `api.bundai.app` |
| Content script size | ~2,300 lines |
| Subtitle update interval | 100ms |
| Hover debounce | 20ms |
| Cache hit rate (hover) | ~95% synchronous |
| Tokens precomputed per subtitle | Typically 5–15 |

---

## 18. Key Files Reference

| File | Role |
|------|------|
| `popup/index.tsx` | Extension popup (subtitle mode toggle, fetch, ASR, styling) |
| `components/SubtitlesSection.tsx` | Language selection dropdowns, file upload, sends URLs to content script |
| `components/WordCard.tsx` | Dictionary popup, flashcard creation |
| `contents/custom-subtitles-youtube.tsx` | Content script: subtitle rendering, tokenization, hover, video pause (~2300 lines) |
| `services/flat-file-dictionary.ts` | Binary search JMdict dictionary, LRU cache |
| `services/dictionary-service.ts` | Variant generation + deinflection + selectBestEntry |
| `services/deinflect.ts` | Rule-based suffix stripping |
| `background.ts` | Message routing, state persistence, auth token |
| `graphql/` | Apollo client, mutations, queries |
| `hooks/useSubtitle.ts` | REST subtitle fetch hook (unused, legacy) |
| `utils/subtitleParser.ts` | VTT/SRT/ASS parsing utilities |
| `scripts/build-dictionary.py` | Generates words.idx + words.ljson from JMdict JSON |
| `assets/data/japanese/words.idx` | Dictionary binary index (3.4MB, gitignored) |
| `assets/data/japanese/words.ljson` | Dictionary data file (107MB, gitignored) |
| `assets/data/japanese/jmdict-simplified-flat-full.json` | JMdict source (82MB, gitignored) |
| `server/index.js` | API server (Node.js) with `/subtitles/:videoId`, `/asr/*`, `/graphql` |

---

## 19. Build Instructions

### Prerequisites
- Node.js 18+
- pnpm
- Python 3 (for dictionary build script)

### First-time setup
```bash
# Install deps
pnpm install

# Generate dictionary files (if missing)
# First restore jmdict-simplified-flat-full.json from git or download
python3 scripts/build-dictionary.py
# → generates assets/data/japanese/words.idx + words.ljson
```

### Version tracking (IMPORTANT — read before every build)
- Current extension version: **2.5.14** (stored in `package.json` `"version"` field).
- **RULE: Before every rebuild, increment the version in `package.json` by +1** (e.g. 2.5.14 → 2.5.15). Never rebuild without bumping, and never leave the version unchanged between builds.
- The user must be able to tell a new build apart by the version number (they check `chrome://extensions`).
- After bumping, run `pnpm build` — the built `manifest.json` must show the new version.

### Build
```bash
pnpm run build
# → outputs to build/prod/ (chrome-mv3)
```

### Load in Chrome
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `build/prod/`

### Dev mode
```bash
pnpm run dev
# → Plasmo dev server with hot reload
```

### Build output structure
```
build/prod/
  ├── manifest.json
  ├── popup.html + popup.*.js
  ├── options.html + options.*.js
  ├── custom-subtitles-youtube.*.js + .css
  ├── tabs/
  ├── static/
  ├── node_modules/kuromoji/dict/*.dat.gz
  └── assets/data/japanese/
      ├── words.idx (3.4MB)
      └── words.ljson (107MB)
```

### Server deployment (Pi 1)
```bash
# SSH in
sshpass -p '84pk8uu3K' ssh bundai@192.168.50.229

# Restart server
pm2 restart bundai

# Check status
pm2 status
pm2 logs bundai --lines 50
```

---

*This file consolidates: `HISTORY.md`, `subtitle-lookup-plan.md`, `PADDLE_IMPLEMENTATION_PLAN.md`, and `SESSION_2026-08-11.md`. It is the single source of truth for the extension's architecture, history, server stack, plans, and roadmap.*
