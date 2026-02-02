# Subtitle Lookup Improvement Plan

Last updated: February 2, 2026

## Goals
- Match 10Ten-level word coverage for hover lookups.
- Fix current errors where words exist in the dictionary but are not found.
- Disambiguate homographs like "十分" using reading context.
- Keep performance fast (<= 5ms lookup where possible).

## Current Root Causes (confirmed)
1. Binary search uses localeCompare against a code-point sorted index.
2. Dictionary build keeps only the first entry for a surface form, losing alternates.
3. Lookup does not use token reading to pick the correct entry when multiple exist.
4. (Known) Hover anchors only to the hovered character; mid-word hover can fail.

## Plan

### Phase 1: Correct Dictionary Search Ordering (highest impact)
- Replace localeCompare in flat-file binary search with code-point ordering.
- Add a small verification script to spot-check known words (e.g. それで, こいつら).

### Phase 2: Preserve All Entries Per Surface Form
- Update the build script to store all entries for a word (JSON array per word).
- Update the flat-file reader to parse arrays and return all entries.

### Phase 3: Reading-Aware Entry Selection
- Accept optional token reading for lookups.
- Prefer entries whose kana list matches the token reading (katakana -> hiragana).
- Fall back to first entry when no match is found.

### Phase 4: Hover Anchoring Improvements (next)
- Map char index -> token boundaries.
- When hovering inside a word, use the token start for progressive matching.
- Keep cross-token expansion behind a guard to avoid mis-reads.

### Phase 5: Normalization and Variants (next)
- Expand choon (ー) variants.
- Add kyuujitai -> shinjitai conversion.
- Normalize full-width numbers and compatibility forms.

### Phase 6: Deinflection Improvements (later)
- Add full multi-step deinflection with type checks.
- Show deinflection reasons in the WordCard UI.

## Acceptance Checks
- Hovering any character inside こいつら returns こいつら.
- Hovering それで returns それで, not 祖.
- Hovering 十分 with reading じゅうぶん returns "enough", not "ten minutes".
- Regression checks: 人類 and other known-good words still match.

## Notes
- The flat-file index must use the same ordering as the binary search comparator.
- Token readings from kuromoji are katakana; convert to hiragana before matching.
