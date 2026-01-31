# 10Ten-Style Progressive Character Selection Implementation Plan

## Overview

Implement 10Ten-ja-reader style progressive character selection for Japanese word detection, where hovering over characters gradually expands selection to find the longest matching dictionary entry.

### Current vs Desired Behavior

**Current (Token-based):**

- Text: "思う" → One span for entire token
- Hover anywhere → Looks up "思う" as one word
- Issue: "思" alone doesn't show up as separate lookup

**Desired (Character-based like 10Ten):**

- Text: "思う" → Each character in own span: [思][う]
- Hover on "思" → Shows "思" meaning
- Move right to "う" → Expands to "思う" + shows that meaning
- Progressive expansion finds longest matching dictionary entry

---

## Implementation Overview

### 1. Character-Level Rendering

Instead of word-level spans, create character-level spans while maintaining token metadata:

```typescript
// Current: One span per word
<span class="tokenized-word" data-word="思う">思う</span>

// New: One span per character with metadata
<span class="char-span"
      data-char="思"
      data-index="0"
      data-token-id="0"
      data-token-start="0"
      data-token-end="2">思</span>
<span class="char-span"
      data-char="う"
      data-index="1"
      data-token-id="0"
      data-token-start="0"
      data-token-end="2">う</span>
```

### 2. Progressive Selection Logic

Track cursor position and expand selection:

```typescript
// When hovering on character at index N:
// 1. Start with character N alone
// 2. Try N+N+1 → if in dictionary, expand
// 3. Try N+N+1+N+2 → if in dictionary, expand
// 4. Continue until no match or end of token
// 5. Highlight longest matched sequence
```

### 3. Dictionary Lookup for Sequences

Add function to look up character sequences:

```typescript
async lookupSequence(chars: string, startIndex: number): Promise<MatchResult>
```

### 4. Dynamic Highlighting

Add CSS class for matched character region:

```css
.matched-region {
  background-color: rgba(255, 255, 255, 0.4);
  border-radius: 4px;
}
```

---

## Detailed Changes Required

### File: `contents/custom-subtitles-youtube.tsx`

#### A. Modify `processSubtitleElement()` function

**1. Change from word spans to character spans:**

```typescript
// Instead of creating span per token
tokens.map((token) => `<span>${token.surface_form}</span>`)

// Create span per character with metadata
token.surface_form
  .split("")
  .map(
    (char, charIndex) =>
      `<span class="char-span"
        data-char="${char}"
        data-char-index="${globalIndex}"
        data-token-id="${tokenIndex}"
        data-token-word="${token.surface_form}"
        data-basic-form="${token.basic_form}"
        data-reading="${token.reading}">${char}</span>`
  )
  .join("")
```

**2. Add mouse tracking:**

```typescript
let hoverTimeout: NodeJS.Timeout | null = null

charSpan.addEventListener("mouseenter", (e) => {
  const charIndex = parseInt(e.target.dataset.charIndex)
  const mouseX = e.clientX

  // Debounce to avoid excessive lookups
  if (hoverTimeout) clearTimeout(hoverTimeout)
  hoverTimeout = setTimeout(() => {
    this.handleCharacterHover(charIndex, mouseX)
  }, 50)
})

charSpan.addEventListener("mouseleave", () => {
  if (hoverTimeout) clearTimeout(hoverTimeout)
  this.clearHighlights()
})
```

#### B. Add new methods

**1. `handleCharacterHover(charIndex: number, mouseX: number)`**

