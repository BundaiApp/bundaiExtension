import { ApolloProvider, useMutation } from "@apollo/client"
import cssText from "data-text:~style.css"
import kuromoji from "kuromoji"
import type { PlasmoCSConfig } from "plasmo"
import { toRomaji } from "wanakana"

import client from "../graphql"
import { ADD_FLASH_CARD_MUTATION } from "../graphql/mutations/addFlashCard.mutation"

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

// Define the configuration for the content script
export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*", "*://*/*"], // Works on YouTube and other video sites
  all_frames: true
}

interface SubtitleCue {
  start: number
  end: number
  text: string
}

interface SubtitleSettings {
  subtitle1: {
    fontSize: number
    color: string
    backgroundColor: string
    opacity: number
  }
  subtitle2: {
    fontSize: number
    color: string
    backgroundColor: string
    opacity: number
  }
  position: number // percentage from bottom
  gap: number // gap between subtitles in pixels
}

interface JMDictEntry {
  kanji?: string[]
  kana?: string[]
  senses?: Array<{
    gloss: string[]
  }>
}

interface Token {
  surface_form: string
}

// Global declarations
declare global {
  interface Window {
    jmdictData: JMDictEntry[]
    jmdictIndex: Record<string, JMDictEntry>
    jmdictKanaIndex: Record<string, JMDictEntry>
    jmdictLoaded: boolean
    kuromojiTokenizer: any
  }
}

class CustomSubtitleContainer {
  private videoElement: HTMLVideoElement | null = null
  private subtitleContainer: HTMLDivElement | null = null
  private subtitle1Element: HTMLDivElement | null = null
  private subtitle2Element: HTMLDivElement | null = null
  private wordCardElement: HTMLDivElement | null = null
  private updateInterval: NodeJS.Timeout | null = null
  private observer: MutationObserver | null = null
  private isEnabled: boolean = false // Track if extension is enabled

  private settings: SubtitleSettings = {
    subtitle1: {
      fontSize: 24,
      color: "#ffffff",
      backgroundColor: "#000000",
      opacity: 0.8
    },
    subtitle2: {
      fontSize: 20,
      color: "#ffffff",
      backgroundColor: "#000000",
      opacity: 0.8
    },
    position: 15, // 15% from bottom
    gap: 10 // 10px gap between subtitles
  }

  // Real subtitle data from selected URLs
  private subtitle1Data: SubtitleCue[] = []
  private subtitle2Data: SubtitleCue[] = []
  private subtitle1Url: string | null = null
  private subtitle2Url: string | null = null

  // YouTube approach: track last processed text
  private lastProcessedSubtitle1Text: string = ""
  private lastProcessedSubtitle2Text: string = ""

  // Word card state
  private wordCard: {
    word: string
    mouseX: number
    isVisible: boolean
    isSticky: boolean
    entry: JMDictEntry | null
    isLoading: boolean
  } = {
    word: "",
    mouseX: 0,
    isVisible: false,
    isSticky: false,
    entry: null,
    isLoading: false
  }

  // Japanese processing
  private isJapaneseEnabled: boolean = true
  private isInitialized: boolean = false

  constructor() {
    this.setupMessageListener()
    this.initializeJapanese()
    this.checkExtensionEnabled() // Check if extension is enabled before initializing
  }

  private async checkExtensionEnabled(): Promise<void> {
    try {
      // Check if extension is enabled from secure storage
      const result = await this.getExtensionEnabledState()
      this.isEnabled = result

      if (this.isEnabled) {
        this.init()
      } else {
        console.log(
          "[Custom Subtitles] Extension is disabled, not initializing subtitle container"
        )
      }
    } catch (error) {
      console.error("[Custom Subtitles] Error checking extension state:", error)
      // Default to disabled if we can't check
      this.isEnabled = false
    }
  }

