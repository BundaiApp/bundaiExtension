import type { PlasmoCSConfig } from "plasmo"

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

class CustomSubtitleContainer {
  private videoElement: HTMLVideoElement | null = null
  private subtitleContainer: HTMLDivElement | null = null
  private subtitle1Element: HTMLDivElement | null = null
  private subtitle2Element: HTMLDivElement | null = null
  private updateInterval: NodeJS.Timeout | null = null
  private observer: MutationObserver | null = null
  
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

  constructor() {
    this.init()
    this.setupMessageListener()
  }

  private init(): void {
    // Try to find video element immediately
    this.findAndSetupVideo()
    
    // If no video found, observe for video elements
    if (!this.videoElement) {
      this.observeForVideo()
    }
  }

  private findAndSetupVideo(): void {
    // Look for video elements
    const videos = document.querySelectorAll("video") as NodeListOf<HTMLVideoElement>
    
    if (videos.length > 0) {
      // For YouTube, prefer the main video player
      let targetVideo = Array.from(videos).find(video => 
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
        console.log("[Custom Subtitles] Video element found and subtitles setup")
      }
    }
  }

  private observeForVideo(): void {
    this.observer = new MutationObserver((mutations) => {
      // Check if we already have a video
      if (this.videoElement) return

      // Look for new video elements
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
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
    if (!this.videoElement) return

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
      pointer-events: none;
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

    // Append to body
    document.body.appendChild(this.subtitleContainer)

    // Start updating subtitles
    this.startSubtitleUpdates()

    console.log("[Custom Subtitles] Subtitle container created and positioned")
  }

  private applySubtitleStyles(element: HTMLDivElement, subtitleSettings: any): void {
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
    `
  }

  private hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  private startSubtitleUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }

    this.updateInterval = setInterval(() => {
      this.updateSubtitles()
    }, 100) // Update every 100ms for smooth subtitle transitions
  }

  private updateSubtitles(): void {
    if (!this.videoElement || !this.subtitle1Element || !this.subtitle2Element) return

    const currentTime = this.videoElement.currentTime

    // Update subtitle 1
    const subtitle1Cue = this.subtitle1Data.find(cue => 
      currentTime >= cue.start && currentTime <= cue.end
    )

    if (subtitle1Cue) {
      this.subtitle1Element.textContent = subtitle1Cue.text
      this.subtitle1Element.style.display = "block"
    } else {
      this.subtitle1Element.style.display = "none"
    }

    // Update subtitle 2
    const subtitle2Cue = this.subtitle2Data.find(cue =>
      currentTime >= cue.start && currentTime <= cue.end  
    )

    if (subtitle2Cue) {
      this.subtitle2Element.textContent = subtitle2Cue.text
      this.subtitle2Element.style.display = "block"
    } else {
      this.subtitle2Element.style.display = "none"
    }
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
  }

  // Public methods for external control
  public updateSettings(newSettings: Partial<SubtitleSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    
    if (this.subtitleContainer) {
      this.subtitleContainer.style.bottom = `${this.settings.position}%`
      this.subtitleContainer.style.gap = `${this.settings.gap}px`
    }

    if (this.subtitle1Element) {
      this.applySubtitleStyles(this.subtitle1Element, this.settings.subtitle1)
    }

    if (this.subtitle2Element) {
      this.applySubtitleStyles(this.subtitle2Element, this.settings.subtitle2)
    }
  }

  public updateSubtitleData(subtitle1Data?: SubtitleCue[], subtitle2Data?: SubtitleCue[]): void {
    if (subtitle1Data) this.subtitle1Data = subtitle1Data
    if (subtitle2Data) this.subtitle2Data = subtitle2Data
  }

  // Load subtitles from URLs
  public async loadSubtitleFromUrl(url: string, trackNumber: 1 | 2): Promise<void> {
    try {
      console.log(`[Custom Subtitles] Loading subtitle ${trackNumber} from:`, url)
      
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
        console.log(`[Custom Subtitles] Loaded ${parsedSubtitles.length} cues for subtitle 1`)
      } else {
        this.subtitle2Data = parsedSubtitles
        console.log(`[Custom Subtitles] Loaded ${parsedSubtitles.length} cues for subtitle 2`)
      }
      
    } catch (error) {
      console.error(`[Custom Subtitles] Error loading subtitle ${trackNumber}:`, error)
    }
  }

  // Parse subtitle text (supports VTT and SRT formats)
  private parseSubtitleText(subtitleText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = []
    
    // Detect format
    if (subtitleText.includes('WEBVTT')) {
      return this.parseVTT(subtitleText)
    } else if (subtitleText.match(/^\d+\s*$/m)) {
      return this.parseSRT(subtitleText)
    }
    
    return cues
  }

  // Parse WebVTT format
  private parseVTT(vttText: string): SubtitleCue[] {
    const cues: SubtitleCue[] = []
    const lines = vttText.split('\n')
    
    let i = 0
    while (i < lines.length) {
      const line = lines[i].trim()
      
      // Look for timestamp line (contains -->)
      if (line.includes('-->')) {
        const timeMatch = line.match(/(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})/)
        
        if (timeMatch) {
          const startTime = this.parseTimeToSeconds(timeMatch[0].split('-->')[0].trim())
          const endTime = this.parseTimeToSeconds(timeMatch[0].split('-->')[1].trim())
          
          // Get subtitle text (next non-empty lines)
          i++
          let text = ''
          while (i < lines.length && lines[i].trim() !== '') {
            if (text) text += ' '
            text += lines[i].trim()
            i++
          }
          
          if (text) {
            cues.push({
              start: startTime,
              end: endTime,
              text: text.replace(/<[^>]*>/g, '') // Remove HTML tags
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
      const lines = block.trim().split('\n')
      if (lines.length >= 3) {
        const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/)
        
        if (timeMatch) {
          const startTime = this.parseTimeToSeconds(lines[1].split('-->')[0].trim().replace(',', '.'))
          const endTime = this.parseTimeToSeconds(lines[1].split('-->')[1].trim().replace(',', '.'))
          
          const text = lines.slice(2).join(' ').replace(/<[^>]*>/g, '') // Remove HTML tags
          
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
    
    const hours = parseInt(parts[1] || '0')
    const minutes = parseInt(parts[2])
    const seconds = parseInt(parts[3])
    const milliseconds = parseInt(parts[4])
    
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
  }

  // Setup message listener for communication with popup/extension
  private setupMessageListener(): void {
    // Listen for messages from the extension popup
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'loadSubtitle') {
          this.loadSubtitleFromUrl(message.url, message.trackNumber)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }))
          return true // Keep message channel open for async response
        }
        
        if (message.action === 'updateSettings') {
          this.updateSettings(message.settings)
          sendResponse({ success: true })
        }
      })
    }
    
    // Also listen for custom events (alternative communication method)
    window.addEventListener('loadSubtitle', (event: CustomEvent) => {
      const { url, trackNumber } = event.detail
      this.loadSubtitleFromUrl(url, trackNumber)
    })
  }

  public destroy(): void {
    this.observer?.disconnect()
    this.removeSubtitleContainer()
    this.videoElement = null
  }
}

// Initialize the custom subtitle container
let subtitleContainer: CustomSubtitleContainer | null = null

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSubtitles)
} else {
  initializeSubtitles()
}

function initializeSubtitles() {
  // Clean up existing instance
  if (subtitleContainer) {
    subtitleContainer.destroy()
  }

  // Create new instance
  subtitleContainer = new CustomSubtitleContainer()
  
  console.log("[Custom Subtitles] Subtitle system initialized")
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
window.addEventListener('beforeunload', () => {
  subtitleContainer?.destroy()
  urlObserver.disconnect()
})

// Export for external access if needed
export { CustomSubtitleContainer }