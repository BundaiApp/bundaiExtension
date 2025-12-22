# Bundai Extension - Multi-Platform Dual Subtitle Plan

## Three Use Cases

### Use Case 1: YouTube (Normal Videos)
Videos with creator-provided JP + EN subs (cooking channels, etc.)
- **Challenge:** YouTube DOM only shows ONE subtitle track at a time
- **Solution:** Fetch second track via yt-dlp (Node.js wrapper)
- **Display:** JP (top) + EN (bottom) overlay

### Use Case 2: Netflix / Crunchyroll
Platform-provided subs, occasional user upload for edge cases
- **Challenge:** May need to extract from CDN manifest
- **Solution:** Try DOM extraction first, fall back to yt-dlp if needed
- **Edge case:** Allow user to upload subtitle file
- **Display:** JP (top) + EN (bottom) overlay

### Use Case 3: 9anime / Toro (Pirate Sites)
Users already use asbplayer for subtitles
- **Bundai role:** Dictionary hover + flashcard creation only
- **Solution:** Act as 10Ten-like reader on any Japanese text
- **Display:** asbplayer handles subtitles, Bundai provides hover cards

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Bundai Extension                             │
├────────────────────────────────────────────────────────────────┤
│  Platform Detector                                              │
│  ├── YouTube → Use Case 1 flow                                 │
│  ├── Netflix/Crunchyroll → Use Case 2 flow                     │
│  └── Other (9anime, etc.) → Use Case 3 flow (reader only)      │
├────────────────────────────────────────────────────────────────┤
│  Subtitle Manager                                               │
│  ├── fetchFromServer(videoId, platform) → JP subs              │
│  ├── extractFromDOM() → EN subs (or JP if available)           │
│  └── handleUserUpload(file) → parse VTT/SRT                    │
├────────────────────────────────────────────────────────────────┤
│  Dual Subtitle Renderer                                         │
│  ├── renderOverlay(jpCues, enCues)                             │
│  └── syncWithVideo(currentTime)                                │
├────────────────────────────────────────────────────────────────┤
│  Japanese Reader (10Ten-like) - Works EVERYWHERE               │
│  ├── detectHover(element) → get Japanese text                  │
│  ├── tokenize(text) → kuromoji                                 │
│  ├── lookup(word) → JMDict via IndexedDB                       │
│  └── showWordCard(definition, position)                        │
├────────────────────────────────────────────────────────────────┤
│  Flashcard Service                                              │
│  └── addToBundai(word, context) → GraphQL to bundai server     │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│  Bundai Server (Node.js) - REPLACES Python server              │
│  ├── GET /api/subtitles/:platform/:videoId                     │
│  │   └── Uses yt-dlp-wrap to fetch subtitle URLs               │
│  ├── Serves pre-stored anime subs (animeVocub files)           │
│  └── Existing GraphQL for flashcards                           │
└────────────────────────────────────────────────────────────────┘
```

---

## Node.js Server: Replacing Python

### Option: `yt-dlp-wrap` in Node.js

```typescript
// bundai server - new endpoint
import YTDlpWrap from 'yt-dlp-wrap';

const ytDlp = new YTDlpWrap('/usr/local/bin/yt-dlp'); // path to binary

