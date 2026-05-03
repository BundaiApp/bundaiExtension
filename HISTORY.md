# Bundai Extension — Complete History & Technical Reference

> One file. Every ASR approach, every selection bug, every fix, the current architecture, and the plan.
> Last updated: 2026-04-25 | Version: 2.4.0

---

## 1. What Is Bundai Extension?

A Chrome MV3 extension (Plasmo + React + TypeScript) for learning Japanese while watching anime on YouTube. It renders dual subtitles (JP + EN) in a custom container with tokenized word hover for instant dictionary lookups and flashcard creation.

**Ecosystem**:
| Repo | Role |
|------|------|
| `bundaiExtension` | Primary product — YouTube anime learning |
| `bundai` | iOS companion — SRS, kanji deep study |
| `bundaMac` | Desktop app companion |
| `bundaiWeb` | Conversion router, accounts |
| `bundai-asr` | Standalone ASR server (Python, faster-whisper) |
| `api.bundai.app` | Shared GraphQL backend |

**Tech stack**: Plasmo 0.90.5, React 18, TypeScript 5.3, kuromoji (tokenizer), flat-file JMdict (binary search dictionary), Tailwind CSS.

---

## 2. ASR History — Every Approach Tried

### 2.1 Original Local Server (Python, yt-dlp CLI + openai-whisper CLI)

**File**: `scripts/local_asr_server.py` (now deprecated)

**What it did**: Ran on `127.0.0.1:8765`. Called `yt-dlp` as a subprocess to download YouTube audio, then `whisper` CLI to transcribe.

**Why it failed**:
- `yt-dlp` CLI binary at `bundaMac/src-tauri/Resources/bin/yt-dlp` was a Python wrapper script that couldn't find its `yt_dlp` module (`ModuleNotFoundError: No module named 'yt_dlp'`)
- Both tools needed to be installed as system binaries, fragile cross-platform
- No model caching, re-downloaded everything each run

### 2.2 Browser Whisper (`@huggingface/transformers` + ONNX Runtime WASM)

**When**: 2026-02-26 (entire day)

**Vision**: Run Whisper entirely in the browser using Hugging Face's transformers.js + ONNX Runtime WebAssembly. No server needed.

**The saga** (14 version bumps, 2.3.13 → 2.3.34):
| Attempt | Technique | Why it failed |
|---------|-----------|---------------|
| Static import | Direct import of `@huggingface/transformers` | Parcel tree-shook the module; missing from bundle |
| Runtime URL import | `import(chrome.runtime.getURL(...))` | CSP blocked `unsafe-eval` for `new Function()` |
| Direct static | Static import of `.web.js` build | References `onnxruntime-web` / `onnxruntime-common` — not resolved in extension context |
| Worker module | Dedicated `whisper-worker.mjs` loaded via `new Worker(url, {type:"module"})` | Worker couldn't find its own ORT WASM dependencies |
| Bundled TS worker | Parcel-bundled TypeScript worker entry | Module specifier resolution failed for WASM paths |
| Static assets + shims | `prepare-browser-whisper-runtime.mjs` copied runtime files + created shim modules for onnxruntime imports | Extension CSP blocked external `script-src`, WASM paths broken |
| Tab audio capture | `chrome.tabCapture` → MediaRecorder → decode → resample to 16kHz mono | Audio pipeline worked, but Whisper runtime never loaded reliably |

**Result**: **Total failure.** After 14 build iterations, the Whisper runtime could never be reliably bundled and loaded in an MV3 extension context due to the combination of Parcel's module resolution, CSP restrictions, and ONNX WASM path resolution. Scrapped entirely.

### 2.3 Browser Whisper + Local Server Hybrid

**What**: Popup offered two backends:
- "Local Server" → `127.0.0.1:8765`
- "Browser Whisper" → The broken transformers.js runtime

**State at start of this session**: Browser Whisper was non-functional, local server was broken (yt-dlp module error). Dual radio buttons in the UI that confused users.

### 2.4 New ASR Server (Python, yt-dlp library + faster-whisper) — CURRENT

**When**: 2026-04-23

**What changed**:
- Moved from subprocess `yt-dlp` CLI → `yt_dlp.YoutubeDL` Python class (no more binary path issues)
- Moved from `openai-whisper` CLI → `faster_whisper.WhisperModel` (CTranslate2 backend, 4x faster, models auto-downloaded from HuggingFace)
- Moved from inside extension repo → standalone `~/projects/bundai-asr/`
- Same HTTP API (`GET /health`, `GET /subtitles?videoId=...&model=...`)
- Added `requirements.txt` for reproducible setup

**Architecture**:
```
Extension popup → HTTP GET http://127.0.0.1:8765/subtitles?videoId=X&model=tiny
                    ↓
              bundai-asr/server.py
              ├── yt_dlp.YoutubeDL: download best audio → WAV
              ├── faster_whisper.WhisperModel("tiny"): transcribe → ja.vtt
              └── faster_whisper.WhisperModel("tiny"): translate → en.vtt
```

