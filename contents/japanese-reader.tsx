import kuromoji from "kuromoji"
import type { PlasmoCSConfig } from "plasmo"
import { toRomaji } from "wanakana"

import dictionaryDB from "~services/dictionaryDB"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

declare global {
  interface Window {
    __bundaiUniversalReader?: UniversalJapaneseReader
    kuromojiTokenizer?: any
  }
  interface Document {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null
  }
}

interface WordCardStyles {
  backgroundColor?: string
  textColor?: string
  fontSize?: number
  borderRadius?: number
  borderColor?: string
  wordFontSize?: number
}

interface JMDictEntry {
  kanji?: string[]
  kana?: string[]
  senses?: Array<{ gloss: string[] }>
}

interface Token {
  surface_form: string
}

// WordCard styles CSS
const WORDCARD_CSS = `
.bundai-reader-wordcard {
  position: fixed;
  z-index: 2147483647;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 20px;
  border-radius: 16px;
  min-width: 280px;
  max-width: 380px;
  border: 2px solid #a16207;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  background: linear-gradient(to bottom right, #fde047, #facc15, #eab308);
  color: #000;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.bundai-reader-wordcard.visible {
  opacity: 1;
}
.bundai-reader-wordcard-close {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 24px;
  cursor: pointer;
  opacity: 0.7;
  background: none;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
}
.bundai-reader-wordcard-close:hover {
  opacity: 1;
  background: rgba(0,0,0,0.1);
}
.bundai-reader-wordcard-word {
  font-size: 42px;
  font-weight: 800;
  margin-bottom: 4px;
  line-height: 1.2;
}
.bundai-reader-wordcard-romaji {
  font-size: 20px;
  font-style: italic;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 12px;
}
.bundai-reader-wordcard-section {
  margin: 16px 0;
}
.bundai-reader-wordcard-label {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.7;
  margin-bottom: 6px;
}
.bundai-reader-wordcard-meanings {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bundai-reader-wordcard-meaning {
  background: rgba(255,255,255,0.5);
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 500;
}
.bundai-reader-wordcard-loading {
  font-size: 16px;
  opacity: 0.7;
  padding: 20px 0;
}
.bundai-reader-wordcard-notfound {
  font-size: 14px;
  opacity: 0.6;
  font-style: italic;
}
`

class UniversalJapaneseReader {
  private isEnabled: boolean = false
  private isInitialized: boolean = false
  private wordCardElement: HTMLDivElement | null = null
  private wordCardStyles: WordCardStyles = {}
  private currentWord: string = ""
  private isSticky: boolean = false

  constructor() {
    console.log("[Universal Reader] Constructor")
    this.initialize()
  }