app.get('/api/subtitles/:platform/:videoId', async (req, res) => {
  const { platform, videoId } = req.params;
  const cookies = req.headers['x-cookies']; // from extension

  try {
    // Get subtitle info without downloading video
    const info = await ytDlp.getVideoInfo(
      `https://youtube.com/watch?v=${videoId}`,
      { cookies: cookieFile }
    );

    // Extract subtitle URLs
    const subs = info.subtitles || info.automatic_captions;
    const jpSub = subs['ja'] || subs['ja-JP'];
    const enSub = subs['en'] || subs['en-US'];

    res.json({
      japanese: jpSub?.[0]?.url,
      english: enSub?.[0]?.url
    });
  } catch (error) {
    res.status(404).json({ error: 'Subtitles not found' });
  }
});
```

### Requirements
- yt-dlp binary installed on server (`pip install yt-dlp` or download binary)
- `yt-dlp-wrap` npm package
- Cookie handling for authenticated requests

---

## Use Case Flows

### Flow 1: YouTube Video with Both Subs
```
1. User opens YouTube video
2. Extension detects YouTube, extracts video ID
3. Extension sends video ID to bundai server
4. Server calls yt-dlp to get subtitle URLs
5. Server returns JP + EN subtitle URLs
6. Extension fetches both VTT files
7. Extension renders dual overlay (JP top, EN bottom)
8. User hovers word → WordCard with definition
9. User clicks add → Flashcard to bundai
```

### Flow 2: Netflix with Platform Subs
```
1. User opens Netflix anime
2. Extension detects Netflix, extracts title ID
3. Try DOM extraction for both subtitle tracks
4. If only one in DOM → call server for second track
5. Render dual overlay
6. Hover/flashcard works same as YouTube
```

### Flow 2b: User Uploads Subtitle
```
1. User clicks "Upload subtitle" in popup
2. Extension parses VTT/SRT file
3. Uses uploaded subs + DOM subs for dual display
```

### Flow 3: 9anime/Toro with asbplayer
```
1. User has asbplayer showing JP subtitles
2. Bundai extension is active
3. User hovers over ANY Japanese text on page
4. Bundai shows WordCard with definition
5. User can add to flashcards
6. NO subtitle management needed
```

---

## Files to Modify

### Extension (bundaiExtension)

**Create:**
| File | Purpose |
|------|---------|
| `adapters/types.ts` | Platform adapter interface |
| `adapters/youtube.ts` | YouTube-specific logic |
| `adapters/netflix.ts` | Netflix-specific logic |
| `adapters/generic.ts` | Generic reader for any site (use case 3) |
| `contents/dual-subtitle-overlay.tsx` | Unified subtitle renderer |
| `contents/japanese-reader.tsx` | 10Ten-like hover reader (works everywhere) |

**Modify:**
| File | Changes |
|------|---------|
| `popup/index.tsx` | Add subtitle upload UI, simplify mode toggle |
| `hooks/useSubtitle.ts` | Point to bundai server (Node.js) instead of Python |
| `background.ts` | Remove Python API URL, use bundai server |
| `package.json` | Add Netflix, 9anime URL patterns |

**Delete:**
| File | Reason |
|------|--------|
| `contents/auto-subtitle-extractor.tsx` | Merged into new files |
| `contents/custom-subtitles-container.tsx` | Merged into new files |

### Bundai Server (../server)

**Add:**
| Endpoint | Purpose |
|----------|---------|
| `GET /api/subtitles/:platform/:videoId` | Fetch subtitle URLs via yt-dlp-wrap |
| `POST /api/subtitles/upload` | Handle user-uploaded subs (optional) |

**Dependencies:**
```
npm install yt-dlp-wrap
```

### Python Server (../bundai-extension-api)

**Action:** DECOMMISSION after Node.js endpoint is working

---

## Implementation Phases

### Phase 1: Node.js yt-dlp Endpoint
- Add `yt-dlp-wrap` to bundai server
- Create `/api/subtitles/:platform/:videoId` endpoint
- Test with YouTube videos
- Migrate extension to use new endpoint

### Phase 2: Unified Subtitle Renderer
- Create platform adapters
- Build `dual-subtitle-overlay.tsx`
- Keep kuromoji + WordCard functionality

### Phase 3: Japanese Reader (10Ten-like)
- Create `japanese-reader.tsx` content script
- Detect hover on any Japanese text
- Show WordCard with definition
- Works on ANY website (including 9anime with asbplayer)

### Phase 4: Netflix Support
- Implement Netflix adapter
- Handle Netflix subtitle extraction
- Test with anime content

### Phase 5: User Subtitle Upload
- Add upload UI to popup
- Parse VTT/SRT files
- Use uploaded subs when platform subs unavailable

### Phase 6: Decommission Python Server
- Verify all functionality works with Node.js
- Remove Python server from deployment
- Update documentation

---

## Decisions Made

1. **yt-dlp:** Need to install on bundai server
   ```bash
   # On server
   pip install yt-dlp
   # Or download binary
   curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   chmod +x /usr/local/bin/yt-dlp
   ```

2. **Japanese Reader Scope:** Works on ALL websites
   - Any Japanese text on any webpage gets hover dictionary
   - Makes Bundai a universal Japanese learning tool
   - Users can learn from Twitter, news, blogs, etc.

---

## Summary

**What we're building:**
1. **Dual subtitle overlay** for YouTube/Netflix/Crunchyroll (via yt-dlp on Node.js)
2. **Universal Japanese reader** (10Ten-like) for ALL websites
3. **Flashcard integration** with bundai app
4. **Python server elimination** - everything moves to Node.js

**Key simplifications:**
- Single Node.js server (no more Python)
- One codebase for all platforms (adapter pattern)
- Reader works everywhere (not just video sites)
