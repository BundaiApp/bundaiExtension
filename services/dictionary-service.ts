// Unified Dictionary Service - integrates FlatFileDictionary with Deinflection
// Provides simple lookup interface with automatic deinflection

import { deinflect } from "./deinflect"
import flatFileDictionary, {
  type JMDictEntry,
  type LookupResult
} from "./flat-file-dictionary"

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
  lookup(word: string): Promise<DictionaryEntry | null>
  lookupWithDeinflect(word: string): Promise<DictionaryEntry | null>
  initialize(): Promise<void>
  isReady(): boolean
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

  async lookup(word: string): Promise<DictionaryEntry | null> {
    await this.initialize()

    const entry = await this.flatFile.lookup(word)
    if (!entry) {
      return null
    }

    return this.formatEntry(word, entry, true)
  }

  async lookupWithDeinflect(word: string): Promise<DictionaryEntry | null> {
    await this.initialize()

    const result = await this.flatFile.lookupWithDeinflect(word, deinflect)
    if (!result) {
      return null
    }

    return this.formatEntry(
      word,
      result.entry,
      result.isExact,
      result.deinflectReasons
    )
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