**What was removed from extension**:
- `@huggingface/transformers` dependency (saved ~52 packages)
- Browser Whisper UI (backend radio buttons, model selector)
- Tab audio capture (`chrome.tabCapture`, `MediaRecorder`, audio resampling)
- Whisper Web Worker (`assets/whisper-worker.mjs`)
- ONNX Runtime WASM assets (`assets/onnxruntime/`, `assets/transformers/`)
- `tabCapture` permission from manifest
- `prepare-browser-whisper-runtime.mjs` build step
- All `browserWhisper*` state and refs from popup

**Verified**: Server transcribes `m6EgDP61sQQ` (4min Shogun clip) with model `tiny` in ~64 seconds, both JA + EN VTT output.

---

## 3. Word Selection / Hover System History

### 3.1 Original System (progressive matching)

**Flow**:
1. kuromoji tokenizes subtitle text → tokens with surface_form, basic_form, reading, pos
2. Every character wrapped in `<span>` with `data-char-index`, `data-token-id`, etc.
3. On hover: `findBestMatch(charIndex)` → `getCandidateStartIndexes()` → `findMatchFromStart(startIndex, limit)` → progressive loop looking up progressively longer substrings in dictionary

### 3.2 Critical Bugs Found (2026-04-25)

| Bug | Root Cause | Symptom |
|-----|-----------|---------|
| **Limit clamped at hover position** | `limit = Math.min(maxLength, startIndex - candidateStartIndex + 1)` | Hovering first char of "答え" only tried "答" |
| **Stale hover on subtitle change** | 20ms debounce fires with old `charIndex`, queries new DOM | Getting "び/美" while hovering "答えは" |
| **Document-wide querySelector** | Both subtitle tracks share `data-char-index` → wrong track found | EN subtitle data returned for JP hover |
| **Single kanji dropped reading** | `isSingleKanji` guard zeroed out `readingForLookup` | 間 → random entry instead of kuromoji reading (あいだ/ま/かん) |
| **Over-highlighting particles** | `hasAuxOrParticle` branch returned `chars.length` not `matchedLength` | "食べた" highlighted 3 chars instead of 2 |

### 3.3 First Fix Pass — Patches to Progressive Matching

- Fixed limit calculation → always use `maxLength`
- Added `subtitleGeneration` counter → stale hovers silently abort
- Scoped all `querySelector` calls to subtitle element
- Always pass kuromoji reading (removed `isSingleKanji` guard)
- Fixed highlight length in `hasAuxOrParticle` branch
- Added `tokenMatchCache` (lazy, keyed by `generation:startIndex`)

### 3.4 Token-First Rewrite — CURRENT

**Insight**: kuromoji already provides correct word boundaries. The progressive matching loop was re-discovering what kuromoji already did — redundantly, slowly, and sometimes incorrectly.

**New primary path**:
```
subtitle appears → `precomputeTokenMatches()` 
  → for each token: lookup surface_form → basic_form → deinflected forms
  → store in tokenMatchCache keyed by generation:tokenStartIndex

user hovers → `getTokenStartIndex(charIndex)` → cache.get() → synchronous result
```

**Fallback**: If cache misses (first 50ms of new subtitle, or hovered particle/aux), falls back to the async progressive matching loop.

**Result**: 
- ~95% of hovers are synchronous (no async, no DOM queries)
- Progressive matching still exists as safety net
- No more debounce needed for cache hits (result is instant)

---

## 4. Dictionary System

### 4.1 Evolution

| System | When | Performance | Status |
|--------|------|-------------|--------|
| IndexedDB (JMdict JSON) | Original | 50–200ms, 50MB RAM | Deprecated |
| Flat-file binary search | Feb 2026 | 1–5ms, 103MB disk | Current |

### 4.2 Flat-File Dictionary

**Files**: `assets/data/japanese/words.idx` (3.5MB, 447k entries) + `words.ljson` (99.5MB)

**Architecture**: 10Ten-reader style. `words.idx` = Uint32 pairs of (offset, length) per entry. `words.ljson` = tab-separated `"word\t[JSON]"` lines. Binary search (`O(log n)`) with LRU cache (500 entries).

### 4.3 Deinflection

`services/deinflect.ts` — rule-based suffix stripping for verb/adjective conjugations. Single-pass only (no stacked forms like causative+passive+past). Duplicate rules present but harmless. Uses bitmask-based word type system (ichidan, godan, i-adj, etc.).

### 4.4 Reading Disambiguation

`dictionary-service.ts` `selectBestEntry()`:
1. POS preference mapping (kuromoji POS tags → JMdict POS tags)
2. Reading match (katakana → hiragana, then exact match against entry kana)
3. Numeric context detection (digits + counters like 間/前/後 → prefer time-unit glosses)

### 4.5 Known Issues

