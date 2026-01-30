import { ApolloProvider, useMutation } from "@apollo/client"
import cssText from "data-text:~style.css"
import kuromoji from "kuromoji"
import type { PlasmoCSConfig } from "plasmo"
import React, { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { toRomaji } from "wanakana"

import DictionaryLoadingOverlay from "../components/DictionaryLoadingOverlay"
import WordCard from "../components/WordCard"
import client from "../graphql"
import { ADD_FLASH_CARD_MUTATION } from "../graphql/mutations/addFlashCard.mutation"
import dictionaryDB from "../services/dictionaryDB"

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: ["*://www.youtube.com/watch*"],
  all_frames: false
}

export interface SubtitleCue {
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
  position: number
  gap: number
}

interface WordCardStyles {
  backgroundColor?: string
  textColor?: string
  fontSize?: number
  borderRadius?: number
  borderColor?: string
  wordFontSize?: number
}

interface SubtitleContainerStyles {
  backgroundColor?: string
  textColor?: string
  fontSize?: number
  opacity?: number
  borderRadius?: number
  verticalPosition?: number
}

interface Token {
  surface_form: string
}

declare global {
  interface Window {
    kuromojiTokenizer: any
  }
}

let loadingOverlayContainer: HTMLDivElement | null = null
let loadingOverlayRoot: any = null

function showLoadingOverlay(progress: number, total: number) {
  if (!loadingOverlayContainer) {
    loadingOverlayContainer = document.createElement("div")
    loadingOverlayContainer.id = "bundai-loading-overlay-root"
    document.body.appendChild(loadingOverlayContainer)
    loadingOverlayRoot = createRoot(loadingOverlayContainer)
  }

  loadingOverlayRoot.render(
    <DictionaryLoadingOverlay
      progress={progress}
      total={total}
      isVisible={true}
    />
  )
}

function hideLoadingOverlay() {
  if (loadingOverlayRoot) {
    loadingOverlayRoot.render(
      <DictionaryLoadingOverlay progress={0} total={0} isVisible={false} />
    )
    setTimeout(() => {
      if (loadingOverlayRoot) {
        loadingOverlayRoot.unmount()
        loadingOverlayRoot = null
      }
      if (loadingOverlayContainer) {
        loadingOverlayContainer.remove()
        loadingOverlayContainer = null
      }
    }, 300)
  }
}

