// Simplified popup index.tsx - with subtitle mode toggle
import { useEffect, useRef, useState } from "react"

import "../style.css"

import { ApolloProvider } from "@apollo/client"

import { SecureStorage } from "@plasmohq/storage/secure"

import SubtitlesSection from "~components/SubtitlesSection"
import UserSubtitleUpload from "~components/UserSubtitleUpload"
import client from "~graphql"
import { parseVTT, type SubtitleCue } from "~utils/subtitleParser"

const BUNDAI_API_BASE_URL = "https://api.bundai.app"
const LEGACY_LOCAL_ASR_BASE_URL = "http://127.0.0.1:8765"
type SubtitleMode = "api" | "user" | "asr"
type AsrJobState = "idle" | "queued" | "running" | "done" | "failed"
type AsrBackendKind = "legacy"
type AsrBackendMode = "local" | "browser"
type BrowserWhisperModel = "Xenova/whisper-tiny" | "Xenova/whisper-base"
type AsrBackend = {
  baseUrl: string
  kind: AsrBackendKind
}
type AsrJobMeta = {
  jobId: string
  videoId: string
  model: string
  status: Exclude<AsrJobState, "idle">
  updatedAt: number
  error?: string | null
}

// Utility function to extract video ID from YouTube URLs
function extractVideoId(url: string): string | null {
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

function MainPage({ onOpenTabs }) {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [secureReady, setSecureReady] = useState(false)
  const [secureStorage] = useState(() => new SecureStorage())
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string>("")
  const [cachedSubtitles, setCachedSubtitles] = useState<Record<
    string,
    string[]
  > | null>(null)
  const [subtitleError, setSubtitleError] = useState<string | null>(null)
  const [isFetchingSubtitles, setIsFetchingSubtitles] = useState(false)
  const inFlightRequestsRef = useRef<Set<string>>(new Set())
  const asrBackendRef = useRef<AsrBackend | null>(null)
  const browserWhisperRef = useRef<{
    model: BrowserWhisperModel | null
    transcriber: any | null
  }>({
    model: null,
    transcriber: null
  })
  const whisperWorkerRef = useRef<Worker | null>(null)
  const whisperWorkerReadyRef = useRef(false)
  const whisperWorkerReqIdRef = useRef(0)

  // Subtitle mode: 'api' | 'user' | 'asr'
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("user")
  const [showRefreshMessage, setShowRefreshMessage] = useState(false)
  const [asrModel, setAsrModel] = useState("tiny")
  const [asrBackendMode, setAsrBackendMode] =
    useState<AsrBackendMode>("local")
  const [browserWhisperModel, setBrowserWhisperModel] =
    useState<BrowserWhisperModel>("Xenova/whisper-tiny")
  const [asrIncludeRomaji, setAsrIncludeRomaji] = useState(true)
  const [isGeneratingAsr, setIsGeneratingAsr] = useState(false)
  const [isCheckingAsrJob, setIsCheckingAsrJob] = useState(false)
  const [isLoadingAsr, setIsLoadingAsr] = useState(false)
  const [asrOutputReady, setAsrOutputReady] = useState(false)
  const [asrStatus, setAsrStatus] = useState("")
  const [asrError, setAsrError] = useState<string | null>(null)
  const [asrJobMeta, setAsrJobMeta] = useState<AsrJobMeta | null>(null)

  // WordCard styles state
  const [wordCardStyles, setWordCardStyles] = useState({
    backgroundColor: "#fde047",
    textColor: "#000000",
    fontSize: 18,
    borderRadius: 24,
    borderColor: "#a16207",
    wordFontSize: 48
  })
  const [showStyleEditor, setShowStyleEditor] = useState(false)

  // Japanese Subtitle container styles state
  const [subtitleContainerStyles, setSubtitleContainerStyles] = useState({
    backgroundColor: "#000000",
    textColor: "#ffffff",
    fontSize: 40,
    opacity: 0.9,
    borderRadius: 8,
    verticalPosition: -20,
    fullscreenVerticalPosition: 25
  })
  const [showSubtitleStyleEditor, setShowSubtitleStyleEditor] = useState(false)

  // Function to get current tab URL and extract video ID
  const getCurrentVideoId = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (tab && tab.url) {
        setCurrentUrl(tab.url)
        const videoId = extractVideoId(tab.url)

        if (videoId !== currentVideoId) {
          setCurrentVideoId(videoId)
          loadCachedSubtitles(videoId)
        }

        console.log("Current URL:", tab.url)
        console.log("Extracted Video ID:", videoId)

        return videoId
      }
    } catch (error) {
      console.error("Error getting current tab:", error)
      return null
    }
  }

  // Load cached subtitles from Chrome storage
  const loadCachedSubtitles = async (videoId: string | null) => {
    if (!videoId) {
      setCachedSubtitles(null)
      return
    }

    try {
      const cacheKey = `subtitles_cache_${videoId}`
      const result = await chrome.storage.local.get(cacheKey)
      const cached = result[cacheKey]

      if (cached && cached.expiry > Date.now()) {
        setCachedSubtitles(cached.data)
        setSubtitleError(null)
        console.log("Loaded cached subtitles for video:", videoId)
      } else {
        setCachedSubtitles(null)
        console.log("No valid cached subtitles for video:", videoId)
      }
    } catch (error) {
      console.error("Error loading cached subtitles:", error)
      setCachedSubtitles(null)
    }
  }

  // Fetch subtitles from API and cache them
  const fetchAndCacheSubtitles = async (videoId: string) => {
    if (!videoId) return

    if (inFlightRequestsRef.current.has(videoId)) {
      console.log("[MainPage] fetch already in flight for", videoId)
      return
    }
    inFlightRequestsRef.current.add(videoId)

    setIsFetchingSubtitles(true)
    setSubtitleError(null)

    try {
      const cookieHeader = await getYouTubeCookieHeader()
      if (!cookieHeader) {
        throw new Error(
          "Could not read YouTube cookies. Open the video on youtube.com and try again."
        )
      }

      console.log("[MainPage] Fetching subtitles for video:", videoId)
      console.log("[MainPage] Cookie header length:", cookieHeader?.length || 0)

      const endpoint = `${BUNDAI_API_BASE_URL}/subtitles/${videoId}?subtitle_format=vtt`
      const response = await fetch(endpoint, {
        headers: {
          "X-Youtube-Cookies": cookieHeader
        }
      })

      if (!response.ok) {
        let errorMessage = `Failed to fetch subtitles (HTTP ${response.status})`
        try {
          const contentType = response.headers.get("content-type") || ""
          if (contentType.includes("application/json")) {
            const errorData = await response.json()
            errorMessage =
              errorData?.detail ||
              errorData?.message ||
              errorData?.error ||
              errorMessage
          } else {
            const rawText = await response.text()
            if (rawText?.trim()) {
              errorMessage = `${errorMessage}: ${rawText.slice(0, 180)}`
            }
          }
        } catch {
          // Keep fallback message
        }
        throw new Error(errorMessage)
      }

      const raw = await response.json()
      const rawSubs = raw?.subtitles ?? raw ?? {}

      const subtitles: Record<string, string[]> = Object.fromEntries(
        Object.entries(rawSubs).map(([lang, entries]) => {
          try {
            const pickFromArray = (arr: any[]): string | null => {
              if (!Array.isArray(arr) || arr.length === 0) return null
              for (let i = arr.length - 1; i >= 0; i--) {
                const item = arr[i]
                const url = typeof item === "string" ? item : item?.url
                const ext = typeof item === "object" ? item?.ext : undefined
                if (
                  (typeof ext === "string" && ext.toLowerCase() === "vtt") ||
                  (typeof url === "string" &&
                    (url.includes(".vtt") ||
                      url.toLowerCase().includes("mime=text%2Fvtt")))
                ) {
                  return typeof url === "string" ? url : null
                }
              }
              const last = arr[arr.length - 1]
              const fallback = typeof last === "string" ? last : last?.url
              return typeof fallback === "string" ? fallback : null
            }

            let best: string | null = null
            if (Array.isArray(entries)) {
              best = pickFromArray(entries)
            } else if (entries && typeof entries === "object") {
              if ((entries as any).vtt) {
                best = pickFromArray((entries as any).vtt)
              }
              if (!best) {
                const flat = (Object.values(entries as any) as any[]).flat()
                best = pickFromArray(flat)
              }
            }

            return [lang, best ? [best] : []]
          } catch {
            return [lang, []]
          }
        })
      )

      console.log("[MainPage] Received subtitles:", subtitles)

      setCachedSubtitles(subtitles)
      try {
        const serialized = JSON.stringify(subtitles)
        if (serialized.length < 3 * 1024 * 1024) {
          const cacheKey = `subtitles_cache_${videoId}`
          const cacheData = {
            data: subtitles,
            timestamp: Date.now(),
            expiry: Date.now() + 24 * 60 * 60 * 1000
          }
          await chrome.storage.local.set({ [cacheKey]: cacheData })
        } else {
          console.warn(
            "[MainPage] Skipping persistent cache: payload too large"
          )
        }
      } catch (storageErr) {
        console.warn(
          "[MainPage] Failed to persist cache, continuing in-memory only",
          storageErr
        )
      }

      console.log("Fetched and cached subtitles for video:", videoId)
    } catch (error) {
      console.error("Error fetching subtitles:", error)
      const message =
        error instanceof Error ? error.message : "Failed to fetch subtitles"
      setSubtitleError(message)
    } finally {
      setIsFetchingSubtitles(false)
      inFlightRequestsRef.current.delete(videoId)
    }
  }

  const getYouTubeCookieHeader = async (): Promise<string> => {
    try {
      console.log("[MainPage] collecting YouTube cookies")
      const [cookiesWWW, cookiesRoot] = await Promise.all([
        chrome.cookies.getAll({
          url: "https://www.youtube.com"
        }),
        chrome.cookies.getAll({
          url: "https://youtube.com"
        })
      ])

      const merged = [...cookiesWWW, ...cookiesRoot]
      const uniqueCookies = new Map<string, chrome.cookies.Cookie>()
      for (const cookie of merged) {
        const key = `${cookie.name}|${cookie.domain}|${cookie.path}`
        if (!uniqueCookies.has(key)) {
          uniqueCookies.set(key, cookie)
        }
      }

      const cookies = Array.from(uniqueCookies.values())
      const header = cookies
        .filter((c) => !!c.name && c.value != null)
        .map((c) => `${c.name}=${c.value}`)
        .join("; ")
      console.log("[MainPage] cookies count:", cookies.length)
      return header
    } catch (err) {
      console.error("[MainPage] getYouTubeCookieHeader error", err)
      return ""
    }
  }

  // Send mode change to background/content script
  const notifySubtitleModeChange = async (mode: SubtitleMode) => {
    try {
      chrome.runtime.sendMessage(
        {
          action: "setSubtitleMode",
          subtitleMode: mode
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error notifying background:",
              chrome.runtime.lastError
            )
          } else {
            console.log("[Popup] Mode changed to:", mode)
          }
        }
      )
    } catch (error) {
      console.error("Error notifying mode change:", error)
    }
  }

  const notifyExtensionToggle = async (enabled: boolean) => {
    try {
      // Send to background script - it will broadcast to all tabs
      chrome.runtime.sendMessage(
        {
          action: "setExtensionEnabled",
          enabled: enabled
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error notifying background:",
              chrome.runtime.lastError
            )
          } else {
            console.log(
              "[Popup] Background notified of extension toggle:",
              enabled
            )
          }
        }
      )
    } catch (error) {
      console.error("Error notifying extension toggle:", error)
    }
  }

  // Initialize secure storage
  useEffect(() => {
    console.log("[MainPage] initializing secure storage")
    secureStorage
      .setPassword(process.env.PLASMO_SECURE_STORAGE_PASSWORD)
      .then(() => {
        console.log("[MainPage] secure storage ready")
        setSecureReady(true)
      })
  }, [secureStorage])

  // Load extension enabled state and subtitle mode
  useEffect(() => {
    if (!secureReady) return
    console.log("[MainPage] loading settings from storage")

    secureStorage.get("extensionEnabled").then((value) => {
      const enabledValue = typeof value === "boolean" ? value : true
      setEnabled(enabledValue)
      setLoading(false)
      console.log("[MainPage] extensionEnabled:", enabledValue)
    })

    // Load subtitle mode from background (source of truth), fallback to storage.
    chrome.runtime.sendMessage({ action: "getSubtitleMode" }, (response) => {
      if (
        !chrome.runtime.lastError &&
        response?.mode &&
        ["api", "user", "asr"].includes(response.mode)
      ) {
        setSubtitleMode(response.mode as SubtitleMode)
        console.log("[MainPage] subtitleMode (background):", response.mode)
        secureStorage.set("subtitleMode", response.mode).catch(console.error)
        return
      }

      secureStorage.get("subtitleMode").then((value) => {
        if (value && ["api", "user", "asr"].includes(value as string)) {
          setSubtitleMode(value as SubtitleMode)
          console.log("[MainPage] subtitleMode (storage):", value)
        } else {
          setSubtitleMode("api")
          secureStorage.set("subtitleMode", "api").catch(console.error)
          notifySubtitleModeChange("api")
        }
      })
    })

    // Load WordCard styles
    secureStorage.get("wordCardStyles").then((value) => {
      if (value && typeof value === "object") {
        setWordCardStyles((prev: typeof wordCardStyles) => ({
          ...prev,
          ...(value as object)
        }))
        console.log("[MainPage] wordCardStyles:", value)
      }
    })

    // Load Japanese Subtitle container styles
    secureStorage.get("subtitleContainerStyles").then((value) => {
      if (value && typeof value === "object") {
        setSubtitleContainerStyles((prev: typeof subtitleContainerStyles) => ({
          ...prev,
          ...(value as object)
        }))
        console.log("[MainPage] subtitleContainerStyles:", value)
      }
    })

    secureStorage.get("asrIncludeRomaji").then((value) => {
      if (typeof value === "boolean") {
        setAsrIncludeRomaji(value)
      } else {
        setAsrIncludeRomaji(true)
      }
    })

    secureStorage.get("asrBackendMode").then((value) => {
      if (value === "local" || value === "browser") {
        setAsrBackendMode(value)
      } else {
        setAsrBackendMode("local")
      }
    })

    secureStorage.get("browserWhisperModel").then((value) => {
      if (value === "Xenova/whisper-tiny" || value === "Xenova/whisper-base") {
        setBrowserWhisperModel(value)
      } else {
        setBrowserWhisperModel("Xenova/whisper-tiny")
      }
    })
  }, [secureReady, secureStorage])

  // Get current video ID when component mounts and load cached subtitles
  useEffect(() => {
    console.log("[MainPage] initializeVideoData")
    const initializeVideoData = async () => {
      const videoId = await getCurrentVideoId()
      if (videoId) {
        await loadCachedSubtitles(videoId)
      }
    }

    initializeVideoData()
  }, [])

  const handleToggle = async (e) => {
    const newValue = e.target.checked
    console.log("[MainPage] toggle clicked ->", newValue)
    setEnabled(newValue)

    await secureStorage.set("extensionEnabled", newValue)
    await notifyExtensionToggle(newValue)

    // Show refresh message
    if (isYouTubePage) {
      setShowRefreshMessage(true)
    }
  }

  const handleSubtitleModeChange = async (mode: SubtitleMode) => {
    console.log("[MainPage] subtitle mode changed ->", mode)
    setSubtitleMode(mode)
    await secureStorage.set("subtitleMode", mode)
    await notifySubtitleModeChange(mode)
    setShowRefreshMessage(true)
  }

  const handleAsrBackendModeChange = async (mode: AsrBackendMode) => {
    setAsrBackendMode(mode)
    await secureStorage.set("asrBackendMode", mode)
    setAsrError(null)
    setAsrStatus("")
  }

  const handleBrowserWhisperModelChange = async (model: BrowserWhisperModel) => {
    setBrowserWhisperModel(model)
    await secureStorage.set("browserWhisperModel", model)
    setAsrError(null)
    setAsrStatus("")
  }

  const handleWordCardStyleChange = async (
    styleKey: string,
    value: string | number
  ) => {
    const newStyles = { ...wordCardStyles, [styleKey]: value }
    setWordCardStyles(newStyles)

    await secureStorage.set("wordCardStyles", newStyles)

    // Notify background script
    chrome.runtime.sendMessage(
      {
        action: "setWordCardStyles",
        styles: newStyles
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error notifying background:", chrome.runtime.lastError)
        } else {
          console.log("[Popup] Background notified of WordCard style change")
        }
      }
    )
  }

  const resetWordCardStyles = async () => {
    const defaultStyles = {
      backgroundColor: "#fde047",
      textColor: "#000000",
      fontSize: 18,
      borderRadius: 24,
      borderColor: "#a16207",
      wordFontSize: 48
    }
    setWordCardStyles(defaultStyles)
    await secureStorage.set("wordCardStyles", defaultStyles)

    chrome.runtime.sendMessage(
      {
        action: "setWordCardStyles",
        styles: defaultStyles
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error resetting styles:", chrome.runtime.lastError)
        }
      }
    )
  }

  // Handle Japanese Subtitle container style changes
  const handleSubtitleStyleChange = async (
    styleKey: string,
    value: string | number
  ) => {
    const newStyles = { ...subtitleContainerStyles, [styleKey]: value }
    setSubtitleContainerStyles(newStyles)

    await secureStorage.set("subtitleContainerStyles", newStyles)

    // Notify background script
    chrome.runtime.sendMessage(
      {
        action: "setSubtitleContainerStyles",
        styles: newStyles
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error notifying background:", chrome.runtime.lastError)
        } else {
          console.log(
            "[Popup] Background notified of subtitle container style change"
          )
        }
      }
    )
  }

  const resetSubtitleContainerStyles = async () => {
    const defaultStyles = {
      backgroundColor: "#000000",
      textColor: "#ffffff",
      fontSize: 40,
      opacity: 0.9,
      borderRadius: 8,
      verticalPosition: -20,
      fullscreenVerticalPosition: 25
    }
    setSubtitleContainerStyles(defaultStyles)
    await secureStorage.set("subtitleContainerStyles", defaultStyles)

    chrome.runtime.sendMessage(
      {
        action: "setSubtitleContainerStyles",
        styles: defaultStyles
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error resetting subtitle styles:",
            chrome.runtime.lastError
          )
        }
      }
    )
  }

  const handleFetchSubtitles = async () => {
    if (!currentVideoId) return
    console.log("[MainPage] fetch subtitles for", currentVideoId)
    await fetchAndCacheSubtitles(currentVideoId)
  }

  const handleAsrIncludeRomajiChange = async (enabled: boolean) => {
    setAsrIncludeRomaji(enabled)
    await secureStorage.set("asrIncludeRomaji", enabled)
  }

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, ms))

  const sendMessageToActiveTabWithRetry = async (
    payload: Record<string, any>,
    maxAttempts: number = 8,
    delayMs: number = 400
  ) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      throw new Error("No active tab found")
    }

    let lastError: Error | null = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          chrome.tabs.sendMessage(tab.id as number, payload, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
              return
            }
            resolve()
          })
        })
        return
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const msg = String(lastError?.message || "")
        const isReceiverNotReady =
          msg.includes("Receiving end does not exist") ||
          msg.includes("Could not establish connection")
        if (!isReceiverNotReady || attempt === maxAttempts) {
          break
        }
        await sleep(delayMs)
      }
    }

    throw (
      lastError ||
      new Error("Failed to communicate with active tab after retries.")
    )
  }

  const sendAsrCuesToContentScript = async (
    jaCues: SubtitleCue[],
    includeRomaji: boolean,
    videoId: string
  ) => {
    await sendMessageToActiveTabWithRetry({
      action: "loadAsrSubtitle",
      cues: jaCues,
      includeRomaji,
      videoId
    })
  }

  const clearAsrCuesInContentScript = async (videoId: string) => {
    await sendMessageToActiveTabWithRetry({
      action: "clearAsrSubtitle",
      videoId
    })
  }

  const normalizeCueTextToSingleLine = (text: string): string => {
    return text.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim()
  }

  const normalizeCuesToSingleLine = (cues: SubtitleCue[]): SubtitleCue[] => {
    return cues.map((cue) => ({
      ...cue,
      text: normalizeCueTextToSingleLine(cue.text || "")
    }))
  }

  const splitJapaneseTextIntoPhrases = (text: string): string[] => {
    const normalized = normalizeCueTextToSingleLine(text)
    if (!normalized) return []
    return normalized
      .split(/(?<=[。！？!?])/)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  const buildCuesFromWordChunks = (
    chunks: Array<{ text?: string; timestamp?: [number | null, number | null] }>,
    baseTime: number,
    captureSeconds: number
  ): SubtitleCue[] => {
    const cues: SubtitleCue[] = []
    let active: SubtitleCue | null = null

    const flush = () => {
      if (!active) return
      active.text = normalizeCueTextToSingleLine(active.text)
      if (active.text) {
        cues.push(active)
      }
      active = null
    }

    for (const chunk of chunks) {
      const text = normalizeCueTextToSingleLine(String(chunk?.text || ""))
      if (!text) continue

      const ts = Array.isArray(chunk?.timestamp) ? chunk.timestamp : []
      const startRel = Number(ts?.[0])
      const endRelRaw = Number(ts?.[1])
      if (!Number.isFinite(startRel)) continue
      const endRel =
        Number.isFinite(endRelRaw) && endRelRaw > startRel
          ? endRelRaw
          : startRel + 0.8

      const start = baseTime + startRel
      const end = baseTime + endRel

      if (!active) {
        active = { start, end, text }
        continue
      }

      const duration = end - active.start
      const shouldSplit =
        duration >= 3.5 ||
        /[。！？!?]$/.test(active.text) ||
        start - active.end > 0.5

      if (shouldSplit) {
        flush()
        active = { start, end, text }
      } else {
        active.end = Math.max(active.end, end)
        active.text += text
      }
    }

    flush()

    if (cues.length > 0) return cues

    const fallbackText = normalizeCueTextToSingleLine(
      chunks.map((c) => String(c?.text || "")).join("")
    )
    const phrases = splitJapaneseTextIntoPhrases(fallbackText)
    if (!phrases.length) return []
    const perPhrase = Math.max(1.4, captureSeconds / phrases.length)
    return phrases.map((phrase, idx) => {
      const start = baseTime + idx * perPhrase
      return {
        start,
        end: start + perPhrase,
        text: phrase
      }
    })
  }

  const fetchWithTimeout = async (
    input: string,
    init?: RequestInit,
    timeoutMs: number = 15000
  ) => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      })
    } finally {
      window.clearTimeout(timer)
    }
  }

  const resolveAsrBackend = async (
    forceRefresh: boolean = false
  ): Promise<AsrBackend> => {
    if (!forceRefresh && asrBackendRef.current) {
      return asrBackendRef.current
    }

    const candidates: AsrBackend[] = [
      { baseUrl: LEGACY_LOCAL_ASR_BASE_URL, kind: "legacy" }
    ]

    for (const candidate of candidates) {
      try {
        const health = await fetchWithTimeout(
          `${candidate.baseUrl}/health`,
          undefined,
          5000
        )
        if (health.ok) {
          asrBackendRef.current = candidate
          return candidate
        }
      } catch {
        // Try next backend candidate.
      }
    }

    throw new Error(
      "Local ASR service is not reachable. Open the Bundai desktop app so it can serve ASR on 127.0.0.1:8765."
    )
  }

  const normalizeLegacyAsrModel = (model: string): string => {
    const whisperModels = new Set([
      "tiny",
      "base",
      "small",
      "medium",
      "large",
      "large-v2",
      "large-v3",
      "turbo"
    ])
    return whisperModels.has(model) ? model : "base"
  }

  const isLegacyWhisperModel = (model: string): boolean => {
    return normalizeLegacyAsrModel(model) === model
  }

  const getCurrentPlaybackStateFromContentScript = async (): Promise<{
    currentTime: number
  }> => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      return { currentTime: 0 }
    }

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id as number,
        { action: "getPlaybackState" },
        (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            resolve({ currentTime: 0 })
            return
          }
          const currentTime = Number(response.currentTime)
          resolve({ currentTime: Number.isFinite(currentTime) ? currentTime : 0 })
        }
      )
    })
  }

  const captureTabAudioBlob = async (durationMs: number): Promise<Blob> => {
    return await new Promise((resolve, reject) => {
      if (
        typeof chrome === "undefined" ||
        !chrome.tabCapture ||
        typeof chrome.tabCapture.capture !== "function"
      ) {
        reject(
          new Error(
            "tabCapture is not available. Ensure the extension has tabCapture permission."
          )
        )
        return
      }

      chrome.tabCapture.capture(
        {
          audio: true,
          video: false
        } as any,
        (stream) => {
          if (chrome.runtime.lastError || !stream) {
            reject(
              new Error(
                chrome.runtime.lastError?.message ||
                  "Failed to capture tab audio."
              )
            )
            return
          }

          const mediaStream = stream as MediaStream
          const mimeTypeCandidates = [
            "audio/webm;codecs=opus",
            "audio/webm"
          ]
          const selectedMimeType =
            mimeTypeCandidates.find((candidate) =>
              MediaRecorder.isTypeSupported(candidate)
            ) || ""

          let recorder: MediaRecorder
          try {
            recorder = selectedMimeType
              ? new MediaRecorder(mediaStream, { mimeType: selectedMimeType })
              : new MediaRecorder(mediaStream)
          } catch (error) {
            mediaStream.getTracks().forEach((track) => track.stop())
            reject(new Error(`Unable to initialize MediaRecorder: ${error}`))
            return
          }

          const chunks: Blob[] = []
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              chunks.push(event.data)
            }
          }

          recorder.onerror = (event: any) => {
            mediaStream.getTracks().forEach((track) => track.stop())
            reject(
              new Error(
                event?.error?.message || "MediaRecorder failed while capturing."
              )
            )
          }

          recorder.onstop = () => {
            mediaStream.getTracks().forEach((track) => track.stop())
            resolve(new Blob(chunks, { type: selectedMimeType || "audio/webm" }))
          }

          recorder.start(1000)
          window.setTimeout(() => {
            if (recorder.state !== "inactive") {
              recorder.stop()
            }
          }, durationMs)
        }
      )
    })
  }

  const resampleTo16k = (
    input: Float32Array,
    inputSampleRate: number
  ): Float32Array => {
    if (inputSampleRate === 16000) return input
    if (!input.length) return input

    const ratio = inputSampleRate / 16000
    const outputLength = Math.max(1, Math.round(input.length / ratio))
    const output = new Float32Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      const position = i * ratio
      const left = Math.floor(position)
      const right = Math.min(left + 1, input.length - 1)
      const weight = position - left
      output[i] = input[left] * (1 - weight) + input[right] * weight
    }

    return output
  }

  const decodeAudioBlobTo16kMono = async (audioBlob: Blob) => {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioContext = new AudioContext()
    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
      const channelCount = decoded.numberOfChannels || 1
      const mono = new Float32Array(decoded.length)

      for (let channel = 0; channel < channelCount; channel++) {
        const channelData = decoded.getChannelData(channel)
        for (let i = 0; i < decoded.length; i++) {
          mono[i] += channelData[i] / channelCount
        }
      }

      return resampleTo16k(mono, decoded.sampleRate)
    } finally {
      await audioContext.close()
    }
  }

  const toVttTimestamp = (seconds: number): string => {
    const safe = Math.max(0, seconds)
    const hours = Math.floor(safe / 3600)
    const minutes = Math.floor((safe % 3600) / 60)
    const wholeSeconds = Math.floor(safe % 60)
    const milliseconds = Math.round((safe - Math.floor(safe)) * 1000)
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
  }

  const cuesToVtt = (cues: SubtitleCue[]): string => {
    const lines = ["WEBVTT", ""]
    for (const cue of cues) {
      lines.push(
        `${toVttTimestamp(cue.start)} --> ${toVttTimestamp(cue.end)}`,
        cue.text || "",
        ""
      )
    }
    return lines.join("\n")
  }

  const getBrowserWhisperTranscriber = async (
    model: BrowserWhisperModel
  ): Promise<any> => {
    // Keep signature stable; worker now owns runtime/model lifecycle.
    return { model }
  }

  const ensureWhisperWorkerReady = async () => {
    if (!whisperWorkerRef.current) {
      const workerUrl = chrome.runtime.getURL("assets/whisper-worker.mjs")
      whisperWorkerRef.current = new Worker(workerUrl, { type: "module" })
      whisperWorkerReadyRef.current = false
    }

    if (whisperWorkerReadyRef.current) return

    const worker = whisperWorkerRef.current
    if (!worker) throw new Error("Whisper worker failed to initialize")

    const reqId = ++whisperWorkerReqIdRef.current
    await new Promise<void>((resolve, reject) => {
      const onWorkerError = (event: ErrorEvent) => {
        window.clearTimeout(timeout)
        worker.removeEventListener("message", onMessage)
        worker.removeEventListener("error", onWorkerError)
        worker.removeEventListener("messageerror", onWorkerMessageError)
        reject(
          new Error(
            `Whisper worker crashed: ${event.message || "Unknown worker error"}`
          )
        )
      }
      const onWorkerMessageError = () => {
        window.clearTimeout(timeout)
        worker.removeEventListener("message", onMessage)
        worker.removeEventListener("error", onWorkerError)
        worker.removeEventListener("messageerror", onWorkerMessageError)
        reject(new Error("Whisper worker message serialization error"))
      }
      const timeout = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage)
        worker.removeEventListener("error", onWorkerError)
        worker.removeEventListener("messageerror", onWorkerMessageError)
        reject(new Error("Whisper worker init timed out"))
      }, 30000)

      const onMessage = (event: MessageEvent) => {
        const data = event.data || {}
        if (data.id !== reqId) return
        if (data.type === "init:ok") {
          window.clearTimeout(timeout)
          worker.removeEventListener("message", onMessage)
          worker.removeEventListener("error", onWorkerError)
          worker.removeEventListener("messageerror", onWorkerMessageError)
          whisperWorkerReadyRef.current = true
          resolve()
          return
        }
        if (data.type === "error") {
          window.clearTimeout(timeout)
          worker.removeEventListener("message", onMessage)
          worker.removeEventListener("error", onWorkerError)
          worker.removeEventListener("messageerror", onWorkerMessageError)
          reject(new Error(data.error || "Whisper worker init failed"))
        }
      }

      worker.addEventListener("message", onMessage)
      worker.addEventListener("error", onWorkerError)
      worker.addEventListener("messageerror", onWorkerMessageError)
      worker.postMessage({
        type: "init",
        id: reqId,
        payload: {
          wasmBase: chrome.runtime.getURL("assets/onnxruntime/")
        }
      })
    })
  }

  const transcribeWithWhisperWorker = async (
    model: BrowserWhisperModel,
    audio16k: Float32Array
  ) => {
    await ensureWhisperWorkerReady()
    const worker = whisperWorkerRef.current
    if (!worker) throw new Error("Whisper worker unavailable")

    const reqId = ++whisperWorkerReqIdRef.current
    const transferBuffer = audio16k.buffer.slice(0)

    return await new Promise<any>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        worker.removeEventListener("message", onMessage)
        reject(new Error("Whisper transcription timed out"))
      }, 10 * 60 * 1000)

      const onMessage = (event: MessageEvent) => {
        const data = event.data || {}
        if (data.id !== reqId) return
        if (data.type === "transcribe:ok") {
          window.clearTimeout(timeout)
          worker.removeEventListener("message", onMessage)
          resolve(data.payload)
          return
        }
        if (data.type === "error") {
          window.clearTimeout(timeout)
          worker.removeEventListener("message", onMessage)
          reject(new Error(data.error || "Whisper transcription failed"))
        }
      }

      worker.addEventListener("message", onMessage)
      worker.postMessage(
        {
          type: "transcribe",
          id: reqId,
          payload: {
            model,
            audioBuffer: transferBuffer,
            options: {
              language: "ja",
              task: "transcribe",
              return_timestamps: "word",
              chunk_length_s: 30,
              stride_length_s: 5,
              no_speech_threshold: 0.35
            }
          }
        },
        [transferBuffer]
      )
    })
  }

  const runBrowserWhisperGeneration = async (videoId: string) => {
    const captureSeconds = 180
    await clearAsrCuesInContentScript(videoId)
    setAsrStatus(`Capturing ${captureSeconds}s of tab audio...`)
    const playbackState = await getCurrentPlaybackStateFromContentScript()

    const audioBlob = await captureTabAudioBlob(captureSeconds * 1000)
    setAsrStatus("Decoding captured audio...")
    const audio16k = await decodeAudioBlobTo16kMono(audioBlob)
    if (!audio16k.length) {
      throw new Error("Captured audio is empty. Ensure the YouTube tab is playing audio.")
    }

    setAsrStatus(`Running Browser Whisper (${browserWhisperModel})...`)
    await getBrowserWhisperTranscriber(browserWhisperModel)
    const output = await transcribeWithWhisperWorker(
      browserWhisperModel,
      audio16k
    )

    const baseTime = Math.max(0, playbackState.currentTime)
    const chunks = Array.isArray((output as any)?.chunks)
      ? (output as any).chunks
      : []
    let cues: SubtitleCue[] = buildCuesFromWordChunks(
      chunks as Array<{ text?: string; timestamp?: [number | null, number | null] }>,
      baseTime,
      captureSeconds
    )

    if (!cues.length) {
      const fallbackText = normalizeCueTextToSingleLine(String((output as any)?.text || ""))
      const phrases = splitJapaneseTextIntoPhrases(fallbackText)
      const items = phrases.length ? phrases : fallbackText ? [fallbackText] : []
      const perCue = items.length
        ? Math.max(1.8, captureSeconds / items.length)
        : captureSeconds
      cues = items.map((item, idx) => {
        const start = baseTime + idx * perCue
        return {
          start,
          end: start + perCue,
          text: item
        }
      })
    }

    if (!cues.length) {
      throw new Error("Browser Whisper produced no subtitle cues.")
    }

    const jaVtt = cuesToVtt(cues)
    await chrome.storage.local.set({
      [asrSubtitleStorageKey(videoId)]: {
        videoId,
        model: browserWhisperModel,
        jpOnly: true,
        generatedAt: Date.now(),
        jaVtt,
        jaCues: cues
      }
    })

    await saveAsrJobMeta(videoId, {
      jobId: `browser-${Date.now()}`,
      videoId,
      model: browserWhisperModel,
      status: "done",
      updatedAt: Date.now(),
      error: null
    })

    await sendAsrCuesToContentScript(cues, asrIncludeRomaji, videoId)
    setAsrOutputReady(true)
    setAsrStatus(
      `Browser Whisper complete and loaded: ja=${cues.length}. Model files are cached by the browser.`
    )
  }

  const asrJobStorageKey = (videoId: string) => `asrJobMeta_${videoId}`
  const asrSubtitleStorageKey = (videoId: string) => `asrSubtitle_${videoId}`

  const coerceAsrJobStatus = (status: string): AsrJobMeta["status"] => {
    if (status === "running" || status === "done" || status === "failed") {
      return status
    }
    return "queued"
  }

  const saveAsrJobMeta = async (videoId: string, meta: AsrJobMeta) => {
    setAsrJobMeta(meta)
    await chrome.storage.local.set({ [asrJobStorageKey(videoId)]: meta })
  }

  const loadStoredAsrJobMeta = async (
    videoId: string
  ): Promise<AsrJobMeta | null> => {
    const result = await chrome.storage.local.get([asrJobStorageKey(videoId)])
    const stored = result[asrJobStorageKey(videoId)]
    if (
      stored &&
      typeof stored.jobId === "string" &&
      typeof stored.videoId === "string" &&
      typeof stored.model === "string" &&
      typeof stored.status === "string"
    ) {
      if (!isLegacyWhisperModel(stored.model)) {
        return null
      }
      return {
        jobId: stored.jobId,
        videoId: stored.videoId,
        model: stored.model,
        status: coerceAsrJobStatus(stored.status),
        updatedAt: Number(stored.updatedAt || Date.now()),
        error: stored.error || null
      }
    }
    return null
  }

  const getCachedAsrOutputSummary = async (
    videoId: string,
    model: string
  ): Promise<{ ready: boolean; jaCueCount: number }> => {
    const localResult = await chrome.storage.local.get([
      asrSubtitleStorageKey(videoId)
    ])
    const localCached = localResult[asrSubtitleStorageKey(videoId)]
    const localJaCues = Array.isArray(localCached?.jaCues)
      ? localCached.jaCues
      : []
    if (localJaCues.length > 0) {
      return {
        ready: true,
        jaCueCount: localJaCues.length
      }
    }

    const backend = await resolveAsrBackend()
    if (backend.kind !== "jobs") {
      return { ready: false, jaCueCount: 0 }
    }

    const cachedQuery = new URLSearchParams({
      videoId,
      model,
      cachedOnly: "1"
    })
    const cachedResponse = await fetchWithTimeout(
      `${backend.baseUrl}/subtitles?${cachedQuery.toString()}`,
      undefined,
      5000
    )

    if (!cachedResponse.ok) {
      return { ready: false, jaCueCount: 0 }
    }

    const cachedPayload = await cachedResponse.json()
    const cachedJaVtt =
      typeof cachedPayload.jaVtt === "string" ? cachedPayload.jaVtt : ""
    const cachedJaCount = parseVTT(cachedJaVtt).length

    return {
      ready: cachedJaCount > 0,
      jaCueCount: cachedJaCount
    }
  }

  const toFriendlyContentScriptError = (error: unknown): string => {
    const message = String((error as any)?.message || error || "")
    if (
      message.includes("Receiving end does not exist") ||
      message.includes("Could not establish connection")
    ) {
      return "YouTube subtitle receiver is not ready. Refresh the video tab once, then click Load Generated JP again."
    }
    return message || "Failed to communicate with the YouTube page."
  }

  const startAsrJobInBackground = async () => {
    if (!currentVideoId) return
    if (isGeneratingAsr) return

    setIsGeneratingAsr(true)
    setAsrError(null)
    setAsrStatus("Checking local ASR service...")

    try {
      if (asrBackendMode === "browser") {
        await runBrowserWhisperGeneration(currentVideoId)
        return
      }

      const backend = await resolveAsrBackend(true)

      const cookieHeader = await getYouTubeCookieHeader()
      const query = new URLSearchParams({
        videoId: currentVideoId,
        model: normalizeLegacyAsrModel(asrModel)
      })

      setAsrStatus(
        `Generating subtitles with local Whisper (${query.get("model")})...`
      )

      const headers: Record<string, string> = {}
      if (cookieHeader) {
        headers["X-Youtube-Cookies"] = cookieHeader
      }

      const response = await fetchWithTimeout(
        `${backend.baseUrl}/subtitles?${query.toString()}`,
        { headers },
        10 * 60 * 1000
      )
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          errorText || `Local ASR generation failed (${response.status})`
        )
      }

      const payload = await response.json()
      const jaVtt = typeof payload.jaVtt === "string" ? payload.jaVtt : ""
      const jaCues = normalizeCuesToSingleLine(parseVTT(jaVtt))
      if (jaCues.length === 0) {
        throw new Error("Local ASR generated empty subtitles.")
      }

      const modelUsed = String(payload.model || query.get("model") || "base")
      await chrome.storage.local.set({
        [asrSubtitleStorageKey(currentVideoId)]: {
          videoId: currentVideoId,
          model: modelUsed,
          jpOnly: true,
          generatedAt: Date.now(),
          jaVtt,
          jaCues
        }
      })

      const nextMeta: AsrJobMeta = {
        jobId: `legacy-${Date.now()}`,
        videoId: currentVideoId,
        model: modelUsed,
        status: "done",
        updatedAt: Date.now(),
        error: null
      }
      await saveAsrJobMeta(currentVideoId, nextMeta)
      setAsrOutputReady(true)
      setAsrStatus(
        `Local ASR generation complete: ja=${jaCues.length}. Click "Load Generated JP".`
      )
    } catch (error: any) {
      console.error("[MainPage] ASR generation error:", error)
      setAsrError(error?.message || "Failed to start local ASR job.")
      setAsrStatus("")
    } finally {
      setIsGeneratingAsr(false)
    }
  }

  const checkAsrJobStatus = async () => {
    if (!currentVideoId) return
    if (isCheckingAsrJob) return

    let releaseCheckingGuard: number | null = null
    setIsCheckingAsrJob(true)
    setAsrError(null)
    releaseCheckingGuard = window.setTimeout(() => {
      setIsCheckingAsrJob(false)
    }, 30000)

    try {
      let meta = asrJobMeta
      if (!meta || meta.videoId !== currentVideoId) {
        meta = await loadStoredAsrJobMeta(currentVideoId)
      }

      if (!meta) {
        const latestQuery = new URLSearchParams({
          videoId: currentVideoId,
          model: asrModel
        })
        const backend = await resolveAsrBackend()
        if (backend.kind !== "jobs") {
          throw new Error("No ASR job found for this video. Start a job first.")
        }
        const latestResponse = await fetchWithTimeout(
          `${backend.baseUrl}/jobs/latest?${latestQuery.toString()}`
        )
        if (latestResponse.ok) {
          const latestPayload = await latestResponse.json()
          if (latestPayload?.job?.jobId) {
            meta = {
              jobId: String(latestPayload.job.jobId),
              videoId: currentVideoId,
              model: String(latestPayload.job.model || asrModel),
              status: coerceAsrJobStatus(
                String(latestPayload.job.status || "queued")
              ),
              updatedAt: Date.now(),
              error: latestPayload.job.error || null
            }
          }
        }
      }

      if (!meta) {
        throw new Error("No ASR job found for this video. Start a job first.")
      }

      if (meta.jobId.startsWith("legacy-")) {
        const cached = await getCachedAsrOutputSummary(currentVideoId, meta.model)
        if (!cached.ready) {
          throw new Error("No cached local ASR output found. Start a job first.")
        }
        await saveAsrJobMeta(currentVideoId, {
          ...meta,
          status: "done",
          updatedAt: Date.now(),
          error: null
        })
        setAsrOutputReady(true)
        setAsrStatus(
          `Local ASR output is available: ja=${cached.jaCueCount}. Click "Load Generated JP".`
        )
        return
      }

      throw new Error("No cached local ASR output found. Start Local ASR first.")
    } catch (error: any) {
      console.error("[MainPage] ASR status error:", error)
      setAsrError(error?.message || "Failed to check ASR job status.")
    } finally {
      if (releaseCheckingGuard != null) {
        window.clearTimeout(releaseCheckingGuard)
      }
      setIsCheckingAsrJob(false)
    }
  }

  const loadGeneratedAsrSubtitles = async () => {
    if (!currentVideoId) return
    if (isLoadingAsr) return

    setIsLoadingAsr(true)
    setAsrError(null)
    setAsrStatus("Loading generated JP subtitles...")

    try {
      const modelToLoad = asrJobMeta?.model || asrModel
      let jaVtt = ""
      let jaCues: SubtitleCue[] = []

      const localCachedResult = await chrome.storage.local.get([
        asrSubtitleStorageKey(currentVideoId)
      ])
      const localCached = localCachedResult[asrSubtitleStorageKey(currentVideoId)]
      if (typeof localCached?.jaVtt === "string") {
        jaVtt = localCached.jaVtt
        jaCues = normalizeCuesToSingleLine(
          Array.isArray(localCached.jaCues)
            ? localCached.jaCues
            : parseVTT(localCached.jaVtt)
        )
      }

      if (jaCues.length === 0) {
        const backend = await resolveAsrBackend()

        const query = new URLSearchParams({
          videoId: currentVideoId,
          model: modelToLoad,
          force: "0"
        })

        const response = await fetchWithTimeout(
          `${backend.baseUrl}/subtitles?${query.toString()}`
        )
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            errorText ||
              "Generated subtitles are not ready yet. Check status and try again."
          )
        }

        const payload = await response.json()
        jaVtt = typeof payload.jaVtt === "string" ? payload.jaVtt : ""
        jaCues = normalizeCuesToSingleLine(parseVTT(jaVtt))
      }

      if (jaCues.length === 0) {
        throw new Error("Cached ASR output is empty.")
      }

      await chrome.storage.local.set({
        [asrSubtitleStorageKey(currentVideoId)]: {
          videoId: currentVideoId,
          model: modelToLoad,
          jpOnly: true,
          generatedAt: Date.now(),
          jaVtt,
          jaCues
        }
      })

      await sendAsrCuesToContentScript(jaCues, asrIncludeRomaji, currentVideoId)

      setAsrOutputReady(true)
      if (
        asrJobMeta &&
        asrJobMeta.videoId === currentVideoId &&
        asrJobMeta.status !== "done"
      ) {
        await saveAsrJobMeta(currentVideoId, {
          ...asrJobMeta,
          status: "done",
          updatedAt: Date.now(),
          error: null
        })
      }

      setAsrStatus(`Loaded generated JP subtitles: ja=${jaCues.length}`)
    } catch (error: any) {
      console.error("[MainPage] ASR load error:", error)
      setAsrError(toFriendlyContentScriptError(error))
      setAsrStatus("")
    } finally {
      setIsLoadingAsr(false)
    }
  }

  useEffect(() => {
    if (!currentVideoId) {
      setAsrJobMeta(null)
      setAsrOutputReady(false)
      return
    }

    let cancelled = false

    const hydrateAsrJobState = async () => {
      try {
        const storedMeta = await loadStoredAsrJobMeta(currentVideoId)
        if (cancelled) return

        setAsrJobMeta(storedMeta)

        const modelToCheck = storedMeta?.model || asrModel
        const cached = await getCachedAsrOutputSummary(currentVideoId, modelToCheck)
        if (cancelled) return

        setAsrOutputReady(cached.ready)

        if (
          cached.ready &&
          storedMeta &&
          storedMeta.videoId === currentVideoId &&
          storedMeta.status !== "done"
        ) {
          const nextMeta: AsrJobMeta = {
            ...storedMeta,
            status: "done",
            updatedAt: Date.now(),
            error: null
          }
          await saveAsrJobMeta(currentVideoId, nextMeta)
          if (cancelled) return
        }
      } catch {
        if (!cancelled) {
          setAsrJobMeta(null)
          setAsrOutputReady(false)
        }
      }
    }

    hydrateAsrJobState()

    return () => {
      cancelled = true
    }
  }, [currentVideoId, asrModel])

  useEffect(() => {
    if (subtitleMode !== "asr") return
    if (asrBackendMode === "browser") return
    if (!currentVideoId) return
    if (!asrJobMeta || asrJobMeta.videoId !== currentVideoId) return
    if (!(asrJobMeta.status === "queued" || asrJobMeta.status === "running"))
      return
    if (isCheckingAsrJob || isGeneratingAsr || isLoadingAsr) return

    const timer = window.setTimeout(() => {
      checkAsrJobStatus()
    }, 2500)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    subtitleMode,
    asrBackendMode,
    currentVideoId,
    asrJobMeta?.jobId,
    asrJobMeta?.videoId,
    asrJobMeta?.status,
    asrJobMeta?.updatedAt,
    isCheckingAsrJob,
    isGeneratingAsr,
    isLoadingAsr
  ])

  const isYouTubePage = currentUrl.includes("youtube.com")
  const hasAsrJobForCurrentVideo =
    !!currentVideoId && !!asrJobMeta && asrJobMeta.videoId === currentVideoId
  const asrJobState: AsrJobState = hasAsrJobForCurrentVideo
    ? asrJobMeta?.status || "idle"
    : "idle"
  const isAsrJobRunning = asrJobState === "queued" || asrJobState === "running"
  const isAsrBusy = isGeneratingAsr || isCheckingAsrJob || isLoadingAsr
  const canStartAsrJob = !!currentVideoId && !isAsrBusy && !isAsrJobRunning
  const canLoadGeneratedAsr =
    !!currentVideoId &&
    !isAsrBusy &&
    (asrOutputReady || (hasAsrJobForCurrentVideo && asrJobState === "done"))

  return (
    <div className="w-72 p-4 bg-yellow-400 text-black flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-xl font-extrabold text-black">Bundai</h1>
        <h2 className="text-xs text-black opacity-80">
          A Japanese learning browser extension
        </h2>
      </div>

      {/* Current Video Info */}
      <div className="text-xs bg-white bg-opacity-50 p-2 rounded">
        <div className="font-semibold">Current Page:</div>
        <div className="break-all">{currentUrl || "Loading..."}</div>
        {isYouTubePage ? (
          <div className="mt-1">
            <span className="font-semibold">Video ID: </span>
            <span
              className={currentVideoId ? "text-green-700" : "text-red-700"}>
              {currentVideoId || "Not detected"}
            </span>
          </div>
        ) : (
          <div className="text-orange-600 mt-1">Not a YouTube page</div>
        )}
      </div>

      {/* Extension Enable/Disable Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-black font-medium opacity-80">Disabled</span>
        <label className="toggle relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only"
            checked={enabled}
            onChange={handleToggle}
            disabled={loading}
          />
          <div className="toggle-track"></div>
          <div className="toggle-knob"></div>
        </label>
        <span className="text-black font-medium opacity-80">Enabled</span>
      </div>

      {/* Retry & Refresh Buttons */}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={async () => {
            // Toggle off
            setEnabled(false)
            await secureStorage.set("extensionEnabled", false)
            await notifyExtensionToggle(false)
            // Toggle back on after short delay
            setTimeout(async () => {
              setEnabled(true)
              await secureStorage.set("extensionEnabled", true)
              await notifyExtensionToggle(true)
            }, 300)
          }}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded font-semibold hover:bg-blue-600">
          Retry
        </button>
        <button
          onClick={async () => {
            const [tab] = await chrome.tabs.query({
              active: true,
              currentWindow: true
            })
            if (tab?.id) {
              chrome.tabs.reload(tab.id)
            }
          }}
          className="px-3 py-1 bg-gray-500 text-white text-sm rounded font-semibold hover:bg-gray-600">
          Refresh Page
        </button>
      </div>

      <div className="text-black text-sm mt-2">
        The extension is{" "}
        <span
          className={
            enabled
              ? "text-green-700 font-semibold"
              : "text-red-700 font-semibold"
          }>
          {enabled ? "Enabled" : "Disabled"}
        </span>
        .
      </div>

      {/* WordCard Styling Section */}
      {enabled && (
        <div className="bg-white bg-opacity-50 p-3 rounded border-2 border-black">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowStyleEditor(!showStyleEditor)}>
            <h3 className="text-black font-bold">WordCard Styling</h3>
            <span className="text-xl font-bold">
              {showStyleEditor ? "▼" : "▶"}
            </span>
          </div>

          {showStyleEditor && (
            <div className="mt-3 space-y-3">
              {/* Background Color */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Background Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={wordCardStyles.backgroundColor}
                    onChange={(e) =>
                      handleWordCardStyleChange(
                        "backgroundColor",
                        e.target.value
                      )
                    }
                    className="w-12 h-8 rounded cursor-pointer"
                  />
                  <span className="text-xs">
                    {wordCardStyles.backgroundColor}
                  </span>
                </div>
              </div>

              {/* Text Color */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Text Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={wordCardStyles.textColor}
                    onChange={(e) =>
                      handleWordCardStyleChange("textColor", e.target.value)
                    }
                    className="w-12 h-8 rounded cursor-pointer"
                  />
                  <span className="text-xs">{wordCardStyles.textColor}</span>
                </div>
              </div>

              {/* Border Color */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Border Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={wordCardStyles.borderColor}
                    onChange={(e) =>
                      handleWordCardStyleChange("borderColor", e.target.value)
                    }
                    className="w-12 h-8 rounded cursor-pointer"
                  />
                  <span className="text-xs">{wordCardStyles.borderColor}</span>
                </div>
              </div>

              {/* Word Font Size */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Word Size: {wordCardStyles.wordFontSize}px
                </label>
                <input
                  type="range"
                  min="24"
                  max="72"
                  value={wordCardStyles.wordFontSize}
                  onChange={(e) =>
                    handleWordCardStyleChange(
                      "wordFontSize",
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full"
                />
              </div>

              {/* Reset Button */}
              <button
                onClick={resetWordCardStyles}
                className="w-full px-3 py-2 bg-red-500 text-white rounded font-semibold hover:bg-red-600 text-sm">
                Reset to Default
              </button>
            </div>
          )}
        </div>
      )}

      {/* Subtitle Mode Toggle - Show for all sites, but limit options on non-YouTube */}
      {enabled && (
        <div className="bg-white bg-opacity-50 p-3 rounded border-2 border-black">
          <h3 className="text-black font-bold mb-2">Subtitle Mode</h3>
          <div className="flex flex-col gap-2">
            {isYouTubePage && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="subtitleMode"
                    checked={subtitleMode === "api"}
                    onChange={() => handleSubtitleModeChange("api")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">API Subtitles</span>
                </label>
                <p className="text-xs text-gray-600 ml-6">
                  Fetch from Bundai API
                </p>

                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="radio"
                    name="subtitleMode"
                    checked={subtitleMode === "asr"}
                    onChange={() => handleSubtitleModeChange("asr")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Local ASR</span>
                </label>
                <p className="text-xs text-gray-600 ml-6">
                  Generate subtitles on your machine (localhost)
                </p>
              </>
            )}

            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="radio"
                name="subtitleMode"
                checked={subtitleMode === "user"}
                onChange={() => handleSubtitleModeChange("user")}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Upload Subtitle</span>
            </label>
            <p className="text-xs text-gray-600 ml-6">
              Upload your own subtitle file
            </p>
          </div>

          {!isYouTubePage && (
            <p className="text-xs text-orange-600 mt-2 italic">
              Note: Only "Upload Subtitle" mode is available on this site.
            </p>
          )}
        </div>
      )}

      {/* Japanese Subtitle Container Styling Section */}
      {enabled && (
        <div className="bg-white bg-opacity-50 p-3 rounded border-2 border-black">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() =>
              setShowSubtitleStyleEditor(!showSubtitleStyleEditor)
            }>
            <h3 className="text-black font-bold">Japanese Subtitle Styling</h3>
            <span className="text-xl font-bold">
              {showSubtitleStyleEditor ? "▼" : "▶"}
            </span>
          </div>

          {showSubtitleStyleEditor && (
            <div className="mt-3 space-y-3">
              {/* Background Color */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Background Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={subtitleContainerStyles.backgroundColor}
                    onChange={(e) =>
                      handleSubtitleStyleChange(
                        "backgroundColor",
                        e.target.value
                      )
                    }
                    className="w-12 h-8 rounded cursor-pointer"
                  />
                  <span className="text-xs">
                    {subtitleContainerStyles.backgroundColor}
                  </span>
                </div>
              </div>

              {/* Text Color */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Text Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={subtitleContainerStyles.textColor}
                    onChange={(e) =>
                      handleSubtitleStyleChange("textColor", e.target.value)
                    }
                    className="w-12 h-8 rounded cursor-pointer"
                  />
                  <span className="text-xs">
                    {subtitleContainerStyles.textColor}
                  </span>
                </div>
              </div>

              {/* Font Size */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Font Size: {subtitleContainerStyles.fontSize}px
                </label>
                <input
                  type="range"
                  min="16"
                  max="64"
                  value={subtitleContainerStyles.fontSize}
                  onChange={(e) =>
                    handleSubtitleStyleChange(
                      "fontSize",
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full"
                />
              </div>

              {/* Opacity */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Opacity: {(subtitleContainerStyles.opacity * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.1"
                  value={subtitleContainerStyles.opacity}
                  onChange={(e) =>
                    handleSubtitleStyleChange(
                      "opacity",
                      parseFloat(e.target.value)
                    )
                  }
                  className="w-full"
                />
              </div>

              {/* Border Radius */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Border Radius: {subtitleContainerStyles.borderRadius}px
                </label>
                <input
                  type="range"
                  min="0"
                  max="24"
                  value={subtitleContainerStyles.borderRadius}
                  onChange={(e) =>
                    handleSubtitleStyleChange(
                      "borderRadius",
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full"
                />
              </div>

              {/* Vertical Position */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Vertical Position (Windowed):{" "}
                  {subtitleContainerStyles.verticalPosition}% from video bottom
                </label>
                <input
                  type="range"
                  min="-30"
                  max="50"
                  step="1"
                  value={subtitleContainerStyles.verticalPosition}
                  onChange={(e) =>
                    handleSubtitleStyleChange(
                      "verticalPosition",
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full"
                />
              </div>

              {/* Fullscreen Vertical Position */}
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Fullscreen Vertical:{" "}
                  {subtitleContainerStyles.fullscreenVerticalPosition}% from
                  video bottom
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={subtitleContainerStyles.fullscreenVerticalPosition}
                  onChange={(e) =>
                    handleSubtitleStyleChange(
                      "fullscreenVerticalPosition",
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full"
                />
              </div>

              {/* Reset Button */}
              <button
                onClick={resetSubtitleContainerStyles}
                className="w-full px-3 py-2 bg-red-500 text-white rounded font-semibold hover:bg-red-600 text-sm">
                Reset to Default
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode-specific content */}
      {enabled && isYouTubePage && currentVideoId && subtitleMode === "api" ? (
        <div className="mt-4">
          {cachedSubtitles && Object.keys(cachedSubtitles).length > 0 ? (
            <SubtitlesSection
              subtitles={cachedSubtitles}
              error={subtitleError}
              subtitleLoading={isFetchingSubtitles}
              currentVideoId={currentVideoId}
            />
          ) : (
            <div>
              <div className="mb-3">
                <h3 className="text-black font-bold">Available Subtitles</h3>
                {subtitleError && (
                  <p className="text-xs text-red-700 mt-1">{subtitleError}</p>
                )}
                <p className="text-xs text-gray-600 mt-1">
                  No cached subtitles found. Click below to fetch subtitles for
                  this video.
                </p>
              </div>
              <button
                onClick={handleFetchSubtitles}
                disabled={isFetchingSubtitles}
                className="w-full px-3 py-2 bg-green-500 text-white rounded font-semibold hover:bg-green-600 disabled:bg-gray-400">
                {isFetchingSubtitles ? "Fetching..." : "Fetch Subtitles"}
              </button>
            </div>
          )}
        </div>
      ) : enabled &&
        isYouTubePage &&
        currentVideoId &&
        subtitleMode === "asr" ? (
        <div className="mt-4 bg-white bg-opacity-50 p-3 rounded border-2 border-black">
          <h3 className="text-black font-bold mb-2">Generate Subtitles (ASR)</h3>
          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1">Backend</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="asrBackend"
                  checked={asrBackendMode === "local"}
                  onChange={() => handleAsrBackendModeChange("local")}
                />
                Local Server
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="asrBackend"
                  checked={asrBackendMode === "browser"}
                  onChange={() => handleAsrBackendModeChange("browser")}
                />
                Browser Whisper
              </label>
            </div>
          </div>

          <p className="text-xs text-gray-700 mb-3">
            {asrBackendMode === "local"
              ? "Uses the Bundai desktop ASR service at 127.0.0.1:8765. Open the Bundai desktop app first."
              : "Runs Whisper directly in the browser. First run downloads the model and caches it for reuse."}
          </p>
          <p className="text-xs text-gray-700 mb-3">
            ASR mode is JP-only and normalized to one-line subtitle text.
          </p>

          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1">Model</label>
            <select
              value={asrBackendMode === "browser" ? browserWhisperModel : asrModel}
              onChange={(e) => {
                if (asrBackendMode === "browser") {
                  handleBrowserWhisperModelChange(
                    e.target.value as BrowserWhisperModel
                  )
                } else {
                  setAsrModel(e.target.value)
                }
              }}
              className="w-full px-2 py-1 rounded border border-black text-sm bg-white">
              {asrBackendMode === "browser" ? (
                <>
                  <option value="Xenova/whisper-tiny">
                    Whisper tiny (~150MB, cached)
                  </option>
                  <option value="Xenova/whisper-base">
                    Whisper base (~300-500MB, cached)
                  </option>
                </>
              ) : (
                <>
                  <option value="tiny">Whisper tiny (Desktop app)</option>
                  <option value="base">Whisper base (Desktop app fallback)</option>
                  <option value="small">Whisper small (Desktop app fallback)</option>
                </>
              )}
            </select>
          </div>

          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1">Romaji Track</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="asrRomaji"
                  checked={asrIncludeRomaji}
                  onChange={() => handleAsrIncludeRomajiChange(true)}
                />
                On
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="asrRomaji"
                  checked={!asrIncludeRomaji}
                  onChange={() => handleAsrIncludeRomajiChange(false)}
                />
                Off
              </label>
            </div>
          </div>

          {asrError && <p className="text-xs text-red-700 mb-2">{asrError}</p>}
          {asrStatus && <p className="text-xs text-green-700 mb-2">{asrStatus}</p>}

          {asrJobMeta && asrJobMeta.videoId === currentVideoId && (
            <div className="text-xs text-gray-800 bg-yellow-100 border border-yellow-300 rounded p-2 mb-2">
              <div>
                <span className="font-semibold">Job:</span> {asrJobMeta.jobId}
              </div>
              <div>
                <span className="font-semibold">Status:</span> {asrJobMeta.status}
              </div>
              <div>
                <span className="font-semibold">Model:</span> {asrJobMeta.model}
              </div>
            </div>
          )}

          <button
            onClick={startAsrJobInBackground}
            disabled={!canStartAsrJob}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400">
            {isGeneratingAsr
              ? "Starting..."
              : isAsrJobRunning
                ? "Job Running..."
                : asrBackendMode === "browser"
                  ? "Capture + Run Browser Whisper"
                  : "Start Background ASR Job"}
          </button>

          <button
            onClick={loadGeneratedAsrSubtitles}
            disabled={!canLoadGeneratedAsr}
            className="w-full mt-2 px-3 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:bg-gray-400">
            {isLoadingAsr
              ? "Loading..."
              : canLoadGeneratedAsr
                ? asrIncludeRomaji
                  ? "Load Generated JP + Romaji"
                  : "Load Generated JP"
                : asrIncludeRomaji
                  ? "Load JP + Romaji (Not Ready)"
                  : "Load JP (Not Ready)"}
          </button>

          <p className="text-xs text-gray-600 mt-2">
            {asrBackendMode === "browser"
              ? "First browser run can take time because model files download and cache locally."
              : "First run can take time because audio download + ASR happens on your machine."}
          </p>
          <p className="text-xs text-gray-700 mt-1">
            Job state:{" "}
            <span className="font-semibold">
              {hasAsrJobForCurrentVideo ? asrJobState : "idle"}
            </span>
            {" | "}
            Output:{" "}
            <span className="font-semibold">
              {asrOutputReady ? "ready" : "not ready"}
            </span>
            {" | "}
            Status check:{" "}
            <span className="font-semibold">
              {isCheckingAsrJob ? "auto-checking" : "auto"}
            </span>
          </p>
          <p className="text-xs text-green-800 mt-2">
            {asrBackendMode === "browser"
              ? "Browser Whisper captures the next ~90 seconds of tab audio and transcribes it locally."
              : "After you start a job, it runs on the local server in the background. You can close the popup and come back later."}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {asrBackendMode === "browser"
              ? "Flow: Capture + transcribe in browser -> Load generated subtitles."
              : "Flow: Start job -> wait for auto status -> Load generated subtitles."}
          </p>
        </div>
      ) : enabled && subtitleMode === "user" ? (
        <UserSubtitleUpload
          currentVideoId={currentVideoId}
          currentUrl={currentUrl}
          isEnabled={enabled}
          isYouTube={isYouTubePage}
        />
      ) : enabled && isYouTubePage && !currentVideoId ? (
        <div className="mt-4 p-3 bg-red-100 rounded">
          <h3 className="text-red-700 font-bold">Video ID Not Found</h3>
          <p className="text-xs text-red-600 mt-1">
            Could not extract video ID from current URL. Make sure you're on a
            YouTube video page.
          </p>
        </div>
      ) : null}

      <div className="text-black text-xs mt-1 opacity-70">
        To completely turn off the extension, disable it from{" "}
        <span className="underline">browser://extensions</span>.
      </div>

      <button
        onClick={onOpenTabs}
        className="bg-black text-white p-2 rounded font-bold mt-2">
        Manage Account
      </button>
    </div>
  )
}

function NotLoggedInPopup({ onOpenTabs }) {
  return (
    <div className="w-72 p-4 bg-yellow-400 text-black flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-xl font-extrabold text-black">Bundai</h1>
        <h2 className="text-xs text-black opacity-80">
          A Japanese learning browser extension
        </h2>
      </div>

      <div className="bg-white bg-opacity-30 p-3 rounded border border-black border-opacity-20">
        <h3 className="font-semibold text-black mb-2">Welcome!</h3>
        <p className="text-sm text-black opacity-80 mb-3">
          Please log in or create an account to use Bundai extension features.
        </p>
        <button
          onClick={onOpenTabs}
          className="w-full bg-black text-white p-2 rounded font-bold hover:bg-gray-800 transition-colors">
          Login / Register
        </button>
      </div>

      <div className="text-xs text-black opacity-60">
        <p className="font-semibold mb-1">Features available after login:</p>
        <ul className="space-y-1">
          <li>• Japanese subtitle extraction</li>
          <li>• Vocabulary learning tools</li>
          <li>• Progress tracking</li>
        </ul>
      </div>
    </div>
  )
}

function IndexPopup() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [secureReady, setSecureReady] = useState(false)
  const [secureStorage] = useState(() => new SecureStorage())

  // Check if running in development mode
  const isDev =
    process.env.NODE_ENV === "development" ||
    window.location.hostname === "localhost" ||
    window.location.href.includes("localhost")

  useEffect(() => {
    secureStorage
      .setPassword(process.env.PLASMO_SECURE_STORAGE_PASSWORD)
      .then(() => setSecureReady(true))
  }, [secureStorage])

  useEffect(() => {
    if (!secureReady) return

    // Skip login in development mode
    if (isDev) {
      console.log("[Bundai] Development mode - skipping login")
      setLoggedIn(true)
      return
    }

    secureStorage.get("loggedIn").then((value) => {
      setLoggedIn(typeof value === "boolean" ? value : false)
    })
  }, [secureReady, secureStorage, isDev])

  const handleOpenTabs = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("tabs/auth.html")
    })
  }

  if (!secureReady || loggedIn === null) return null

  if (loggedIn) {
    return <MainPage onOpenTabs={handleOpenTabs} />
  } else {
    return <NotLoggedInPopup onOpenTabs={handleOpenTabs} />
  }
}

const MainApp = () => (
  <ApolloProvider client={client}>
    <IndexPopup />
  </ApolloProvider>
)

export default MainApp