  async initialize() {
    console.log("[Universal Reader] Initializing...")

    try {
      // Listen for state changes from background FIRST
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          if (message.action === "setUniversalReaderEnabled") {
            console.log("[Universal Reader] Received enable message:", message.enabled)
            this.setEnabled(message.enabled)
            sendResponse({ success: true })
          }

          if (message.action === "setWordCardStyles") {
            console.log("[Universal Reader] Received styles:", message.styles)
            this.wordCardStyles = message.styles || {}
            sendResponse({ success: true })
          }
        } catch (e) {
          console.error("[Universal Reader] Message handler error:", e)
        }
        return true
      })

      // Initialize kuromoji tokenizer
      if (!window.kuromojiTokenizer) {
        try {
          const tokenizer = await new Promise<any>((resolve, reject) => {
            kuromoji
              .builder({
                dicPath: chrome.runtime.getURL("node_modules/kuromoji/dict/")
              })
              .build((err, tokenizer) => {
                if (err) reject(err)
                else resolve(tokenizer)
              })
          })
          window.kuromojiTokenizer = tokenizer
          console.log("[Universal Reader] Kuromoji tokenizer loaded")
        } catch (e) {
          console.error("[Universal Reader] Kuromoji failed to load:", e)
        }
      }

      // Initialize dictionary
      try {
        await dictionaryDB.initialize()
        console.log("[Universal Reader] Dictionary ready")
      } catch (e) {
        console.error("[Universal Reader] Dictionary failed to initialize:", e)
      }

      this.isInitialized = true
      console.log("[Universal Reader] Initialization complete")

      // Request initial state
      chrome.runtime.sendMessage(
        { action: "getUniversalReaderEnabled" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[Universal Reader] Failed to get initial state:", chrome.runtime.lastError)
            return
          }
          if (response) {
            const enabled = response.extensionEnabled && response.universalReaderEnabled
            console.log("[Universal Reader] Initial state:", enabled)
            this.setEnabled(enabled)
          }
        }
      )

      // Load styles
      chrome.runtime.sendMessage(
        { action: "getWordCardStyles" },
        (response) => {
          if (chrome.runtime.lastError) return
          if (response?.styles) {
            this.wordCardStyles = response.styles
          }
        }
      )
    } catch (error) {
      console.error("[Universal Reader] Failed to initialize:", error)
    }
  }

  setEnabled(enabled: boolean) {
    if (this.isEnabled === enabled) return

    console.log("[Universal Reader] setEnabled:", enabled)
    this.isEnabled = enabled

    if (enabled) {
      this.start()
    } else {
      this.stop()
    }
  }

  private start() {
    console.log("[Universal Reader] Starting...")
    this.injectStyles()
    this.createWordCard()
    this.setupListeners()
  }

  private stop() {
    console.log("[Universal Reader] Stopping...")
    this.removeListeners()
    this.removeWordCard()
  }

  private injectStyles() {
    if (document.getElementById("bundai-reader-styles")) return

    const style = document.createElement("style")
    style.id = "bundai-reader-styles"
    style.textContent = WORDCARD_CSS
    document.head.appendChild(style)
  }

  private createWordCard() {
    if (this.wordCardElement) return

    this.wordCardElement = document.createElement("div")
    this.wordCardElement.className = "bundai-reader-wordcard"
    this.wordCardElement.innerHTML = `
      <button class="bundai-reader-wordcard-close">×</button>
      <div class="bundai-reader-wordcard-word"></div>
      <div class="bundai-reader-wordcard-romaji"></div>
      <div class="bundai-reader-wordcard-content"></div>
    `
    document.body.appendChild(this.wordCardElement)

    // Close button handler
    const closeBtn = this.wordCardElement.querySelector(".bundai-reader-wordcard-close")
    closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation()
      this.hideWordCard()
    })

    console.log("[Universal Reader] WordCard created")
  }

  private removeWordCard() {
    if (this.wordCardElement) {
      this.wordCardElement.remove()
      this.wordCardElement = null
    }
    this.currentWord = ""
    this.isSticky = false
  }

  private async showWordCard(word: string, x: number, y: number) {
    if (!this.wordCardElement || !word) return

    this.currentWord = word

    const wordEl = this.wordCardElement.querySelector(".bundai-reader-wordcard-word") as HTMLElement
    const romajiEl = this.wordCardElement.querySelector(".bundai-reader-wordcard-romaji") as HTMLElement
    const contentEl = this.wordCardElement.querySelector(".bundai-reader-wordcard-content") as HTMLElement

    if (wordEl) wordEl.textContent = word
    if (romajiEl) romajiEl.textContent = ""
    if (contentEl) contentEl.innerHTML = '<div class="bundai-reader-wordcard-loading">Loading...</div>'

    // Position the card
    const cardWidth = 320
    const cardHeight = 200
    let left = x - cardWidth / 2
    let top = y - cardHeight - 20

    // Keep within viewport
    left = Math.max(10, Math.min(left, window.innerWidth - cardWidth - 10))
    top = Math.max(10, top)
    if (top < 10) top = y + 30

    this.wordCardElement.style.left = `${left}px`
    this.wordCardElement.style.top = `${top}px`
    this.wordCardElement.classList.add("visible")

    // Lookup in dictionary
    try {
      const entry = await dictionaryDB.lookup(word)
      if (entry && this.currentWord === word) {
        this.renderEntry(entry, word)
      } else if (this.currentWord === word) {
        if (contentEl) contentEl.innerHTML = '<div class="bundai-reader-wordcard-notfound">No dictionary entry found</div>'
      }
    } catch (e) {
      console.error("[Universal Reader] Dictionary lookup error:", e)
      if (contentEl) contentEl.innerHTML = '<div class="bundai-reader-wordcard-notfound">Lookup failed</div>'
    }
  }

  private renderEntry(entry: JMDictEntry, word: string) {
    if (!this.wordCardElement) return

    const romajiEl = this.wordCardElement.querySelector(".bundai-reader-wordcard-romaji") as HTMLElement
    const contentEl = this.wordCardElement.querySelector(".bundai-reader-wordcard-content") as HTMLElement

    // Romaji
    const kana = entry.kana?.[0] || word
    try {
      if (romajiEl) romajiEl.textContent = toRomaji(kana)
    } catch {
      if (romajiEl) romajiEl.textContent = kana
    }

    // Meanings
    const meanings = entry.senses?.flatMap(s => s.gloss).filter(Boolean).slice(0, 4) || []

    let html = ""
    if (meanings.length > 0) {
      html += '<div class="bundai-reader-wordcard-section">'
      html += '<div class="bundai-reader-wordcard-label">Meanings</div>'
      html += '<div class="bundai-reader-wordcard-meanings">'
      for (const meaning of meanings) {
        html += `<span class="bundai-reader-wordcard-meaning">${this.escapeHtml(meaning)}</span>`
      }
      html += '</div></div>'
    } else {
      html = '<div class="bundai-reader-wordcard-notfound">No meanings found</div>'
    }

    if (contentEl) contentEl.innerHTML = html
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  private hideWordCard() {
    if (this.wordCardElement) {
      this.wordCardElement.classList.remove("visible")
    }
    this.currentWord = ""
    this.isSticky = false
  }

  private hoverHandler: ((e: MouseEvent) => void) | null = null
  private clickHandler: ((e: MouseEvent) => void) | null = null

  private containsJapanese(text: string): boolean {
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)
  }

  private tokenize(text: string): Token[] {
    if (!window.kuromojiTokenizer) return []
    try {
      return window.kuromojiTokenizer.tokenize(text)
    } catch {
      return []
    }
  }

  private getWordAtPosition(text: string, offset: number): string | null {
    if (!this.containsJapanese(text)) return null

    const tokens = this.tokenize(text)
    let pos = 0
    for (const token of tokens) {
      const end = pos + token.surface_form.length
      if (offset >= pos && offset < end) {
        if (this.containsJapanese(token.surface_form)) {
          return token.surface_form
        }
        return null
      }
      pos = end
    }
    return null
  }

  private getTextAtPoint(x: number, y: number): { text: string; offset: number } | null {
    try {
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y)
        if (pos?.offsetNode?.nodeType === Node.TEXT_NODE) {
          return { text: pos.offsetNode.textContent || "", offset: pos.offset }
        }
      } else if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y)
        if (range?.startContainer.nodeType === Node.TEXT_NODE) {
          return { text: range.startContainer.textContent || "", offset: range.startOffset }
        }
      }
    } catch (e) {
      // Ignore errors
    }
    return null
  }

  private setupListeners() {
    console.log("[Universal Reader] Setting up listeners")

    this.hoverHandler = (e: MouseEvent) => {
      if (this.isSticky) return

      const info = this.getTextAtPoint(e.clientX, e.clientY)
      if (!info || !this.containsJapanese(info.text)) {
        if (this.currentWord && !this.isSticky) {
          this.hideWordCard()
        }
        return
      }

      const word = this.getWordAtPosition(info.text, info.offset)
      if (word && word !== this.currentWord) {
        this.showWordCard(word, e.clientX, e.clientY)
      } else if (!word && this.currentWord && !this.isSticky) {
        this.hideWordCard()
      }
    }

    this.clickHandler = (e: MouseEvent) => {
      // Click outside card closes it
      if (this.isSticky) {
        const target = e.target as HTMLElement
        if (!target.closest(".bundai-reader-wordcard")) {
          this.hideWordCard()
          return
        }
      }

      const info = this.getTextAtPoint(e.clientX, e.clientY)
      if (!info) return

      const word = this.getWordAtPosition(info.text, info.offset)
      if (word) {
        this.isSticky = true
        this.showWordCard(word, e.clientX, e.clientY)
      }
    }

    document.addEventListener("mousemove", this.hoverHandler, true)
    document.addEventListener("click", this.clickHandler, true)
    console.log("[Universal Reader] Listeners set up")
  }

  private removeListeners() {
    if (this.hoverHandler) {
      document.removeEventListener("mousemove", this.hoverHandler, true)
      this.hoverHandler = null
    }
    if (this.clickHandler) {
      document.removeEventListener("click", this.clickHandler, true)
      this.clickHandler = null
    }
    console.log("[Universal Reader] Listeners removed")
  }
}

// Initialize
function initReader() {
  try {
    if (!window.__bundaiUniversalReader) {
      console.log("[Universal Reader] Creating new instance")
      window.__bundaiUniversalReader = new UniversalJapaneseReader()
    }
    console.log("[Universal Reader] Script loaded")
  } catch (error) {
    console.error("[Universal Reader] Failed to initialize:", error)
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initReader)
} else {
  initReader()
}