- Binary search comparator (`word < midWord`) uses JavaScript default ordering; index may have been built with different collation (localeCompare issue from `subtitle-lookup-plan.md` Phase 1)
- Dictionary build may only store first entry per surface form (Phase 2)
- No phrase dictionary for common multi-token expressions (Phase 7)
- Deinflection is single-pass, misses stacked conjugations (Phase 6)

---

## 5. Current Architecture Summary

```
bundaiExtension/
├── popup/index.tsx             — Extension popup (ASR UI, mode toggle)
├── contents/
│   └── custom-subtitles-youtube.tsx
│       ├── YouTubeSubtitleContainer class
│       │   ├── processSubtitleElement()  — tokenize + render spans + precompute matches
│       │   ├── precomputeTokenMatches()  — background dict lookups per token (NEW)
│       │   ├── handleCharacterHover()    — cache.get() synchronous, fallback async
│       │   └── findBestMatch()           — progressive matching (fallback only)
│       └── WordCardManager React wrapper → WordCard component
├── services/
│   ├── flat-file-dictionary.ts   — Binary search JMdict, LRU cache
│   ├── dictionary-service.ts     — Variant generation + deinflection + selectBestEntry
│   └── deinflect.ts              — Rule-based suffix stripping
├── components/
│   └── WordCard.tsx              — Dictionary popup, flashcard creation
├── graphql/                     — Apollo client, mutations, queries
└── background.ts                — Message routing, state persistence

~/projects/bundai-asr/            ← Standalone ASR server
├── server.py                    — yt-dlp + faster-whisper HTTP server
├── requirements.txt             — yt-dlp, faster-whisper
└── README.md
```

---

## 6. What Works Now

- **ASR**: Standalone Python server at `127.0.0.1:8765` → extension calls `/subtitles?videoId=...&model=...` → transcribes + translates → stores VTT locally
- **Word hover**: Token-first precomputed lookups (synchronous for 95% of cases), progressive matching fallback
- **Reading disambiguation**: 間, 人, 分, etc. now use kuromoji reading (あいだ/ま/かん vs ひと/じん/にん)
- **No race conditions**: `subtitleGeneration` counter prevents stale hover DOM queries
- **No cross-track contamination**: All queries scoped to subtitle element
- **Highlight correct**: `hasAuxOrParticle` returns `matchedLength` not `chars.length`
- **Clean bundle**: Removed `@huggingface/transformers`, ONNX assets, whisper worker (~50MB smaller)

---

## 7. Plan Going Forward

### Immediate (done, v2.4.0)
- [x] Replace broken yt-dlp CLI with Python library
- [x] Replace openai-whisper CLI with faster-whisper
- [x] Remove all browser ASR code
- [x] Fix word selection bugs (limit, stale hover, reading dropout, over-highlight)
- [x] Token-first precomputed match system
- [x] Scope queries to subtitle element

### Short-term (next sprint)
- [ ] Fix dictionary binary search ordering (localeCompare → code-point, Phase 1 of subtitle-lookup-plan)
- [ ] Preserve all dictionary entries per surface form (Phase 2)
- [ ] Add phrase dictionary for multi-token compounds (Phase 7)
- [ ] Multi-step deinflection for stacked conjugations (Phase 6)
- [ ] Pass resolved dictionary entry directly to WordCard (skip redundant lookup)

### Long-term
- [ ] Replace progressive matching fallback with longest-match algorithm
- [ ] Audio playback for WordCard entries (subtitle alignment, Phase 8)
- [ ] ASR server deployment (Dockerize, move off localhost to production)

---

## 8. Failure Log

| Date | What | Lesson |
|------|------|--------|
| 2026-02-26 | 14 attempts to bundle `@huggingface/transformers` in MV3 extension | Parcel + CSP + ONNX WASM + Chrome extension = combinatorial hell. Abandon in-browser ML. |
| 2026-02-25 | Agent/grammar modes in iOS app (llama.rn + whisper.rn) | AI tutor UX too complex. Replaced with deterministic scenario practice. |
| 2026-04-21 | `yt-dlp` CLI downloads (local_asr_server.py) | Python binary wrappers break across environments. Use library imports. |
| 2026-04-25 | Progressive character matching for word selection | kuromoji already knows word boundaries. Don't re-discover them. Trust the tokenizer. |

---

## 9. Key Numbers

| Metric | Value |
|--------|-------|
| Extension version | 2.4.0 |
| Dictionary entries | ~447,000 |
| Dictionary size | 103MB (idx + ljson) |
| Dict lookup time | 1–5ms (cached) |
| ASR model options | tiny, base, small, medium, large-v3, large-v3-turbo |
| ASR server port | 8765 |
| ASR server repo | `~/projects/bundai-asr/` |
| Tokens precomputed per subtitle | Typically 5–15 |
| Hover path | Synchronous cache hit (primary) or async progressive (fallback) |

---

*This file consolidates: `work-done-so-far.md`, `subtitle-lookup-plan.md`, `PLAN.md`, and all ASR-related session notes. It is the single source of truth for the extension's architecture, history, and roadmap.*