```typescript
private async handleCharacterHover(charIndex: number, mouseX: number): Promise<void> {
  const bestMatch = await this.findBestMatch(charIndex)

  if (bestMatch) {
    // Highlight characters from match.startIndex to match.startIndex + match.length
    this.highlightRegion(bestMatch.startIndex, bestMatch.length)

    // Calculate position for WordCard (start of highlighted region)
    const startChar = document.querySelector(
      `[data-char-index="${bestMatch.startIndex}"]`
    ) as HTMLElement
    const rect = startChar.getBoundingClientRect()

    // Trigger WordCard with matched word
    this.wordCard = {
      word: bestMatch.matchedText,
      basicForm: bestMatch.entry.basic_form || bestMatch.matchedText,
      reading: bestMatch.entry.reading,
      pos: bestMatch.entry.pos,
      mouseX: rect.left + rect.width / 2,
      mouseY: rect.top,
      isVisible: true,
      isSticky: false
    }
    this.renderWordCard()
  }
}
```

**2. `findBestMatch(startIndex: number): Promise<MatchResult | null>`**

```typescript
private async findBestMatch(
  startIndex: number,
  maxLength: number = 10
): Promise<MatchResult | null> {
  const charSpans = document.querySelectorAll('.char-span')
  let chars = ''
  let matchedEntry: JMDictEntry | null = null
  let matchedLength = 0

  // Collect characters from start index
  for (let i = 0; i < maxLength; i++) {
    const targetIndex = startIndex + i
    const span = document.querySelector(
      `[data-char-index="${targetIndex}"]`
    ) as HTMLElement

    if (!span) break

    const char = span.dataset.char
    const tokenId = span.dataset.tokenId

    // Stop if we hit a new token boundary
    if (i > 0) {
      const prevToken = document.querySelector(
        `[data-char-index="${targetIndex - 1}"]`
      ) as HTMLElement
      if (prevToken && prevToken.dataset.tokenId !== tokenId) {
        break
      }
    }

    chars += char

    // Try to lookup this sequence
    const entry = await dictionaryDB.lookup(chars)
    if (entry) {
      matchedEntry = entry
      matchedLength = i + 1
    }
  }

  if (matchedLength > 0) {
    return {
      startIndex,
      length: matchedLength,
      matchedText: chars.substring(0, matchedLength),
      entry: matchedEntry!
    }
  }

  return null
}
```

**3. `highlightRegion(startIndex: number, length: number)`**

```typescript
private highlightRegion(startIndex: number, length: number): void {
  // Clear existing highlights
  this.clearHighlights()

  // Add highlight class to matched characters
  for (let i = 0; i < length; i++) {
    const index = startIndex + i
    const span = document.querySelector(
      `[data-char-index="${index}"]`
    ) as HTMLElement
    if (span) {
      span.classList.add('matched-region')
    }
  }
}
```

**4. `clearHighlights()`**

```typescript
private clearHighlights(): void {
  document.querySelectorAll('.matched-region').forEach(el => {
    el.classList.remove('matched-region')
  })

  // Hide WordCard if not sticky
  if (!this.wordCard.isSticky) {
    this.wordCard.isVisible = false
    this.renderWordCard()
  }
}
```

#### C. Update WordCard integration

```typescript
private handleCharacterHover(charIndex: number, mouseX: number): void {
  // Find best match
  this.findBestMatch(charIndex).then(match => {
    if (match) {
      // Highlight characters from match.startIndex to match.startIndex + match.length
      this.highlightRegion(match.startIndex, match.length)

      // Calculate position for WordCard (start of highlighted region)
      const startChar = document.querySelector(
        `[data-char-index="${match.startIndex}"]`
      ) as HTMLElement
      const rect = startChar.getBoundingClientRect()

      // Trigger WordCard
      this.wordCard = {
        word: match.matchedText,
        basicForm: match.entry.basic_form || match.matchedText,
        reading: match.entry.reading,
        pos: match.entry.pos,
        mouseX: rect.left + rect.width / 2,
        mouseY: rect.top,
        isVisible: true,
        isSticky: false
      }
      this.renderWordCard()
    }
  })
}
```

### File: `services/dictionaryDB.ts`

#### Add sequence lookup method

