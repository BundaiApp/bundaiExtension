// Unified Dictionary Service - integrates FlatFileDictionary with Deinflection
// Provides simple lookup interface with automatic deinflection

import { toHiragana } from "wanakana"

import { deinflect } from "./deinflect"
import flatFileDictionary, { type JMDictEntry } from "./flat-file-dictionary"

export interface DictionaryEntry {
  word: string
  reading?: string
  meanings: string[]
  partOfSpeech?: string[]
  entry: JMDictEntry
  isExact: boolean
  deinflectReasons?: string[]
}

export interface DictionaryService {
  lookup(word: string, options?: LookupOptions): Promise<DictionaryEntry | null>
  lookupWithDeinflect(
    word: string,
    options?: LookupOptions
  ): Promise<DictionaryEntry | null>
  initialize(): Promise<void>
  isReady(): boolean
}

export interface LookupOptions {
  reading?: string
}

class UnifiedDictionaryService implements DictionaryService {
  private flatFile: typeof flatFileDictionary
  private ready = false
  private initPromise: Promise<void> | null = null

  constructor() {
    this.flatFile = flatFileDictionary
  }

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initialize()
    return this.initPromise
  }

  private async _initialize(): Promise<void> {
    await this.flatFile.initialize()
    this.ready = true
    console.log(
      "[DictionaryService] Initialized with FlatFileDictionary + Deinflection"
    )
  }

  isReady(): boolean {
    return this.ready
  }

  async lookup(
    word: string,
    options?: LookupOptions
  ): Promise<DictionaryEntry | null> {
    await this.initialize()

    const entries = await this.flatFile.lookup(word)
    if (!entries || entries.length === 0) {
      return null
    }

    const bestEntry = this.selectBestEntry(entries, options)
    return this.formatEntry(word, bestEntry, true)
  }

  async lookupWithDeinflect(
    word: string,
    options?: LookupOptions
  ): Promise<DictionaryEntry | null> {
    await this.initialize()

    const result = await this.flatFile.lookupWithDeinflect(word, deinflect)
    if (!result || result.entries.length === 0) {
      return null
    }

    const bestEntry = this.selectBestEntry(result.entries, options)
    return this.formatEntry(
      word,
      bestEntry,
      result.isExact,
      result.deinflectReasons
    )
  }

  private selectBestEntry(
    entries: JMDictEntry[],
    options?: LookupOptions
  ): JMDictEntry {
    const reading = options?.reading
      ? toHiragana(options.reading)
      : undefined

    if (reading) {
      const match = entries.find((entry) =>
        entry.kana?.some((kana) => kana === reading)
      )
      if (match) {
        return match
      }
    }

    return entries[0]
  }

  private formatEntry(
    word: string,
    entry: JMDictEntry,
    isExact: boolean,
    deinflectReasons?: string[]
  ): DictionaryEntry {
    const meanings: string[] = []
    let reading: string | undefined

    if (entry.senses) {
      for (const sense of entry.senses) {
        if (sense.gloss) {
          meanings.push(...sense.gloss)
        }
      }
    }

    if (entry.kana && entry.kana.length > 0) {
      reading = entry.kana[0]
    }

    const partOfSpeech = entry.senses?.[0]?.pos

    return {
      word,
      reading,
      meanings,
      partOfSpeech,
      entry,
      isExact,
      deinflectReasons
    }
  }

  async getEntryCount(): Promise<number> {
    await this.initialize()
    return this.flatFile.getEntryCount()
  }

  clearCache(): void {
    this.flatFile.clearCache()
  }
}

export const dictionaryService = new UnifiedDictionaryService()
export default dictionaryService