class GenericSubtitleContainer {
  private videoElement: HTMLVideoElement | null = null
  private subtitleContainer: HTMLDivElement | null = null
  private subtitle1Element: HTMLDivElement | null = null
  private subtitle2Element: HTMLDivElement | null = null
  private wordCardContainer: HTMLDivElement | null = null
  private wordCardRoot: any = null
  private updateInterval: NodeJS.Timeout | null = null
  private observer: MutationObserver | null = null
  private isEnabled: boolean = false
  private hasVideoElement: boolean = false
  private initializationAttempts: number = 0
  private maxInitAttempts: number = 5

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
    position: 25,
    gap: 10
  }

  private subtitle1Data: SubtitleCue[] = []
  private subtitle2Data: SubtitleCue[] = []

  private lastProcessedSubtitle1Text: string = ""
  private lastProcessedSubtitle2Text: string = ""

  private wordCard: {
    word: string
    mouseX: number
    mouseY: number
    isVisible: boolean
    isSticky: boolean
  } = {
    word: "",
    mouseX: 0,
    mouseY: 0,
    isVisible: false,
    isSticky: false
  }

  private isJapaneseEnabled: boolean = true
  private isInitialized: boolean = false
  private wordCardStyles: WordCardStyles = {}
  private subtitleContainerStyles: SubtitleContainerStyles = {}

  private subtitleStartTime: number = 0
  private isPlaying: boolean = false

  constructor() {
    this.setupMessageListener()
    this.initializeJapanese()
    this.requestInitialState()
    setTimeout(() => {
      this.loadAllSettings()
    }, 500)

    document.addEventListener("fullscreenchange", () => {
      this.reapplySubtitleStyles()
    })
    document.addEventListener("webkitfullscreenchange", () => {
      this.reapplySubtitleStyles()
    })
  }

  private reapplySubtitleStyles(): void {
    if (this.subtitle1Element) {
      this.applySubtitleStyles(this.subtitle1Element, {
        backgroundColor:
          this.subtitleContainerStyles.backgroundColor || "#000000",
        color: this.subtitleContainerStyles.textColor || "#ffffff",
        fontSize: this.subtitleContainerStyles.fontSize || 40,
        opacity: this.subtitleContainerStyles.opacity || 0.9,
        borderRadius: this.subtitleContainerStyles.borderRadius || 8
      })
    }
    if (this.subtitle2Element) {
      this.applySubtitleStyles(this.subtitle2Element, {
        backgroundColor:
          this.subtitleContainerStyles.backgroundColor || "#000000",
        color: this.subtitleContainerStyles.textColor || "#ffffff",
        fontSize: this.subtitleContainerStyles.fontSize || 40,
        opacity: this.subtitleContainerStyles.opacity || 0.9,
        borderRadius: this.subtitleContainerStyles.borderRadius || 8
      })
    }

    if (this.subtitleContainer) {
      const verticalPos =
        this.subtitleContainerStyles.verticalPosition ?? this.settings.position
      this.subtitleContainer.style.left = "50%"
      this.subtitleContainer.style.transform = "translateX(-50%)"
      this.subtitleContainer.style.bottom = `${verticalPos}%`
      this.subtitleContainer.style.top = "auto"
    }
  }

  private async loadWordCardStyles(): Promise<void> {
    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "getWordCardStyles" },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve(response)
            }
          }
        )
      })

      if (response && response.styles) {
        this.wordCardStyles = response.styles
        console.log(
          "[Generic Subtitles] Loaded WordCard styles:",
          this.wordCardStyles
        )
        this.renderWordCard()
      }
    } catch (error) {
      console.error(
        "[Generic Subtitles] Failed to load WordCard styles:",
        error
      )
    }
  }

  private async loadSubtitleContainerStyles(): Promise<void> {
    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "getSubtitleContainerStyles" },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve(response)
            }
          }
        )
      })

      if (response && response.styles) {
        this.subtitleContainerStyles = response.styles

        if (this.subtitle1Element) {
          this.applySubtitleStyles(this.subtitle1Element, {
            backgroundColor:
              this.subtitleContainerStyles.backgroundColor || "#000000",
            color: this.subtitleContainerStyles.textColor || "#ffffff",
            fontSize: this.subtitleContainerStyles.fontSize || 40,
            opacity: this.subtitleContainerStyles.opacity || 0.9,
            borderRadius: this.subtitleContainerStyles.borderRadius || 8
          })
        }
        if (this.subtitle2Element) {
          this.applySubtitleStyles(this.subtitle2Element, {
            backgroundColor:
              this.subtitleContainerStyles.backgroundColor || "#000000",
            color: this.subtitleContainerStyles.textColor || "#ffffff",
            fontSize: this.subtitleContainerStyles.fontSize || 40,
            opacity: this.subtitleContainerStyles.opacity || 0.9,
            borderRadius: this.subtitleContainerStyles.borderRadius || 8
          })
        }

        if (this.subtitleContainer) {
          const verticalPos =
            this.subtitleContainerStyles.verticalPosition ??
            this.settings.position
          this.subtitleContainer.style.left = "50%"
          this.subtitleContainer.style.transform = "translateX(-50%)"
          this.subtitleContainer.style.bottom = `${verticalPos}%`
          this.subtitleContainer.style.top = "auto"
        }
      }
    } catch (error) {
      console.error(
        "[Generic Subtitles] Failed to load subtitle container styles:",
        error
      )
    }
  }

  private async loadAllSettings(): Promise<void> {
    await Promise.all([
      this.loadWordCardStyles(),
      this.loadSubtitleContainerStyles()
    ])
  }

  private async requestInitialState(): Promise<void> {
    console.log(
      "[Generic Subtitles] Requesting initial state from background..."
    )

    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        window.addEventListener("load", resolve, { once: true })
      })
      await new Promise((resolve) => setTimeout(resolve, 1500))
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    await this.requestStateWithRetry()
  }

  private async requestStateWithRetry(attempt: number = 0): Promise<void> {
    try {
      const result = await this.getExtensionEnabledState()

      this.isEnabled = result.extensionEnabled

      console.log("[Generic Subtitles] State received:", {
        extensionEnabled: result.extensionEnabled,
        finalEnabled: this.isEnabled
      })

      if (this.isEnabled) {
        console.log(
          "[Generic Subtitles] Custom subtitle mode enabled, initializing"
        )
        this.init()
      } else {
        console.log("[Generic Subtitles] Custom subtitle mode disabled")
      }
    } catch (error) {
      console.error(
        `[Generic Subtitles] Error getting state (attempt ${attempt + 1}/${this.maxInitAttempts}):`,
        error
      )

      if (attempt < this.maxInitAttempts - 1) {
        const delay = 500 * Math.pow(2, attempt)
        console.log(`[Generic Subtitles] Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.requestStateWithRetry(attempt + 1)
      } else {
        console.error(
          "[Generic Subtitles] Failed to get state after all retries, assuming disabled"
        )
        this.isEnabled = false
      }
    }
  }

  private async getExtensionEnabledState(): Promise<{
    extensionEnabled: boolean
  }> {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: "getExtensionState" },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else if (!response) {
              reject(new Error("No response from background script"))
            } else {
              resolve({
                extensionEnabled: response.enabled !== false
              })
            }
          }
        )
      } else {
        reject(new Error("Chrome runtime not available"))
      }
    })
  }

  private async initializeJapanese(): Promise<void> {
    try {
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
        console.log("[Generic Subtitles] Kuromoji tokenizer loaded")
      }

      dictionaryDB.onProgress((progress, total) => {
        showLoadingOverlay(progress, total)
      })

      await dictionaryDB.initialize()
      console.log("[Generic Subtitles] Dictionary database ready")

      hideLoadingOverlay()

      this.isInitialized = true
    } catch (error) {
      console.error(
        "[Generic Subtitles] Failed to initialize Japanese processing:",
        error
      )
      hideLoadingOverlay()
      this.isInitialized = false
    }
  }

  private init(): void {
    if (!this.isEnabled) {
      console.log(
        "[Generic Subtitles] Extension disabled, skipping initialization"
      )
      return
    }

    this.findAndSetupVideo()
    this.setupSubtitleContainer()

    if (this.hasVideoElement) {
      console.log(
        "[Generic Subtitles] Video element found, will sync automatically"
      )
    } else {
      console.log(
        "[Generic Subtitles] No video element found, using manual controls"
      )
    }
  }

  private findAndSetupVideo(): void {
    if (!this.isEnabled) return

    const videos = document.querySelectorAll(
      "video"
    ) as NodeListOf<HTMLVideoElement>

    if (videos.length > 0) {
      const targetVideo = Array.from(videos).reduce((largest, current) => {
        const largestArea = largest.offsetWidth * largest.offsetHeight
        const currentArea = current.offsetWidth * current.offsetHeight
        return currentArea > largestArea ? current : largest
      })

      if (targetVideo) {
        this.videoElement = targetVideo
        this.hasVideoElement = true
        this.setupVideoEventListeners()
        console.log("[Generic Subtitles] Video element found")
      }
    }
  }

  private setupVideoEventListeners(): void {
    if (!this.videoElement) return

    this.videoElement.addEventListener("seeking", () => {
      console.log("[Generic Subtitles] Video seeking detected")
    })

    this.videoElement.addEventListener("seeked", () => {
      console.log(
        "[Generic Subtitles] Video seeked to:",
        this.videoElement?.currentTime
      )
    })

    this.videoElement.addEventListener("play", () => {
      console.log("[Generic Subtitles] Video play detected")
      this.isPlaying = true
    })

    this.videoElement.addEventListener("pause", () => {
      console.log("[Generic Subtitles] Video pause detected")
      this.isPlaying = false
    })

    this.videoElement.addEventListener("ended", () => {
      console.log("[Generic Subtitles] Video ended")
      this.isPlaying = false
    })

    console.log("[Generic Subtitles] Video event listeners setup")
  }

  private setupSubtitleContainer(): void {
    if (!this.isEnabled) return

    document
      .querySelectorAll(
        ".custom-subtitle-container, .react-word-card-container, #bundai-subtitle-root, #bundai-wordcard-root"
      )
      .forEach((el) => el.remove())
    this.removeSubtitleContainer()

    if (document.getElementById("bundai-subtitle-root")) {
      return
    }

    this.subtitleContainer = document.createElement("div")
    this.subtitleContainer.id = "bundai-subtitle-root"
    this.subtitleContainer.className = "custom-subtitle-container"
    this.subtitleContainer.style.cssText = `
      position: fixed;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${this.settings.gap}px;
      pointer-events: auto;
      max-width: 80%;
      min-width: 300px;
    `

    this.subtitle1Element = document.createElement("div")
    this.subtitle1Element.className = "custom-subtitle subtitle-1"
    this.subtitle1Element.style.cursor = "default"
    this.applySubtitleStyles(this.subtitle1Element, this.settings.subtitle1)
    this.subtitleContainer.appendChild(this.subtitle1Element)

    this.subtitle2Element = document.createElement("div")
    this.subtitle2Element.className = "custom-subtitle subtitle-2"
    this.subtitle2Element.style.cursor = "default"
    this.applySubtitleStyles(this.subtitle2Element, this.settings.subtitle2)
    this.subtitleContainer.appendChild(this.subtitle2Element)

    this.createReactWordCard()

    document.body.appendChild(this.subtitleContainer)

    this.loadSavedPosition()
    this.startSubtitleUpdates()

    console.log("[Generic Subtitles] Subtitle container created and positioned")
  }

  private loadSavedPosition(): void {
    if (!this.subtitleContainer) return

    const verticalPos =
      this.subtitleContainerStyles.verticalPosition ?? this.settings.position
    this.subtitleContainer.style.left = "50%"
    this.subtitleContainer.style.transform = "translateX(-50%)"
    this.subtitleContainer.style.bottom = `${verticalPos}%`
    this.subtitleContainer.style.top = "auto"
  }

  public setEnabled(enabled: boolean): void {
    const wasEnabled = this.isEnabled
    this.isEnabled = enabled

    console.log(
      `[Generic Subtitles] Extension ${enabled ? "enabled" : "disabled"}`
    )

    if (enabled && !wasEnabled) {
      this.init()
    } else if (!enabled && wasEnabled) {
      this.removeSubtitleContainer()
      this.observer?.disconnect()
      this.observer = null
      this.videoElement = null
      this.hasVideoElement = false

      this.lastProcessedSubtitle1Text = ""
      this.lastProcessedSubtitle2Text = ""

      this.wordCard = {
        word: "",
        mouseX: 0,
        mouseY: 0,
        isVisible: false,
        isSticky: false
      }
    }
  }

  private createReactWordCard(): void {
    if (document.getElementById("bundai-wordcard-root")) {
      document.getElementById("bundai-wordcard-root")?.remove()
    }
    this.wordCardContainer = document.createElement("div")
    this.wordCardContainer.id = "bundai-wordcard-root"
    this.wordCardContainer.className = "react-word-card-container"
    this.wordCardContainer.style.position = "fixed"
    this.wordCardContainer.style.zIndex = "2147483647"

    document.body.appendChild(this.wordCardContainer)

    this.wordCardRoot = createRoot(this.wordCardContainer)
    this.renderWordCard()
  }

  private renderWordCard(): void {
    if (!this.wordCardRoot || !this.wordCardContainer) return

    const containerRect =
      this.subtitleContainer?.getBoundingClientRect() || null

    this.wordCardRoot.render(
      <WordCardManager
        wordCard={this.wordCard}
        containerRect={containerRect}
        onClose={this.handleCardClose.bind(this)}
        customStyles={this.wordCardStyles}
      />
    )
  }

  private handleCardClose(): void {
    this.wordCard = {
      ...this.wordCard,
      isVisible: false,
      isSticky: false,
      word: ""
    }
    this.renderWordCard()
  }

  private applySubtitleStyles(
    element: HTMLDivElement,
    subtitleSettings: any
  ): void {
    const borderRadius = subtitleSettings.borderRadius ?? 8
    const opacity = subtitleSettings.opacity ?? 0.9

    element.style.cssText = `
      background: ${this.hexToRgba(subtitleSettings.backgroundColor, opacity)};
      color: ${subtitleSettings.color};
      font-size: ${subtitleSettings.fontSize}px;
      font-family: Arial, sans-serif;
      font-weight: bold;
      padding: 8px 16px;
      border-radius: ${borderRadius}px;
      text-align: center;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
      line-height: 1.4;
      min-height: 20px;
      display: none;
      word-wrap: break-word;
      white-space: pre-wrap;
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
    if (!this.isEnabled) return

    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }

    if (!this.hasVideoElement) {
      this.subtitleStartTime = Date.now()
      this.isPlaying = true
    }

    this.updateInterval = setInterval(() => {
      this.updateSubtitles()
    }, 100)
  }

  private updateSubtitles(): void {
    if (!this.subtitle1Element || !this.subtitle2Element || !this.isEnabled)
      return

    let currentTime: number

    if (this.hasVideoElement && this.videoElement) {
      currentTime = this.videoElement.currentTime
    } else if (this.isPlaying) {
      currentTime = (Date.now() - this.subtitleStartTime) / 1000
    } else {
      return
    }

    const subtitle1Cue = this.subtitle1Data.find(
      (cue) => currentTime >= cue.start && currentTime <= cue.end
    )

    if (subtitle1Cue) {
      this.subtitle1Element.style.display = "block"
      if (subtitle1Cue.text !== this.lastProcessedSubtitle1Text) {
        this.lastProcessedSubtitle1Text = subtitle1Cue.text
        this.processSubtitleElement(this.subtitle1Element, subtitle1Cue.text)
      }
    } else {
      this.subtitle1Element.style.display = "none"
      if (this.lastProcessedSubtitle1Text !== "") {
        this.lastProcessedSubtitle1Text = ""
        this.subtitle1Element.textContent = ""
      }
    }

    const subtitle2Cue = this.subtitle2Data.find(
      (cue) => currentTime >= cue.start && currentTime <= cue.end
    )

    if (subtitle2Cue) {
      this.subtitle2Element.style.display = "block"
      if (subtitle2Cue.text !== this.lastProcessedSubtitle2Text) {
        this.lastProcessedSubtitle2Text = subtitle2Cue.text
        this.processSubtitleElement(this.subtitle2Element, subtitle2Cue.text)
      }
    } else {
      this.subtitle2Element.style.display = "none"
      if (this.lastProcessedSubtitle2Text !== "") {
        this.lastProcessedSubtitle2Text = ""
        this.subtitle2Element.textContent = ""
      }
    }
  }

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

    const tempContainer = document.createElement("div")
    tempContainer.style.display = "contents"

    tempContainer.innerHTML = tokens
      .map(
        (token, index) =>
          `<span class="tokenized-word" data-word="${this.escapeHtml(token.surface_form)}" data-index="${index}">${this.escapeHtml(token.surface_form)}</span>`
      )
      .join("")

    tempContainer.querySelectorAll(".tokenized-word").forEach((wordElement) => {
      const word = wordElement.getAttribute("data-word")
      if (!word) return

      wordElement.addEventListener("mouseenter", (e) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        this.handleWordHover(word, rect.left + rect.width / 2, rect.top)
      })

      wordElement.addEventListener("mouseleave", () => {
        this.handleWordLeave()
      })

      wordElement.addEventListener("click", (e) => {
        e.stopPropagation()
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        this.handleWordClick(word, rect.left + rect.width / 2, rect.top)
      })

      const htmlElement = wordElement as HTMLElement
      htmlElement.style.cursor = "pointer"
      htmlElement.style.padding = "2px 4px"
      htmlElement.style.borderRadius = "4px"
      htmlElement.style.transition = "background-color 0.2s"
      htmlElement.style.display = "inline"

      htmlElement.addEventListener("mouseenter", () => {
        htmlElement.style.backgroundColor = "rgba(255, 255, 255, 0.2)"
      })

      htmlElement.addEventListener("mouseleave", () => {
        htmlElement.style.backgroundColor = "transparent"
      })
    })

    element.innerHTML = ""
    element.appendChild(tempContainer)
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  private handleWordHover(word: string, mouseX: number, mouseY: number): void {
    this.wordCard = {
      word,
      mouseX,
      mouseY,
      isVisible: true,
      isSticky: false
    }
    this.renderWordCard()
  }

  private handleWordLeave(): void {
    if (!this.wordCard.isSticky) {
      this.wordCard.isVisible = false
      this.renderWordCard()
    }
  }

  private handleWordClick(word: string, mouseX: number, mouseY: number): void {
    this.wordCard = {
      word,
      mouseX,
      mouseY,
      isVisible: true,
      isSticky: true
    }
    this.renderWordCard()
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

    if (this.wordCardRoot) {
      this.wordCardRoot.unmount()
      this.wordCardRoot = null
    }

    if (this.wordCardContainer) {
      this.wordCardContainer.remove()
      this.wordCardContainer = null
    }

    this.lastProcessedSubtitle1Text = ""
    this.lastProcessedSubtitle2Text = ""

    this.wordCard = {
      word: "",
      mouseX: 0,
      mouseY: 0,
      isVisible: false,
      isSticky: false
    }
  }

  private setupMessageListener(): void {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "setJapaneseEnabled") {
          this.isJapaneseEnabled = message.enabled
          sendResponse({ success: true })
        }

        if (message.action === "setExtensionEnabled") {
          console.log(
            "[Generic Subtitles] Received setExtensionEnabled:",
            message.enabled
          )
          this.setEnabled(message.enabled)
          sendResponse({ success: true })
          return true
        }

        if (message.action === "getExtensionState") {
          sendResponse({ enabled: this.isEnabled })
          return true
        }

        if (message.action === "checkStatus") {
          console.log("[Generic Subtitles] Status check requested")
          const hasContainer = !!document.getElementById("bundai-subtitle-root")
          sendResponse({
            isEnabled: this.isEnabled,
            hasContainer: hasContainer,
            videoElement: this.hasVideoElement,
            hasManualControls: !this.hasVideoElement
          })
          return true
        }

        if (message.action === "setWordCardStyles") {
          this.wordCardStyles = message.styles || {}
          this.renderWordCard()
          sendResponse({ success: true })
          return true
        }

        if (message.action === "setSubtitleContainerStyles") {
          this.subtitleContainerStyles = message.styles || {}

          if (this.subtitle1Element) {
            this.applySubtitleStyles(this.subtitle1Element, {
              backgroundColor:
                this.subtitleContainerStyles.backgroundColor || "#000000",
              color: this.subtitleContainerStyles.textColor || "#ffffff",
              fontSize: this.subtitleContainerStyles.fontSize || 40,
              opacity: this.subtitleContainerStyles.opacity || 0.9,
              borderRadius: this.subtitleContainerStyles.borderRadius || 8
            })
          }
          if (this.subtitle2Element) {
            this.applySubtitleStyles(this.subtitle2Element, {
              backgroundColor:
                this.subtitleContainerStyles.backgroundColor || "#000000",
              color: this.subtitleContainerStyles.textColor || "#ffffff",
              fontSize: this.subtitleContainerStyles.fontSize || 40,
              opacity: this.subtitleContainerStyles.opacity || 0.9,
              borderRadius: this.subtitleContainerStyles.borderRadius || 8
            })
          }

          if (this.subtitleContainer) {
            const verticalPos =
              this.subtitleContainerStyles.verticalPosition ??
              this.settings.position
            this.subtitleContainer.style.left = "50%"
            this.subtitleContainer.style.transform = "translateX(-50%)"
            this.subtitleContainer.style.bottom = `${verticalPos}%`
            this.subtitleContainer.style.top = "auto"
          }

          sendResponse({ success: true })
          return true
        }

        if (message.action === "loadUserSubtitle") {
          console.log("[Generic Subtitles] loadUserSubtitle received")
          const { cues, trackNumber } = message

          if (!this.isEnabled) {
            this.setEnabled(true)
          }
          if (!this.subtitleContainer) {
            this.setupSubtitleContainer()
          }

          if (trackNumber === 1) {
            this.subtitle1Data = cues
            this.lastProcessedSubtitle1Text = ""
          } else {
            this.subtitle2Data = cues
            this.lastProcessedSubtitle2Text = ""
          }

          if (!this.hasVideoElement) {
            this.subtitleStartTime = Date.now()
            this.isPlaying = true
          }

          sendResponse({ success: true })
          return true
        }

        if (message.action === "clearUserSubtitle") {
          const { trackNumber } = message
          if (trackNumber === 1) {
            this.subtitle1Data = []
            this.lastProcessedSubtitle1Text = ""
          } else {
            this.subtitle2Data = []
            this.lastProcessedSubtitle2Text = ""
          }
          sendResponse({ success: true })
          return true
        }

        if (message.action === "subtitlePlayback") {
          const { command, value } = message
          console.log("[Generic Subtitles] Playback command:", command, value)

          switch (command) {
            case "play":
              this.isPlaying = true
              break
            case "pause":
              this.isPlaying = false
              break
            case "toggle":
              this.isPlaying = !this.isPlaying
              break
            case "reset":
              this.subtitleStartTime = Date.now()
              this.isPlaying = true
              break
            case "seek":
              this.subtitleStartTime -= (value || 0) * 1000
              break
          }

          sendResponse({ success: true, isPlaying: this.isPlaying })
          return true
        }

        if (message.action === "adjustSubtitleOffset") {
          const { offset } = message
          this.subtitleStartTime = Date.now() - offset * 1000
          sendResponse({ success: true })
          return true
        }
      })
    }
  }

  public destroy(): void {
    this.observer?.disconnect()
    this.removeSubtitleContainer()
    this.videoElement = null
    this.hasVideoElement = false
    this.isInitialized = false
    this.isEnabled = false
  }
}

