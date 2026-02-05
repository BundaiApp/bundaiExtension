// Lightweight phrase dictionary loader (JSONL)

export interface PhraseEntry {
  phrase: string
  freq: number
  showFreq: number
  pmi: number
  tokenKey?: string
}

class PhraseDictionary {
  private initPromise: Promise<void> | null = null
  private loaded = false
  private phrases: Map<string, PhraseEntry> = new Map()
  private supplement: Map<string, PhraseEntry> = new Map()
  private supplementKey: string | null = null

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.load()
    return this.initPromise
  }

  private async load(): Promise<void> {
    try {
      const url = chrome.runtime.getURL("assets/data/japanese/phrases.jsonl")
      const response = await fetch(url)
      const text = await response.text()
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue
        const entry = JSON.parse(line) as PhraseEntry
        if (!entry?.phrase) continue
        this.phrases.set(entry.phrase, entry)
      }
      this.loaded = true
      console.log(
        `[PhraseDictionary] Loaded ${this.phrases.size} phrases from ${url}`
      )
    } catch (error) {
      console.error("[PhraseDictionary] Failed to load phrases:", error)
      this.loaded = false
    }
  }

  async setSupplementKey(key: string | null): Promise<void> {
    if (!key) {
      if (this.supplementKey || this.supplement.size > 0) {
        this.supplementKey = null
        this.supplement.clear()
        console.log("[PhraseDictionary] Cleared supplement phrases")
      }
      return
    }
    if (key === this.supplementKey) {
      return
    }
    this.supplementKey = key
    this.supplement.clear()

    try {
      const url = chrome.runtime.getURL(
        `assets/data/japanese/phrases/${key}.jsonl`
      )
      const response = await fetch(url)
      if (!response.ok) {
        console.warn(
          `[PhraseDictionary] Supplement not found: ${key} (${response.status})`
        )
        return
      }
      const text = await response.text()
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue
        const entry = JSON.parse(line) as PhraseEntry
        if (!entry?.phrase) continue
        this.supplement.set(entry.phrase, entry)
      }
      console.log(
        `[PhraseDictionary] Loaded ${this.supplement.size} phrases for ${key}`
      )
    } catch (error) {
      console.error("[PhraseDictionary] Failed to load supplement:", error)
    }
  }

  isReady(): boolean {
    return this.loaded
  }

  has(phrase: string): boolean {
    return this.supplement.has(phrase) || this.phrases.has(phrase)
  }

  get(phrase: string): PhraseEntry | null {
    return this.supplement.get(phrase) || this.phrases.get(phrase) || null
  }
}

const phraseDictionary = new PhraseDictionary()
export default phraseDictionary
