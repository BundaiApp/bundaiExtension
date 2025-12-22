import type { PlasmoCSConfig } from "plasmo"

import dictionaryDB from "~services/dictionaryDB"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

declare global {
  interface Window {
    __bundaiUniversalReader?: UniversalJapaneseReader
  }
}

class UniversalJapaneseReader {
  private isEnabled: boolean = false
  private isInitialized: boolean = false
  private tooltip: HTMLDivElement | null = null

  constructor() {
    console.log("[Universal Reader] Constructor")
    this.initialize()
  }

  startBasicTesting() {
    console.log("[Universal Reader] STARTING BASIC TESTING")

    // Test if script can see mouse at all
    let testCount = 0

    const checkInterval = setInterval(() => {
      testCount++
      console.log(
        "[Universal Reader] Test check",
        testCount,
        "Document ready:",
        document.readyState
      )

      if (document.readyState === "complete") {
        console.log(
          "[Universal Reader] Document is complete, adding test click handler"
        )

        // Add simple click test
        document.addEventListener(
          "click",
          () => {
            console.log("[Universal Reader] CLICK DETECTED!!!")
          },
          { once: true }
        )

        clearInterval(checkInterval)
      }
    }, 1000)

    // Auto-clear after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval)
      console.log("[Universal Reader] Test complete")
    }, 10000)
  }

  async initialize() {
    console.log("[Universal Reader] Initializing...")

    try {
      await dictionaryDB.initialize()
      console.log("[Universal Reader] Dictionary ready")

      this.isInitialized = true
      console.log("[Universal Reader] Initialization complete")

      // Listen for state changes from background
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "setUniversalReaderEnabled") {
          console.log(
            "[Universal Reader] Received enable message:",
            message.enabled
          )
          this.setEnabled(message.enabled)
          sendResponse({ success: true })
        }

        if (message.action === "setWordCardStyles") {
          sendResponse({ success: true })
        }
      })

      // Request initial state from background
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
    this.setupHoverListeners()
  }

  private stop() {
    console.log("[Universal Reader] Stopping...")
    this.removeHoverListeners()
    this.hideTooltip()
  }

  private hoverHandler: ((event: MouseEvent) => void) | null = null
  private mouseOutHandler: (() => void) | null = null

  // Check if text contains Japanese characters (hiragana, katakana, or kanji)
  private containsJapanese(text: string): boolean {
    // Hiragana: \u3040-\u309F
    // Katakana: \u30A0-\u30FF
    // Kanji: \u4E00-\u9FAF
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)
  }

  private setupHoverListeners() {
    console.log("[Universal Reader] Setting up listeners")

    this.hoverHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const text = target.textContent || ""

      if (this.containsJapanese(text)) {
        console.log("[Universal Reader] Japanese text found:", text.slice(0, 50))

        // Remove existing tooltip
        this.hideTooltip()

        // Create tooltip near cursor
        this.tooltip = document.createElement("div")
        this.tooltip.style.cssText = `
          position: fixed;
          top: ${event.clientY + 20}px;
          left: ${event.clientX}px;
          background: #fde047;
          color: #000;
          padding: 12px;
          border-radius: 8px;
          border: 2px solid #a16207;
          z-index: 999999;
          max-width: 300px;
          font-size: 14px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `
        this.tooltip.textContent = `Japanese: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`

        document.body.appendChild(this.tooltip)
      }
    }

    this.mouseOutHandler = () => {
      this.hideTooltip()
    }

    document.addEventListener("mouseover", this.hoverHandler, true)
    document.addEventListener("mouseout", this.mouseOutHandler, true)
    console.log("[Universal Reader] Listeners set up")
  }

  private removeHoverListeners() {
    if (this.hoverHandler) {
      document.removeEventListener("mouseover", this.hoverHandler, true)
      this.hoverHandler = null
    }
    if (this.mouseOutHandler) {
      document.removeEventListener("mouseout", this.mouseOutHandler, true)
      this.mouseOutHandler = null
    }
    console.log("[Universal Reader] Listeners removed")
  }

  private hideTooltip() {
    if (this.tooltip) {
      this.tooltip.remove()
      this.tooltip = null
    }
  }
}

if (!window.__bundaiUniversalReader) {
  console.log("[Universal Reader] Creating new instance")
  window.__bundaiUniversalReader = new UniversalJapaneseReader()
}

console.log("[Universal Reader] Script loaded")