const WordCardManager: React.FC<{
  wordCard: {
    word: string
    mouseX: number
    mouseY: number
    isVisible: boolean
    isSticky: boolean
  }
  containerRect: DOMRect | null
  onClose: () => void
  customStyles?: WordCardStyles
}> = ({ wordCard, containerRect, onClose, customStyles }) => {
  return (
    <WordCard
      word={wordCard.word}
      mouseX={wordCard.mouseX}
      mouseY={wordCard.mouseY}
      isVisible={wordCard.isVisible}
      isSticky={wordCard.isSticky}
      onClose={onClose}
      containerRect={containerRect}
      customStyles={customStyles}
    />
  )
}

let subtitleContainer: GenericSubtitleContainer | null = null
let initialEnabled: boolean | null = null

if (window.top === window.self) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSubtitles)
  } else {
    initializeSubtitles()
  }
}

async function initializeSubtitles() {
  if ((window as any).__bundaiGenericSubtitleInit) {
    return
  }
  ;(window as any).__bundaiGenericSubtitleInit = true

  if (subtitleContainer) {
    subtitleContainer.destroy()
  }

  subtitleContainer = new GenericSubtitleContainer()

  if (initialEnabled === null) {
    initialEnabled = (subtitleContainer as any).isEnabled
  }

  console.log("[Generic Subtitles] Subtitle system initialized")
}

