// Flat-File Dictionary with Binary Search - 10Ten-JA-Reader Style
// Index format: [count (4 bytes)][offset (4 bytes), length (4 bytes)] per entry
// Data format: "word\t{entry_json}\n" per line

export interface JMDictEntry {
  kanji?: string[]
  kana?: string[]
  senses?: Array<{
    gloss: string[]
    pos?: string[]
    field?: string[]
    misc?: string[]
    info?: string[]
    example?: string[]
  }>
}

export interface LookupResult {
  entries: JMDictEntry[]
  isExact: boolean
  deinflectReasons?: string[]
}

export class FlatFileDictionary {
  private static instance: FlatFileDictionary

  private indexData: Uint32Array | null = null
  private wordData: ArrayBuffer | null = null
  private indexCount = 0

  private initPromise: Promise<void> | null = null
  private cache: Map<string, LookupResult> = new Map()
  private maxCacheSize = 500

  private constructor() {}

  public static getInstance(): FlatFileDictionary {
    if (!FlatFileDictionary.instance) {
      FlatFileDictionary.instance = new FlatFileDictionary()
    }
    return FlatFileDictionary.instance
  }

  public async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initialize()
    return this.initPromise
  }

  private async _initialize(): Promise<void> {
    try {
      await Promise.all([this.loadIndexFile(), this.loadDataFile()])
      console.log(`[FlatFileDictionary] Loaded ${this.indexCount} entries`)
    } catch (error) {
      console.error("[FlatFileDictionary] Failed to initialize:", error)
      throw error
    }
  }

  private async loadIndexFile(): Promise<void> {
    const url = chrome.runtime.getURL("assets/data/japanese/words.idx")
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Index fetch failed: ${response.status}`)
    const buffer = await response.arrayBuffer()
    const view = new DataView(buffer)
    this.indexCount = view.getUint32(0, true)
    this.indexData = new Uint32Array(buffer, 4, this.indexCount * 2)
  }

  private async loadDataFile(): Promise<void> {
    const url = chrome.runtime.getURL("assets/data/japanese/words.ljson")
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Data fetch failed: ${response.status}`)
    this.wordData = await response.arrayBuffer()
  }

  private binarySearch(word: string): number {
    if (!this.indexData || this.indexCount === 0) {
      return -1
    }

    let left = 0
    let right = this.indexCount - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const offset = this.indexData[mid * 2]
      const length = this.indexData[mid * 2 + 1]

      const midWord = this.readWordAt(offset, length)
      const comparison =
        word === midWord ? 0 : word < midWord ? -1 : 1

      if (comparison === 0) {
        return mid
      } else if (comparison < 0) {
        right = mid - 1
      } else {
        left = mid + 1
      }
    }

    return -1
  }

  private readWordAt(offset: number, length: number): string {
    if (!this.wordData) {
      throw new Error("Data file not loaded")
    }

    const bytes = new Uint8Array(this.wordData, offset, length)
    return new TextDecoder("utf-8").decode(bytes)
  }

  private readEntriesAt(lineOffset: number): JMDictEntry[] | null {
    if (!this.wordData) {
      throw new Error("Data file not loaded")
    }

    const view = new DataView(this.wordData)
    let lineEnd = lineOffset

    while (lineEnd < this.wordData.byteLength) {
      const byte = view.getUint8(lineEnd)
      if (byte === 10) {
        // newline
        break
      }
      lineEnd++
    }

    const lineLength = lineEnd - lineOffset
    const bytes = new Uint8Array(this.wordData, lineOffset, lineLength)
    const line = new TextDecoder("utf-8").decode(bytes)

    const tabIndex = line.indexOf("\t")
    if (tabIndex === -1) {
      return null
    }

    const entryJson = line.slice(tabIndex + 1)

    try {
      const parsed = JSON.parse(entryJson)
      if (Array.isArray(parsed)) {
        return parsed
      }
      return [parsed]
    } catch (e) {
      console.error("[FlatFileDictionary] Failed to parse entry:", e)
      return null
    }
  }

  public async lookup(word: string): Promise<JMDictEntry[] | null> {
    await this.initialize()

    const cacheKey = `exact:${word}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached.entries
    }

    const index = this.binarySearch(word)

    if (index !== -1) {
      const offset = this.indexData![index * 2]
      const length = this.indexData![index * 2 + 1]
      const dictWord = this.readWordAt(offset, length)

      if (dictWord === word) {
        const entries = this.readEntriesAt(offset)
        if (entries) {
          this.addToCache(cacheKey, { entries, isExact: true })
          return entries
        }
      }
    }

    return null
  }

  public async lookupWithDeinflect(
    word: string,
    deinflectFn: (word: string) => Array<{ word: string; reasons: string[] }>
  ): Promise<LookupResult | null> {
    await this.initialize()

    const cacheKey = `deinflect:${word}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const exactEntries = await this.lookup(word)
    if (exactEntries) {
      return { entries: exactEntries, isExact: true }
    }

    const deinflectedForms = deinflectFn(word)

    for (const form of deinflectedForms) {
      if (form.word === word || form.word.length < 2) continue

      const deinflectedEntries = await this.lookup(form.word)

      if (deinflectedEntries) {
        const result: LookupResult = {
          entries: deinflectedEntries,
          isExact: false,
          deinflectReasons: form.reasons
        }
        this.addToCache(cacheKey, result)
        return result
      }
    }

    return null
  }

  private addToCache(key: string, result: LookupResult): void {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, result)
  }

  public async lookupByKanji(kanji: string): Promise<JMDictEntry[] | null> {
    return this.lookup(kanji)
  }

  public async lookupByKana(kana: string): Promise<JMDictEntry[] | null> {
    return this.lookup(kana)
  }

  public getEntryCount(): number {
    return this.indexCount
  }

  public clearCache(): void {
    this.cache.clear()
  }
}

export default FlatFileDictionary.getInstance()

// Debug test function - call testDictionaryLookup('思う') in console
declare global {
  interface Window {
    testDictionaryLookup: (word: string) => Promise<JMDictEntry[] | null>
  }
}

if (typeof window !== "undefined") {
  window.testDictionaryLookup = async (
    word: string
  ): Promise<JMDictEntry[] | null> => {
    const dict = FlatFileDictionary.getInstance()
    await dict.initialize()
    const result = await dict.lookup(word)
    console.log(`testDictionaryLookup("${word}"):`, result)
    return result
  }
}