```typescript
public async lookupSequence(
  text: string,
  maxLength: number = 10
): Promise<{ matchedLength: number; entry: JMDictEntry | null }> {
  // Try progressively longer sequences
  for (let length = text.length; length >= 1; length--) {
    const substring = text.substring(0, length)
    const entry = await this.lookup(substring)
    if (entry) {
      return { matchedLength: length, entry }
    }
  }
  return { matchedLength: 0, entry: null }
}
```

### File: `style.css`

#### Add highlighting styles

```css
.matched-region {
  background-color: rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.char-span {
  display: inline;
  cursor: pointer;
  padding: 2px 1px;
  border-radius: 2px;
  transition: background-color 0.1s ease;
}

.char-span:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
```

---

## Key Technical Decisions

### 1. Debouncing Strategy

- **50ms debounce** on character hover
- Prevents excessive dictionary lookups
- Makes expansion feel responsive but not jittery

### 2. Match Selection Criteria

- Prefer **longest matching sequence**
- If multiple matches exist, pick the longest
- Example: "食べて" → matches "食べて" over "食べ" over "食"

### 3. Highlighting Behavior

- **Expand rightward only** (don't expand left from starting point)
- Match within single token boundary
- Clear highlights when leaving subtitle area

### 4. Token Boundary Handling

- Don't expand across token boundaries
- Example: "思うんだ" → tokens: ["思う", "ん", "だ"]
  - Hover "思" → can expand to "思う" but not "思うん"

---

## Implementation Steps

1. **Step 1:** Modify `processSubtitleElement` to create character-level spans
2. **Step 2:** Add character hover event handlers with debouncing
3. **Step 3:** Implement `findBestMatch` with progressive expansion
4. **Step 4:** Add `highlightRegion` and `clearHighlights` methods
5. **Step 5:** Update WordCard positioning to use highlighted region
6. **Step 6:** Add CSS styles for `.matched-region` class
7. **Step 7:** Add sequence lookup method to dictionaryDB
8. **Step 8:** Test with various word types:
   - Single kanji: "壁"
   - Kanji + kana: "思う"
   - Multi-kanji compounds: "勉強"
   - Conjugated verbs: "食べた"

---

## Expected Behavior Examples

| Hover Position     | Selected | Dictionary Match       | Display                                  |
| ------------------ | -------- | ---------------------- | ---------------------------------------- |
| "思" → no movement | 思       | ✅ "思" (single kanji) | Shows "思" card                          |
| "思" → move right  | 思う     | ✅ "思う" (verb)       | Shows "思う" card, highlights both chars |
| "壁"               | 壁       | ✅ "壁" (noun)         | Shows "壁" card                          |
| "勉" → move right  | 勉強     | ✅ "勉強" (compound)   | Shows "勉強" card, highlights both kanji |
| "食" → "べ" → "て" | 食べて   | ✅ "食べる" (lemma)    | Shows "食べる" card                      |

---

## Performance Considerations

1. **Dictionary lookups:** Debounce + cache frequent queries
2. **DOM operations:** Use class toggling, not recreating elements
3. **Event handling:** One listener per subtitle element with delegation if needed
4. **Max match length:** Cap at 10 characters to prevent excessive lookups

---

## Configuration Options

### Match Boundary Behavior

**Question:** Should we stop at token boundaries, or allow expanding across multiple tokens?

**Recommendation:** Stop at token boundaries for more accurate matches.

### Highlighting Style

**Options:**

- ✅ Background highlight (default)
- ✅ Underline matched region
- ✅ Border around matched region
- ✅ Combination of above

**Current choice:** Background highlight with `rgba(255, 255, 255, 0.4)`

### Expansion Speed

**Options:**

- Faster (20ms): Instant feedback but more CPU usage
- **50ms (default):** Balanced responsiveness and performance
- Slower (100ms): Reduced CPU usage, slightly less responsive

**Current choice:** 50ms debounce

### Fallback for Unknown Sequences

**Options:**

- Show card for individual character even if no dictionary match
- Show "No dictionary entry" message
- Don't show card at all

**Recommendation:** Show card with "No dictionary entry" for single unknown characters.

### Click Behavior

**Question:** Should clicking lock the current selection (like 10Ten's sticky mode)?

**Current behavior:** Click already implements sticky mode via `isSticky` flag.

---

## Interface Updates

### Token Interface (existing)

```typescript
interface Token {
  surface_form: string
  basic_form: string
  reading: string
  pos: string
  conjugated_form: string
}
```

### New MatchResult Interface

```typescript
interface MatchResult {
  startIndex: number
  length: number
  matchedText: string
  entry: JMDictEntry
}
```

### WordCard Interface (updated)

```typescript
private wordCard: {
  word: string
  mouseX: number
  mouseY: number
  isVisible: boolean
  isSticky: boolean
  basicForm?: string
  reading?: string
  pos?: string
  conjugatedForm?: string
}
```

---

## Testing Checklist

### Basic Functionality

- [ ] Single character lookup works (e.g., "思")
- [ ] Two-character lookup works (e.g., "思う")
- [ ] Progressive expansion works as cursor moves
- [ ] Highlighting appears correctly
- [ ] Highlights clear when leaving subtitle

### Edge Cases

- [ ] Token boundaries respected (doesn't expand across tokens)
- [ ] Non-Japanese text handled gracefully
- [ ] Unknown characters show appropriate message
- [ ] Very long words don't cause performance issues
- [ ] Sticky mode works correctly

### Performance

- [ ] Dictionary lookups are debounced properly
- [ ] No lag when moving cursor quickly
- [ ] No memory leaks (event listeners cleaned up)
- [ ] DOM updates are efficient

### UI/UX

- [ ] Highlighting is visible but not distracting
- [ ] WordCard appears in correct position
- [ ] Hovering feels responsive (50ms feels right)
- [ ] Click to stick works as expected

---

## Future Enhancements

### Phase 2 Features

1. **Smart token boundary crossing:** Allow expansion for common collocations
2. **Context-aware matching:** Consider surrounding words for disambiguation
3. **Frequency-based ranking:** Prefer more common matches for same-length sequences
4. **Custom dictionary support:** Allow users to add custom words
5. **Keyboard shortcuts:** Arrow keys to navigate through matches
6. **Match confidence:** Show confidence score for ambiguous matches

### Phase 3 Features

1. **Multi-word phrase detection:** Detect common phrases across tokens
2. **Collocation dictionary:** Add support for multi-word expressions
3. **Learning from user behavior:** Remember user's preferred matches
4. **Machine translation backup:** Show translation when dictionary unavailable
5. **Pronunciation audio:** Play audio for selected word

---

## Files to Modify

1. `contents/custom-subtitles-youtube.tsx` - Main implementation
2. `contents/custom-subtitles-generic.tsx` - Apply same changes for generic version
3. `services/dictionaryDB.ts` - Add sequence lookup method
4. `components/WordCard.tsx` - May need minor updates
5. `style.css` - Add `.matched-region` and `.char-span` styles

---

## Rollback Plan

If issues arise, rollback steps:

1. Revert `processSubtitleElement` to use word-level spans
2. Remove character hover handlers
3. Remove progressive expansion methods
4. Keep lemmatization improvements (basic_form lookup)
5. Rebuild extension
6. Test that basic functionality works

---

## References

- [10Ten-ja-reader Repository](https://github.com/birchill/10ten-ja-reader)
- [Kuromoji Documentation](https://github.com/takuyaa/kuromoji.js)
- [JMdict Project](https://www.edrdg.org/jmdict/j_jmdict.html)
- [Japanese Morphology Guide](https://github.com/takuyaa/kuromoji.js#morphological-analysis)

---

## Notes

- Current implementation already has lemmatization via `basic_form` lookup
- This enhancement adds character-level progressive selection on top of existing features
- Can be implemented incrementally, starting with MVP approach
- Performance testing needed with long subtitles
- User feedback loop recommended for fine-tuning debouncing and highlighting