if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setExtensionEnabled") {
      const newEnabled = message.enabled

      if (subtitleContainer) {
        subtitleContainer.setEnabled(newEnabled)
      }

      sendResponse({ success: true })
      return true
    }

    if (message.action === "setWordCardStyles") {
      if (subtitleContainer) {
        ;(subtitleContainer as any).wordCardStyles = message.styles || {}
        if (typeof (subtitleContainer as any).renderWordCard === "function") {
          ;(subtitleContainer as any).renderWordCard()
        }
      }
      sendResponse({ success: true })
      return true
    }

    if (message.action === "setSubtitleContainerStyles") {
      if (subtitleContainer) {
        ;(subtitleContainer as any).subtitleContainerStyles =
          message.styles || {}
        if (
          typeof (subtitleContainer as any).reapplySubtitleStyles === "function"
        ) {
          ;(subtitleContainer as any).reapplySubtitleStyles()
        }
      }
      sendResponse({ success: true })
      return true
    }

    if (message.action === "getExtensionState") {
      if (subtitleContainer) {
        sendResponse({ enabled: (subtitleContainer as any).isEnabled })
      } else {
        sendResponse({ enabled: false })
      }
      return true
    }

    if (message.action === "checkStatus") {
      const hasContainer = !!document.getElementById("bundai-subtitle-root")
      sendResponse({
        isEnabled: (subtitleContainer as any)?.isEnabled || false,
        hasContainer: hasContainer,
        videoElement: (subtitleContainer as any)?.hasVideoElement || false,
        hasManualControls: !(subtitleContainer as any)?.hasVideoElement
      })
      return true
    }

    if (message.action === "updateAllTabs") {
      if (subtitleContainer) {
        const newEnabled = message.enabled
        ;(subtitleContainer as any).isEnabled = newEnabled
        if (newEnabled) {
          ;(subtitleContainer as any).init()
        } else {
          ;(subtitleContainer as any).removeSubtitleContainer()
        }
      }
      sendResponse({ success: true })
      return true
    }
  })
}
