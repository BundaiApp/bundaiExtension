#!/usr/bin/env python3
"""
Dictionary Conversion Script - 10Ten-JA-Reader Style
Converts JMdict JSON to flat-file format with binary search index

Input:  assets/data/japanese/jmdict-simplified-flat-full.json
Output: assets/data/japanese/words.idx (binary index file)
        assets/data/japanese/words.ljson (line-delimited JSON)

Index format (simple):
- 4 bytes: number of entries (N)
- For each entry (8 bytes):
  - 4 bytes: byte offset of word in data file
  - 4 bytes: byte length of word

Data format (words.ljson):
- Line-delimited JSON: "word\t{entry_json}"
- Each line ends with newline
"""

import json
import struct
import sys
from pathlib import Path
from typing import List, Tuple, Dict

PROJECT_ROOT = Path(__file__).parent.parent
INPUT_FILE = PROJECT_ROOT / "assets/data/japanese/jmdict-simplified-flat-full.json"
IDX_FILE = PROJECT_ROOT / "assets/data/japanese/words.idx"
LJSON_FILE = PROJECT_ROOT / "assets/data/japanese/words.ljson"


def load_jmdict() -> List[dict]:
    """Load JMdict JSON file."""
    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"Loaded {len(data)} entries")
    return data


def extract_words(entry: dict) -> List[str]:
    """Extract all unique words (kanji + kana) from an entry."""
    words = set()
    kanji = entry.get("kanji", [])
    kana = entry.get("kana", [])
    
    for word in kanji:
        if word:
            words.add(word)
    
    for word in kana:
        if word:
            words.add(word)
    
    return list(words)


def create_word_list(entries: List[dict]) -> Dict[str, List[dict]]:
    """Create map of unique words to their entries (preserve all entries)."""
    print("Extracting words...")
    word_map: Dict[str, List[dict]] = {}
    
    for entry in entries:
        for word in extract_words(entry):
            if word not in word_map:
                word_map[word] = []
            word_map[word].append(entry)
    
    print(f"Found {len(word_map)} unique words")
    return word_map


def create_index_and_data(word_map: Dict[str, List[dict]]) -> Tuple[bytes, bytes]:
    """Create binary index file and line-delimited JSON data file."""
    print("Creating index and data files...")
    
    # Sort words for binary search
    sorted_words = sorted(word_map.keys())
    
    # Build data file content
    # Format: "word\t{entry_json}\n"
    lines: List[bytes] = []
    for word in sorted_words:
        entries = word_map[word]
        entry_json = json.dumps(entries, ensure_ascii=False)
        line = f"{word}\t{entry_json}\n".encode("utf-8")
        lines.append(line)

    data_content = b"".join(lines)
    
    # Build index file
    # Format: [4 bytes: count][8 bytes per entry: offset, length]
    index_content = struct.pack("<I", len(sorted_words))
    
    offset = 0
    for word, line in zip(sorted_words, lines):
        word_bytes = word.encode("utf-8")
        index_content += struct.pack("<II", offset, len(word_bytes))
        offset += len(line)
    
    return index_content, data_content


def verify_index(sorted_words: List[str], index_data: bytes, data_content: bytes) -> bool:
    """Verify the index is correct by spot-checking entries."""
    print("Verifying index...")
    
    count = struct.unpack_from("<I", index_data, 0)[0]
    
    if count == 0:
        print("  Warning: No entries in index")
        return False
    
    # Check first entry
    first_offset, first_length = struct.unpack_from("<II", index_data, 4)
    first_line = data_content[first_offset:first_offset + first_length].decode("utf-8")
    
    # Check last entry
    last_offset, last_length = struct.unpack_from("<II", index_data, 4 + (count - 1) * 8)
    last_line = data_content[last_offset:last_offset + last_length].decode("utf-8")
    
    # Check a middle entry
    mid_idx = count // 2
    mid_offset, mid_length = struct.unpack_from("<II", index_data, 4 + mid_idx * 8)
    mid_line = data_content[mid_offset:mid_offset + mid_length].decode("utf-8")
    
    print(f"  First word: '{first_line}'")
    print(f"  Middle word: '{mid_line}'")
    print(f"  Last word: '{last_line}'")
    print(f"  Total entries: {count}")
    
    # Verify sorting
    if sorted_words[0] != first_line:
        print(f"  ERROR: First word mismatch: {sorted_words[0]} != {first_line}")
        return False
    
    if sorted_words[-1] != last_line:
        print(f"  ERROR: Last word mismatch: {sorted_words[-1]} != {last_line}")
        return False
    
    if sorted_words[mid_idx] != mid_line:
        print(f"  ERROR: Middle word mismatch")
        return False
    
    print("  Index verification passed!")
    return True


def main():
    """Main entry point."""
    print("=" * 60)
    print("JMdict to Flat-File Converter")
    print("=" * 60)
    
    if not INPUT_FILE.exists():
        print(f"Error: Input file not found: {INPUT_FILE}")
        sys.exit(1)
    
    # Load entries
    entries = load_jmdict()
    
    # Create word map
    word_map = create_word_list(entries)
    
    # Sort words
    sorted_words = sorted(word_map.keys())
    
    # Create index and data files
    index_content, data_content = create_index_and_data(word_map)
    
    # Verify
    verify_index(sorted_words, index_content, data_content)
    
    # Write output files
    print(f"Writing {IDX_FILE}...")
    with open(IDX_FILE, "wb") as f:
        f.write(index_content)
    
    print(f"Writing {LJSON_FILE}...")
    with open(LJSON_FILE, "wb") as f:
        f.write(data_content)
    
    # Print summary
    index_size = len(index_content)
    data_size = len(data_content)
    total_size = index_size + data_size
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Index file: {IDX_FILE}")
    print(f"  Size: {index_size:,} bytes ({index_size / 1024:.1f} KB)")
    print(f"  Entries: {len(sorted_words):,}")
    print(f"Data file: {LJSON_FILE}")
    print(f"  Size: {data_size:,} bytes ({data_size / 1024 / 1024:.2f} MB)")
    print(f"Total size: {total_size:,} bytes ({total_size / 1024 / 1024:.2f} MB)")
    print(f"Avg entry size: {data_size / len(sorted_words):.1f} bytes")
    print("Done!")


if __name__ == "__main__":
    main()