  private async getExtensionEnabledState(): Promise<boolean> {
    return new Promise((resolve) => {
      // Send message to background script or popup to get enabled state
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: "getExtensionState" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log(
                "[Custom Subtitles] Could not get extension state, assuming disabled"
              )
              resolve(false)
            } else {
              resolve(response?.enabled || false)
            }
          }
        )
      } else {
        resolve(false)
      }
    })
  }

  private async initializeJapanese(): Promise<void> {
    try {
      // Initialize Kuromoji tokenizer
      if (!window.kuromojiTokenizer) {
        const tokenizer = await new Promise<any>((resolve, reject) => {
          kuromoji
            .builder({
              dicPath: chrome.runtime.getURL("node_modules/kuromoji/dict/")
            })
            .build((err, tokenizer) => {
              if (err) {
                reject(err)
                return
              }
              resolve(tokenizer)
            })
        })
        window.kuromojiTokenizer = tokenizer
      }

      // Load JMdict data
      if (!window.jmdictLoaded) {
        try {
          const response = await fetch(
            chrome.runtime.getURL(
              "assets/data/japanese/jmdict-simplified-flat-full.json"
            )
          )
          window.jmdictData = await response.json()
          window.jmdictIndex = {}
          window.jmdictKanaIndex = {}

          window.jmdictData.forEach((entry) => {
            if (Array.isArray(entry.kanji)) {
              entry.kanji.forEach((kanji) => {
                window.jmdictIndex[kanji] = entry
              })
            }
            if (Array.isArray(entry.kana)) {
              entry.kana.forEach((kana) => {
                window.jmdictKanaIndex[kana] = entry
              })
            }
          })

          window.jmdictLoaded = true
          console.log(
            "[Custom Subtitles] JMdict loaded:",
            window.jmdictData.length,
            "entries"
          )
        } catch (e) {
          console.error("[Custom Subtitles] Failed to load JMdict:", e)
          window.jmdictData = []
          window.jmdictIndex = {}
          window.jmdictKanaIndex = {}
          window.jmdictLoaded = true
        }
      }

      this.isInitialized = true
    } catch (error) {
      console.error(
        "[Custom Subtitles] Failed to initialize Japanese processing:",
        error
      )
      this.isInitialized = false
    }
  }

  private init(): void {
    // Only initialize if extension is enabled
    if (!this.isEnabled) {
      console.log(
        "[Custom Subtitles] Extension disabled, skipping initialization"
      )
      return
    }

    // Try to find video element immediately
    this.findAndSetupVideo()

    // If no video found, observe for video elements
    if (!this.videoElement) {
      this.observeForVideo()
    }
  }

  private findAndSetupVideo(): void {
    // Only proceed if extension is enabled
    if (!this.isEnabled) return

    // Look for video elements
    const videos = document.querySelectorAll(
      "video"
    ) as NodeListOf<HTMLVideoElement>

    if (videos.length > 0) {
      // For YouTube, prefer the main video player
      let targetVideo = Array.from(videos).find(
        (video) =>
          video.classList.contains("html5-main-video") ||
          video.closest(".html5-video-player")
      )

      // If no YouTube-specific video found, use the largest video
      if (!targetVideo) {
        targetVideo = Array.from(videos).reduce((largest, current) => {
          const largestArea = largest.offsetWidth * largest.offsetHeight
          const currentArea = current.offsetWidth * current.offsetHeight
          return currentArea > largestArea ? current : largest
        })
      }

      if (targetVideo && targetVideo !== this.videoElement) {
        this.videoElement = targetVideo
        this.setupSubtitleContainer()
        console.log(
          "[Custom Subtitles] Video element found and subtitles setup"
        )
      }
    }
  }

  private observeForVideo(): void {
    // Only observe if extension is enabled
    if (!this.isEnabled) return

    this.observer = new MutationObserver((mutations) => {
      // Check if we already have a video or if extension is disabled
      if (this.videoElement || !this.isEnabled) return

      // Look for new video elements
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const addedNodes = Array.from(mutation.addedNodes) as Element[]
          for (const node of addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const videos = (node as Element).querySelectorAll?.("video") || []
              if (videos.length > 0 || (node as Element).tagName === "VIDEO") {
                this.findAndSetupVideo()
                if (this.videoElement) {
                  this.observer?.disconnect()
                  return
                }
              }
            }
          }
        }
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  private setupSubtitleContainer(): void {
    // Only setup if extension is enabled
    if (!this.videoElement || !this.isEnabled) return

    // Remove existing container if it exists
    this.removeSubtitleContainer()

    // Create main subtitle container
    this.subtitleContainer = document.createElement("div")
    this.subtitleContainer.className = "custom-subtitle-container"
    this.subtitleContainer.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: ${this.settings.position}%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${this.settings.gap}px;
      pointer-events: auto;
      max-width: 80%;
      min-width: 300px;
    `

    // Create subtitle 1 element
    this.subtitle1Element = document.createElement("div")
    this.subtitle1Element.className = "custom-subtitle subtitle-1"
    this.applySubtitleStyles(this.subtitle1Element, this.settings.subtitle1)
    this.subtitleContainer.appendChild(this.subtitle1Element)

    // Create subtitle 2 element
    this.subtitle2Element = document.createElement("div")
    this.subtitle2Element.className = "custom-subtitle subtitle-2"
    this.applySubtitleStyles(this.subtitle2Element, this.settings.subtitle2)
    this.subtitleContainer.appendChild(this.subtitle2Element)

    // Create word card
    this.createWordCard()

    // Append to body
    document.body.appendChild(this.subtitleContainer)

    // Start updating subtitles
    this.startSubtitleUpdates()

    console.log("[Custom Subtitles] Subtitle container created and positioned")
  }

  // Method to enable/disable the extension
  public setEnabled(enabled: boolean): void {
    const wasEnabled = this.isEnabled
    this.isEnabled = enabled

    console.log(
      `[Custom Subtitles] Extension ${enabled ? "enabled" : "disabled"}`
    )

    if (enabled && !wasEnabled) {
      // Extension was just enabled - initialize everything
      this.init()
    } else if (!enabled && wasEnabled) {
      // Extension was just disabled - remove everything
      this.removeSubtitleContainer()
      this.observer?.disconnect()
      this.observer = null
      this.videoElement = null

      // Reset processing caches
      this.lastProcessedSubtitle1Text = ""
      this.lastProcessedSubtitle2Text = ""

      // Reset word card state
      this.wordCard = {
        word: "",
        mouseX: 0,
        isVisible: false,
        isSticky: false,
        entry: null,
        isLoading: false
      }
    }
  }

  private createWordCard(): void {
    this.wordCardElement = document.createElement("div")
    this.wordCardElement.className = "custom-word-card"
    this.wordCardElement.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.25s ease;
      user-select: none;
      display: none;
    `

    document.body.appendChild(this.wordCardElement)
  }

  private applySubtitleStyles(
    element: HTMLDivElement,
    subtitleSettings: any
  ): void {
    element.style.cssText = `
      background: ${this.hexToRgba(subtitleSettings.backgroundColor, subtitleSettings.opacity)};
      color: ${subtitleSettings.color};
      font-size: ${subtitleSettings.fontSize}px;
      font-family: Arial, sans-serif;
      font-weight: bold;
      padding: 8px 16px;
      border-radius: 6px;
      text-align: center;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
      line-height: 1.3;
      min-height: 20px;
      display: none;
      word-wrap: break-word;
      max-width: 100%;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      cursor: default;
    `
  }

  private hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  private startSubtitleUpdates(): void {
    // Only start if extension is enabled
    if (!this.isEnabled) return

    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }

    this.updateInterval = setInterval(() => {
      this.updateSubtitles()
    }, 100) // Update every 100ms for smooth subtitle transitions
  }

  // YouTube approach: Only process when text changes
  private updateSubtitles(): void {
    if (
      !this.videoElement ||
      !this.subtitle1Element ||
      !this.subtitle2Element ||
      !this.isEnabled
    )
      return

    const currentTime = this.videoElement.currentTime

    // Update subtitle 1
    const subtitle1Cue = this.subtitle1Data.find(
      (cue) => currentTime >= cue.start && currentTime <= cue.end
    )

    if (subtitle1Cue) {
      this.subtitle1Element.style.display = "block"
      // Only process if text changed (YouTube approach)
      if (subtitle1Cue.text !== this.lastProcessedSubtitle1Text) {
        this.lastProcessedSubtitle1Text = subtitle1Cue.text
        this.processSubtitleElement(this.subtitle1Element, subtitle1Cue.text)
      }
    } else {
      this.subtitle1Element.style.display = "none"
      if (this.lastProcessedSubtitle1Text !== "") {
        this.lastProcessedSubtitle1Text = ""
        // Clear content when no subtitle
        this.subtitle1Element.textContent = ""
      }
    }

    // Update subtitle 2
    const subtitle2Cue = this.subtitle2Data.find(
      (cue) => currentTime >= cue.start && currentTime <= cue.end
    )

    if (subtitle2Cue) {
      this.subtitle2Element.style.display = "block"
      // Only process if text changed (YouTube approach)
      if (subtitle2Cue.text !== this.lastProcessedSubtitle2Text) {
        this.lastProcessedSubtitle2Text = subtitle2Cue.text
        this.processSubtitleElement(this.subtitle2Element, subtitle2Cue.text)
      }
    } else {
      this.subtitle2Element.style.display = "none"
      if (this.lastProcessedSubtitle2Text !== "") {
        this.lastProcessedSubtitle2Text = ""
        // Clear content when no subtitle
        this.subtitle2Element.textContent = ""
      }
    }
  }

  // YouTube-style subtitle processing (exact same approach)
  private processSubtitleElement(element: HTMLDivElement, text: string): void {
    if (
      !this.isJapaneseEnabled ||
      !this.isInitialized ||
      !this.isJapaneseText(text)
    ) {
      element.textContent = text
      return
    }

    const tokens = this.tokenizeJapanese(text)
    if (tokens.length === 0) {
      element.textContent = text
      return
    }

    // Create a temporary container (YouTube approach)
    const tempContainer = document.createElement("div")
    tempContainer.style.display = "contents"

    // Use innerHTML to render the tokenized words (YouTube approach)
    tempContainer.innerHTML = tokens
      .map(
        (token, index) =>
          `<span class="tokenized-word" data-word="${this.escapeHtml(token.surface_form)}" data-index="${index}">${this.escapeHtml(token.surface_form)}</span>`
      )
      .join("")

    // Add event listeners to each tokenized word (YouTube approach)
    tempContainer.querySelectorAll(".tokenized-word").forEach((wordElement) => {
      const word = wordElement.getAttribute("data-word")
      if (!word) return

      wordElement.addEventListener("mouseenter", (e) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        this.handleWordHover(word, rect.left + rect.width / 2)
      })

      wordElement.addEventListener("mouseleave", () => {
        this.handleWordLeave()
      })

      wordElement.addEventListener("click", (e) => {
        e.stopPropagation()
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        this.handleWordClick(word, rect.left + rect.width / 2)
      })

      // Add styling (YouTube approach)
      const htmlElement = wordElement as HTMLElement
      htmlElement.style.cursor = "pointer"
      htmlElement.style.padding = "2px 4px"
      htmlElement.style.borderRadius = "4px"
      htmlElement.style.transition = "background-color 0.2s"
      htmlElement.style.display = "inline"

      // Separate styling event listeners (YouTube approach)
      htmlElement.addEventListener("mouseenter", () => {
        htmlElement.style.backgroundColor = "rgba(255, 255, 255, 0.2)"
      })

      htmlElement.addEventListener("mouseleave", () => {
        htmlElement.style.backgroundColor = "transparent"
      })
    })

    // Replace element content (YouTube approach)
    element.innerHTML = ""
    element.appendChild(tempContainer)

    // Add subtitle container hover listeners (for pause functionality)
    element.addEventListener(
      "mouseenter",
      this.handleSubtitleMouseEnter.bind(this)
    )
    element.addEventListener(
      "mouseleave",
      this.handleSubtitleMouseLeave.bind(this)
    )
  }

  // Escape HTML to prevent XSS
  private escapeHtml(text: string): string {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  private handleSubtitleMouseEnter(): void {
    if (this.videoElement && typeof this.videoElement.pause === "function") {
      this.videoElement.pause()
    }
  }

  private handleSubtitleMouseLeave(): void {
    // Optional: auto-resume on leave (uncomment if desired)
    // if (this.videoElement && typeof this.videoElement.play === 'function') {
    //   this.videoElement.play()
    // }
  }

  // Updated word hover handler (simplified like YouTube manipulator)
  private handleWordHover(word: string, mouseX: number): void {
    // Update word card state
    this.wordCard = {
      word,
      mouseX,
      isVisible: true,
      isSticky: false,
      entry: this.wordCard.word === word ? this.wordCard.entry : null,
      isLoading: word !== this.wordCard.word
    }

    this.showWordCard()
  }

  // Updated word leave handler
  private handleWordLeave(): void {
    if (!this.wordCard.isSticky) {
      this.wordCard.isVisible = false
      this.hideWordCard()
    }
  }

  // Updated word click handler
  private handleWordClick(word: string, mouseX: number): void {
    // Update word card state
    this.wordCard = {
      word,
      mouseX,
      isVisible: true,
      isSticky: true,
      entry: this.wordCard.word === word ? this.wordCard.entry : null,
      isLoading: word !== this.wordCard.word
    }

    this.showWordCard()
  }

  // Simplified showWordCard method
  private async showWordCard(): Promise<void> {
    if (!window.jmdictLoaded || !this.wordCardElement) return

    // Only fetch dictionary data if it's a new word or we don't have data
    if (this.wordCard.isLoading || !this.wordCard.entry) {
      this.wordCard.isLoading = true
      this.updateWordCardContent()

      // Find dictionary entry
      let entry = window.jmdictIndex?.[this.wordCard.word]
      if (!entry) {
        entry = window.jmdictKanaIndex?.[this.wordCard.word]
      }

      this.wordCard.entry = entry || null
      this.wordCard.isLoading = false
    }

    // Update content and position
    this.updateWordCardContent()
    this.positionWordCard()

    // Show the card
    if (this.wordCardElement && this.wordCard.isVisible) {
      this.wordCardElement.style.display = "block"
      this.wordCardElement.style.opacity = "1"
    }

    // Save to flashcard if sticky and we have an entry
    if (this.wordCard.isSticky && this.wordCard.entry) {
      this.saveToFlashcard(this.wordCard.word, this.wordCard.entry)
    }
  }

  private hideWordCard(): void {
    if (!this.wordCardElement) return

    this.wordCardElement.style.opacity = "0"

    setTimeout(() => {
      if (!this.wordCard.isVisible && this.wordCardElement) {
        this.wordCardElement.style.display = "none"
      }
    }, 250)
  }

  // Updated positioning method (similar to React component)
  private positionWordCard(): void {
    if (!this.wordCardElement || !this.subtitleContainer) return

    // Force layout calculation
    this.wordCardElement.style.visibility = "hidden"
    this.wordCardElement.style.display = "block"

    const cardRect = this.wordCardElement.getBoundingClientRect()
    const cardWidth = Math.max(cardRect.width, 300)
    const cardHeight = cardRect.height
    const margin = 12

    const containerRect = this.subtitleContainer.getBoundingClientRect()
    let left = this.wordCard.mouseX - cardWidth / 2

    // Clamp to container bounds (like React component)
    left = Math.max(
      containerRect.left,
      Math.min(left, containerRect.right - cardWidth)
    )

    const top = containerRect.top - cardHeight - margin

    // Apply position
    this.wordCardElement.style.left = `${left}px`
    this.wordCardElement.style.top = `${top}px`
    this.wordCardElement.style.visibility = "visible"
  }

  // Update the word card styling to use Tailwind-like approach
  private updateWordCardContent(): void {
    if (!this.wordCardElement) return

    let romaji = ""
    try {
      if (
        this.wordCard.entry &&
        Array.isArray(this.wordCard.entry.kana) &&
        this.wordCard.entry.kana[0]
      ) {
        romaji = toRomaji(this.wordCard.entry.kana[0])
      } else if (this.wordCard.word) {
        romaji = toRomaji(this.wordCard.word)
      }
    } catch (e) {
      console.error("Romaji conversion error:", e)
      romaji = ""
    }

    const buttons = `
    <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 8px;">
      <button onclick="alert('Add action here')" 
              style="background: none; border: none; color: black; font-size: 22px; cursor: pointer; padding: 4px; opacity: 0.7; line-height: 1; transition: opacity 0.2s;" 
              onmouseover="this.style.opacity='1'" 
              onmouseout="this.style.opacity='0.7'">+</button>
      <button onclick="this.closest('.custom-word-card').style.opacity='0'; setTimeout(() => this.closest('.custom-word-card').style.display='none', 250)" 
              style="background: none; border: none; color: black; font-size: 22px; cursor: pointer; padding: 4px; opacity: 0.7; line-height: 1; transition: opacity 0.2s;" 
              onmouseover="this.style.opacity='1'" 
              onmouseout="this.style.opacity='0.7'">×</button>
    </div>
  `

    // Base card styles (Tailwind-like)
    const cardStyles = `
      background: #fbbf24; 
      color: black; 
      border-radius: 8px; 
      padding: 16px; 
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); 
      min-width: 200px; 
      max-width: 300px; 
      font-size: 18px; 
      line-height: 1.4; 
      border: 2px solid black; 
      position: relative;
      font-family: Arial, sans-serif;
    `

    if (this.wordCard.isLoading) {
      this.wordCardElement.innerHTML = `
        <div style="${cardStyles}">
          ${buttons}
          <div style="font-size: 24px; font-weight: 800; margin-bottom: 4px;">${this.escapeHtml(this.wordCard.word)}</div>
          <div style="font-size: 16px; opacity: 0.7;">Loading...</div>
        </div>
      `
    } else if (this.wordCard.entry) {
      const kanjiElements = this.wordCard.entry.kanji
        ? this.wordCard.entry.kanji
            .filter((k) => typeof k === "string" && /[\u4E00-\u9FAF]/.test(k))
            .map(
              (kanji) =>
                `<span style="display: inline-block; background: black; color: #fde68a; padding: 8px 12px; border-radius: 12px; font-size: 20px; border: 1px solid #d97706; margin-right: 8px; margin-bottom: 8px;">${this.escapeHtml(kanji)}</span>`
            )
            .join("")
        : ""

      const meanings = this.wordCard.entry.senses
        ? this.wordCard.entry.senses
            .flatMap((sense) => sense.gloss)
            .filter(Boolean)
            .map(
              (gloss) =>
                `<span style="display: inline-block; background: black; color: #fef3c7; padding: 6px 12px; border-radius: 16px; font-size: 16px; border: 1px solid #d97706; margin-right: 8px; margin-bottom: 8px;">${this.escapeHtml(gloss)}</span>`
            )
            .join("")
        : ""

      this.wordCardElement.innerHTML = `
        <div style="${cardStyles}">
        ${buttons}
          <div style="font-size: 24px; font-weight: 800; margin-bottom: 4px;">${this.escapeHtml(this.wordCard.word)}</div>
          ${romaji ? `<div style="font-size: 16px; opacity: 0.5; font-weight: bold; margin-bottom: 8px;">${this.escapeHtml(romaji)}</div>` : ""}
          ${kanjiElements ? `<div style="margin: 8px 0;"><span style="font-size: 16px; opacity: 0.8; margin-right: 8px;">Kanji: </span><div style="display: inline;">${kanjiElements}</div></div>` : ""}
          ${meanings ? `<div style="margin: 8px 0;"><div style="font-size: 16px; opacity: 0.8; margin-bottom: 4px;">Meanings:</div><div>${meanings}</div></div>` : ""}
        </div>
      `
    } else {
      this.wordCardElement.innerHTML = `
        <div style="${cardStyles}">
        ${buttons}
          <div style="font-size: 24px; font-weight: 800; margin-bottom: 4px;">${this.escapeHtml(this.wordCard.word)}</div>
          ${romaji ? `<div style="font-size: 16px; opacity: 0.5; font-weight: bold; margin-bottom: 8px;">${this.escapeHtml(romaji)}</div>` : ""}
          <div style="font-size: 16px; opacity: 0.7;">No dictionary entry found</div>
        </div>
      `
    }
  }

  private async saveToFlashcard(
    word: string,
    entry: JMDictEntry
  ): Promise<void> {
    try {
      // This would integrate with your GraphQL mutation
      console.log("Saving flashcard for word:", word, entry)

      // You can add the actual GraphQL mutation here
      // const kanjiName = entry.kanji && entry.kanji.length > 0 ? entry.kanji[0] : word
      // const hiragana = entry.kana && entry.kana.length > 0 ? entry.kana[0] : word
      // const meanings = entry.senses ? entry.senses.flatMap(s => s.gloss).filter(Boolean) : []
      // const quizAnswers = [...(entry.kana || []), ...(entry.kanji || [])].filter(Boolean)

      // await addFlashCard({ variables: { userId, kanjiName, hiragana, meanings, quizAnswers } })
    } catch (error) {
      console.error("Failed to save flashcard:", error)
    }
  }

  private isJapaneseText(text: string): boolean {
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)
  }

  private tokenizeJapanese(text: string): Token[] {
    if (!window.kuromojiTokenizer) return []
    return window.kuromojiTokenizer.tokenize(text)
  }

  private removeSubtitleContainer(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    if (this.subtitleContainer) {
      this.subtitleContainer.remove()
      this.subtitleContainer = null
      this.subtitle1Element = null
      this.subtitle2Element = null
    }

    if (this.wordCardElement) {
      this.wordCardElement.remove()
      this.wordCardElement = null
    }

    // Reset caches
    this.lastProcessedSubtitle1Text = ""
    this.lastProcessedSubtitle2Text = ""

    // Reset word card state
    this.wordCard = {
      word: "",
      mouseX: 0,
      isVisible: false,
      isSticky: false,
      entry: null,
      isLoading: false
    }
  }

  // Public methods for external control
  public updateSettings(newSettings: Partial<SubtitleSettings>): void {
    this.settings = { ...this.settings, ...newSettings }

    if (this.subtitleContainer && this.isEnabled) {
      this.subtitleContainer.style.bottom = `${this.settings.position}%`
      this.subtitleContainer.style.gap = `${this.settings.gap}px`
    }

    if (this.subtitle1Element && this.isEnabled) {
      this.applySubtitleStyles(this.subtitle1Element, this.settings.subtitle1)
    }

    if (this.subtitle2Element && this.isEnabled) {
      this.applySubtitleStyles(this.subtitle2Element, this.settings.subtitle2)
    }
  }

  public updateSubtitleData(
    subtitle1Data?: SubtitleCue[],
    subtitle2Data?: SubtitleCue[]
  ): void {
    if (subtitle1Data) {
      this.subtitle1Data = subtitle1Data
      this.lastProcessedSubtitle1Text = "" // Reset cache
    }
    if (subtitle2Data) {
      this.subtitle2Data = subtitle2Data
      this.lastProcessedSubtitle2Text = "" // Reset cache
    }
  }

  // Load subtitles from URLs
  public async loadSubtitleFromUrl(
    url: string,
    trackNumber: 1 | 2
  ): Promise<void> {
    // Only load if extension is enabled
    if (!this.isEnabled) {
      console.log(
        "[Custom Subtitles] Extension disabled, not loading subtitles"
      )
      return
    }

    try {
      console.log(
        `[Custom Subtitles] Loading subtitle ${trackNumber} from:`,
        url
      )

      if (trackNumber === 1) {
        this.subtitle1Url = url
      } else {
        this.subtitle2Url = url
      }

      const response = await fetch(url)
      const subtitleText = await response.text()

      // Parse subtitle format (VTT, SRT, etc.)
      const parsedSubtitles = this.parseSubtitleText(subtitleText)

      if (trackNumber === 1) {
        this.subtitle1Data = parsedSubtitles
        this.lastProcessedSubtitle1Text = "" // Reset cache
        console.log(
          `[Custom Subtitles] Loaded ${parsedSubtitles.length} cues for subtitle 1`
        )
      } else {
        this.subtitle2Data = parsedSubtitles
        this.lastProcessedSubtitle2Text = "" // Reset cache
        console.log(
          `[Custom Subtitles] Loaded ${parsedSubtitles.length} cues for subtitle 2`
        )
      }
    } catch (error) {
      console.error(
        `[Custom Subtitles] Error loading subtitle ${trackNumber}:`,
        error
      )
    }
  }

  // Parse subtitle text (supports VTT and SRT formats)
  private parseSubtitleText(subtitleText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = []

    // Detect format
    if (subtitleText.includes("WEBVTT")) {
      return this.parseVTT(subtitleText)
    } else if (subtitleText.match(/^\d+\s*$/m)) {
      return this.parseSRT(subtitleText)
    }

    return cues
  }

  // Parse WebVTT format
  private parseVTT(vttText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = []
    const lines = vttText.split("\n")

    let i = 0
    while (i < lines.length) {
      const line = lines[i].trim()

      // Look for timestamp line (contains -->)
      if (line.includes("-->")) {
        const timeMatch = line.match(
          /(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})/
        )

        if (timeMatch) {
          const startTime = this.parseTimeToSeconds(
            timeMatch[0].split("-->")[0].trim()
          )
          const endTime = this.parseTimeToSeconds(
            timeMatch[0].split("-->")[1].trim()
          )

          // Get subtitle text (next non-empty lines)
          i++
          let text = ""
          while (i < lines.length && lines[i].trim() !== "") {
            if (text) text += " "
            text += lines[i].trim()
            i++
          }

          if (text) {
            cues.push({
              start: startTime,
              end: endTime,
              text: text.replace(/<[^>]*>/g, "") // Remove HTML tags
            })
          }
        }
      }
      i++
    }

    return cues
  }

  // Parse SRT format
  private parseSRT(srtText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = []
    const blocks = srtText.split(/\n\s*\n/)

    for (const block of blocks) {
      const lines = block.trim().split("\n")
      if (lines.length >= 3) {
        const timeMatch = lines[1].match(
          /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
        )

        if (timeMatch) {
          const startTime = this.parseTimeToSeconds(
            lines[1].split("-->")[0].trim().replace(",", ".")
          )
          const endTime = this.parseTimeToSeconds(
            lines[1].split("-->")[1].trim().replace(",", ".")
          )

          const text = lines
            .slice(2)
            .join(" ")
            .replace(/<[^>]*>/g, "") // Remove HTML tags

          cues.push({
            start: startTime,
            end: endTime,
            text: text
          })
        }
      }
    }

    return cues
  }

  // Convert time string to seconds
  private parseTimeToSeconds(timeStr: string): number {
    const parts = timeStr.match(/(?:(\d{2}):)?(\d{2}):(\d{2})[\.,](\d{3})/)
    if (!parts) return 0

    const hours = parseInt(parts[1] || "0")
    const minutes = parseInt(parts[2])
    const seconds = parseInt(parts[3])
    const milliseconds = parseInt(parts[4])

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
  }

  // Setup message listener for communication with popup/extension
  private setupMessageListener(): void {
    // Listen for messages from the extension popup
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "loadSubtitle") {
          this.loadSubtitleFromUrl(message.url, message.trackNumber)
            .then(() => sendResponse({ success: true }))
            .catch((error) =>
              sendResponse({ success: false, error: error.message })
            )
          return true // Keep message channel open for async response
        }

        if (message.action === "updateSettings") {
          this.updateSettings(message.settings)
          sendResponse({ success: true })
        }

        if (message.action === "setJapaneseEnabled") {
          this.isJapaneseEnabled = message.enabled
          sendResponse({ success: true })
        }

        // Handle extension enable/disable
        if (message.action === "setExtensionEnabled") {
          this.setEnabled(message.enabled)
          sendResponse({ success: true })
        }

        // Respond to extension state requests
        if (message.action === "getExtensionState") {
          sendResponse({ enabled: this.isEnabled })
        }
      })
    }

    // Also listen for custom events (alternative communication method)
    window.addEventListener("loadSubtitle", (event: CustomEvent) => {
      if (!this.isEnabled) return
      const { url, trackNumber } = event.detail
      this.loadSubtitleFromUrl(url, trackNumber)
    })

    // Listen for subtitle selection persistence
    window.addEventListener(
      "persistSubtitleSelection",
      (event: CustomEvent) => {
        if (!this.isEnabled) return
        const { subtitle1Url, subtitle2Url } = event.detail
        if (subtitle1Url) this.loadSubtitleFromUrl(subtitle1Url, 1)
        if (subtitle2Url) this.loadSubtitleFromUrl(subtitle2Url, 2)
      }
    )
  }

  public destroy(): void {
    this.observer?.disconnect()
    this.removeSubtitleContainer()
    this.videoElement = null
    this.isInitialized = false
    this.isEnabled = false
  }

  // Get current subtitle URLs for persistence
  public getCurrentSubtitleUrls(): {
    subtitle1Url: string | null
    subtitle2Url: string | null
  } {
    return {
      subtitle1Url: this.subtitle1Url,
      subtitle2Url: this.subtitle2Url
    }
  }

  // Load saved subtitle selections
  public async loadSavedSubtitles(): Promise<void> {
    // Only load if extension is enabled
    if (!this.isEnabled) return

    try {
      // Get current video ID for persistence key
      const videoId = this.extractVideoId(window.location.href)
      if (!videoId) return

      const result = await chrome.storage.local.get([`subtitles_${videoId}`])
      const savedSubtitles = result[`subtitles_${videoId}`]

      if (savedSubtitles) {
        if (savedSubtitles.subtitle1Url) {
          await this.loadSubtitleFromUrl(savedSubtitles.subtitle1Url, 1)
        }
        if (savedSubtitles.subtitle2Url) {
          await this.loadSubtitleFromUrl(savedSubtitles.subtitle2Url, 2)
        }
        console.log("[Custom Subtitles] Loaded saved subtitle selections")
      }
    } catch (error) {
      console.error("[Custom Subtitles] Failed to load saved subtitles:", error)
    }
  }

  // Save subtitle selections
  public async saveSubtitleSelections(): Promise<void> {
    try {
      const videoId = this.extractVideoId(window.location.href)
      if (!videoId) return

      const subtitleData = {
        subtitle1Url: this.subtitle1Url,
        subtitle2Url: this.subtitle2Url,
        timestamp: Date.now()
      }

      await chrome.storage.local.set({
        [`subtitles_${videoId}`]: subtitleData
      })

      console.log(
        "[Custom Subtitles] Saved subtitle selections for video:",
        videoId
      )
    } catch (error) {
      console.error(
        "[Custom Subtitles] Failed to save subtitle selections:",
        error
      )
    }
  }

  private extractVideoId(url: string): string | null {
    if (!url) return null

    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/i,
      /youtube\.com\/watch.*?[?&]v=([^&?/]+)/i
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    return null
  }
}

// Initialize the custom subtitle container
let subtitleContainer: CustomSubtitleContainer | null = null

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSubtitles)
} else {
  initializeSubtitles()
}

async function initializeSubtitles() {
  // Clean up existing instance
  if (subtitleContainer) {
    subtitleContainer.destroy()
  }

  // Create new instance (it will check if extension is enabled internally)
  subtitleContainer = new CustomSubtitleContainer()

  console.log("[Custom Subtitles] Subtitle system initialized")
}

// Handle extension enable/disable messages from popup
if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extensionToggled") {
      if (subtitleContainer) {
        subtitleContainer.setEnabled(message.enabled)
      }
      sendResponse({ success: true })
    }
  })
}

// Handle page navigation (for SPAs like YouTube)
let currentUrl = location.href
const urlObserver = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href
    console.log("[Custom Subtitles] URL changed, reinitializing subtitles")

    // Delay to allow page to load
    setTimeout(initializeSubtitles, 1000)
  }
})

urlObserver.observe(document.body, { childList: true, subtree: true })

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  subtitleContainer?.destroy()
  urlObserver.disconnect()
})

// Export for external access if needed
export { CustomSubtitleContainer }
