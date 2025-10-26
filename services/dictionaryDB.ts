interface JMDictEntry {
  kanji?: string[]
  kana?: string[]
  senses?: Array<{
    gloss: string[]
  }>
}

class DictionaryDB {
  private static instance: DictionaryDB
  private db: IDBDatabase | null = null
  private readonly DB_NAME = "BundaiDictionaryDB"
  private readonly DB_VERSION = 1
  private readonly STORE_NAME = "jmdict"
  private initPromise: Promise<void> | null = null
  private progressCallback: ((progress: number, total: number) => void) | null = null

  private constructor() {}

  public static getInstance(): DictionaryDB {
    if (!DictionaryDB.instance) {
      DictionaryDB.instance = new DictionaryDB()
    }
    return DictionaryDB.instance
  }

  /**
   * Set progress callback for loading
   */
  public onProgress(callback: (progress: number, total: number) => void): void {
    this.progressCallback = callback
  }

  /**
   * Initialize database - loads JSON only if database is empty
   */
  public async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initialize()
    return this.initPromise
  }

  private async _initialize(): Promise<void> {
    try {
      // Open database
      this.db = await this.openDatabase()

      // Check if already populated
      const count = await this.getCount()
      
      if (count === 0) {
        console.log("[DictionaryDB] Database empty, loading JMdict data...")
        await this.loadJMdictData()
        console.log("[DictionaryDB] Database populated successfully")
      } else {
        console.log(`[DictionaryDB] Database already populated with ${count} entries`)
      }
    } catch (error) {
      console.error("[DictionaryDB] Failed to initialize:", error)
      throw error
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store with auto-incrementing id
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, {
            keyPath: "id",
            autoIncrement: true
          })

          // Create indexes for fast lookups
          store.createIndex("kanji", "kanji", { unique: false, multiEntry: true })
          store.createIndex("kana", "kana", { unique: false, multiEntry: true })
        }
      }
    })
  }

  private async getCount(): Promise<number> {
    if (!this.db) throw new Error("Database not initialized")

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.count()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private async loadJMdictData(): Promise<void> {
    try {
      // Fetch the JSON file (web_accessible_resource)
      const response = await fetch(
        chrome.runtime.getURL("assets/data/japanese/jmdict-simplified-flat-full.json")
      )
      const data: JMDictEntry[] = await response.json()

      if (!this.db) throw new Error("Database not initialized")

      const total = data.length
      let processed = 0
      const batchSize = 1000

      // Process in batches with separate transactions
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize)
        
        // Create new transaction for each batch
        const transaction = this.db.transaction([this.STORE_NAME], "readwrite")
        const store = transaction.objectStore(this.STORE_NAME)
        
        for (const entry of batch) {
          store.add(entry)
        }

        // Wait for this batch to complete
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
        })

        processed += batch.length
        
        // Report progress
        if (this.progressCallback) {
          this.progressCallback(processed, total)
        }
        
        console.log(`[DictionaryDB] Loaded ${processed}/${total} entries`)
      }

      console.log(`[DictionaryDB] Successfully loaded ${total} entries`)
    } catch (error) {
      console.error("[DictionaryDB] Failed to load JMdict data:", error)
      throw error
    }
  }

  /**
   * Lookup word by kanji
   */
  public async lookupByKanji(word: string): Promise<JMDictEntry | null> {
    if (!this.db) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const index = store.index("kanji")
      const request = index.get(word)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Lookup word by kana (reading)
   */
  public async lookupByKana(word: string): Promise<JMDictEntry | null> {
    if (!this.db) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const index = store.index("kana")
      const request = index.get(word)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Lookup word (tries kanji first, then kana)
   */
  public async lookup(word: string): Promise<JMDictEntry | null> {
    const kanjiResult = await this.lookupByKanji(word)
    if (kanjiResult) return kanjiResult

    return this.lookupByKana(word)
  }

  /**
   * Get random entries for quiz generation
   */
  public async getRandomEntries(count: number, excludeWord?: string): Promise<JMDictEntry[]> {
    if (!this.db) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], "readonly")
      const store = transaction.objectStore(this.STORE_NAME)
      const countRequest = store.count()

      countRequest.onsuccess = () => {
        const total = countRequest.result
        if (total === 0) {
          resolve([])
          return
        }

        const results: JMDictEntry[] = []
        const randomKeys: number[] = []
        
        // Generate random keys (IDs start from 1 in auto-increment)
        while (randomKeys.length < Math.min(count * 2, 20)) {
          const randomKey = Math.floor(Math.random() * total) + 1
          if (!randomKeys.includes(randomKey)) {
            randomKeys.push(randomKey)
          }
        }

        let fetched = 0

        // Fetch each random entry by key
        randomKeys.forEach((key) => {
          const getRequest = store.get(key)

          getRequest.onsuccess = () => {
            fetched++
            const entry = getRequest.result as JMDictEntry | undefined

            if (entry && entry.senses?.[0]?.gloss?.[0]) {
              // Exclude the current word if specified
              const entryWords = [...(entry.kanji || []), ...(entry.kana || [])]
              const shouldExclude = excludeWord && entryWords.some(w => w === excludeWord)
              
              if (!shouldExclude && results.length < count) {
                results.push(entry)
              }
            }

            // Resolve when all requests complete
            if (fetched === randomKeys.length) {
              resolve(results)
            }
          }

          getRequest.onerror = () => {
            fetched++
            if (fetched === randomKeys.length) {
              resolve(results)
            }
          }
        })
      }

      countRequest.onerror = () => reject(countRequest.error)
    })
  }

  /**
   * Clear database (for debugging/reset)
   */
  public async clear(): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], "readwrite")
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export default DictionaryDB.getInstance()
