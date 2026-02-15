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
const LOCAL_ASR_BASE_URL = "http://127.0.0.1:3000/asr"
type SubtitleMode = "api" | "user" | "asr"
type AsrJobState = "idle" | "queued" | "running" | "done" | "failed"
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

  // Subtitle mode: 'api' | 'user' | 'asr'
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("user")
  const [showRefreshMessage, setShowRefreshMessage] = useState(false)
  const [asrModel, setAsrModel] = useState("Qwen/Qwen3-ASR-0.6B")
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

      console.log("[MainPage] Fetching subtitles for video:", videoId)
      console.log("[MainPage] Cookie header length:", cookieHeader?.length || 0)

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      }

      if (cookieHeader) {
        headers["X-Youtube-Cookies"] = cookieHeader
      }

      const response = await fetch(
        `${BUNDAI_API_BASE_URL}/subtitles/${videoId}?subtitle_format=vtt`,
        { headers }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || "Failed to fetch subtitles.")
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
      setSubtitleError(error.message || "Failed to fetch subtitles")
    } finally {
      setIsFetchingSubtitles(false)
      inFlightRequestsRef.current.delete(videoId)
    }
  }

  const getYouTubeCookieHeader = async (): Promise<string> => {
    try {
      console.log("[MainPage] collecting YouTube cookies")
      const cookies = await chrome.cookies.getAll({
        url: "https://www.youtube.com"
      })
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

    // Load subtitle mode preference (migrate from old boolean if needed)
    secureStorage.get("subtitleMode").then((value) => {
      if (value && ["api", "user", "asr"].includes(value as string)) {
        setSubtitleMode(value as SubtitleMode)
        console.log("[MainPage] subtitleMode:", value)
      } else {
        setSubtitleMode("api")
      }
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

  const sendAsrCuesToContentScript = async (
    jaCues: SubtitleCue[],
    includeRomaji: boolean
  ) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      throw new Error("No active tab found")
    }

    await new Promise<void>((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id as number,
        {
          action: "loadAsrSubtitle",
          cues: jaCues,
          includeRomaji
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        }
      )
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

  const asrJobStorageKey = (videoId: string) => `asrJobMeta_${videoId}`

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
    const cachedQuery = new URLSearchParams({
      videoId,
      model,
      cachedOnly: "1"
    })
    const cachedResponse = await fetchWithTimeout(
      `${LOCAL_ASR_BASE_URL}/subtitles?${cachedQuery.toString()}`,
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
      const health = await fetchWithTimeout(`${LOCAL_ASR_BASE_URL}/health`)
      if (!health.ok) {
        throw new Error(
          `Local ASR service is not reachable (${health.status}). Make sure ~/projects/server is running with /asr endpoints.`
        )
      }

      const cookieHeader = await getYouTubeCookieHeader()
      const query = new URLSearchParams({
        videoId: currentVideoId,
        model: asrModel
      })

      setAsrStatus(`Generating subtitles with Qwen (${asrModel})...`)

      const headers: Record<string, string> = {}
      if (cookieHeader) {
        headers["X-Youtube-Cookies"] = cookieHeader
      }

      const response = await fetchWithTimeout(
        `${LOCAL_ASR_BASE_URL}/jobs/start?${query}`,
        { headers }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `ASR job start failed (${response.status})`)
      }

      const payload = await response.json()
      if (!payload?.ok || !payload?.job?.jobId) {
        throw new Error("ASR job did not return a valid jobId.")
      }

      const nextMeta: AsrJobMeta = {
        jobId: String(payload.job.jobId),
        videoId: currentVideoId,
        model: String(payload.job.model || asrModel),
        status: coerceAsrJobStatus(String(payload.job.status || "queued")),
        updatedAt: Date.now(),
        error: payload.job.error || null
      }

      await saveAsrJobMeta(currentVideoId, nextMeta)
      setAsrOutputReady(false)
      setAsrStatus(
        `ASR job started (${nextMeta.status}). You can close this popup; status auto-refreshes when reopened.`
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
        const latestResponse = await fetchWithTimeout(
          `${LOCAL_ASR_BASE_URL}/jobs/latest?${latestQuery.toString()}`
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

      const statusQuery = new URLSearchParams({ jobId: meta.jobId })
      const response = await fetchWithTimeout(
        `${LOCAL_ASR_BASE_URL}/jobs/status?${statusQuery.toString()}`
      )
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `ASR status check failed (${response.status})`)
      }

      const payload = await response.json()
      const job = payload?.job
      if (!job?.jobId) {
        throw new Error("Invalid ASR status response.")
      }

      let nextMeta: AsrJobMeta = {
        jobId: String(job.jobId),
        videoId: currentVideoId,
        model: String(job.model || meta.model),
        status: coerceAsrJobStatus(String(job.status || "queued")),
        updatedAt: Date.now(),
        error: job.error || null
      }

      if (nextMeta.status === "queued" || nextMeta.status === "running") {
        try {
          const cached = await getCachedAsrOutputSummary(
            currentVideoId,
            nextMeta.model
          )
          if (cached.ready) {
            nextMeta = {
              ...nextMeta,
              status: "done",
              updatedAt: Date.now(),
              error: null
            }
            await saveAsrJobMeta(currentVideoId, nextMeta)
            setAsrOutputReady(true)
            setAsrStatus(
              `ASR output is available: ja=${cached.jaCueCount}. Click "Load Generated JP".`
            )
            return
          }
        } catch (cachedCheckError) {
          console.warn(
            "[MainPage] cached ASR availability check failed:",
            cachedCheckError
          )
        }
      }

      await saveAsrJobMeta(currentVideoId, nextMeta)

      if (nextMeta.status === "done") {
        const jaCount = Number(job?.resultSummary?.jaCueCount || 0)
        setAsrOutputReady(true)
        setAsrStatus(
          `ASR done${jaCount ? `: ja=${jaCount}` : ""}. Click "Load Generated JP".`
        )
      } else if (nextMeta.status === "failed") {
        setAsrOutputReady(false)
        setAsrError(nextMeta.error || "ASR job failed.")
        setAsrStatus("")
      } else {
        setAsrOutputReady(false)
        setAsrStatus(
          `ASR job is ${nextMeta.status}. Status auto-refreshes while this popup is open.`
        )
      }
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
      const query = new URLSearchParams({
        videoId: currentVideoId,
        model: modelToLoad,
        cachedOnly: "1"
      })

      const response = await fetchWithTimeout(
        `${LOCAL_ASR_BASE_URL}/subtitles?${query.toString()}`
      )
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          errorText ||
            "Generated subtitles are not ready yet. Check status and try again."
        )
      }

      const payload = await response.json()
      const jaVtt = typeof payload.jaVtt === "string" ? payload.jaVtt : ""
      const jaCues = normalizeCuesToSingleLine(parseVTT(jaVtt))
      if (jaCues.length === 0) {
        throw new Error("Cached ASR output is empty.")
      }

      const key = `asrSubtitle_${currentVideoId}`
      await chrome.storage.local.set({
        [key]: {
          videoId: currentVideoId,
          model: modelToLoad,
          jpOnly: true,
          generatedAt: Date.now(),
          jaVtt,
          jaCues
        }
      })

      await sendAsrCuesToContentScript(jaCues, asrIncludeRomaji)

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

                {/*
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="radio"
                    name="subtitleMode"
                    checked={subtitleMode === "asr"}
                    onChange={() => handleSubtitleModeChange("asr")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Local ASR (Qwen)</span>
                </label>
                <p className="text-xs text-gray-600 ml-6">
                  Generate subtitles on your Mac (localhost)
                </p>
                */}
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
      ) : /* Local ASR panel temporarily disabled */ false &&
        enabled &&
        isYouTubePage &&
        currentVideoId &&
        subtitleMode === "asr" ? (
        <div className="mt-4 bg-white bg-opacity-50 p-3 rounded border-2 border-black">
          <h3 className="text-black font-bold mb-2">Generate Subtitles (Local ASR)</h3>
          <p className="text-xs text-gray-700 mb-3">
            Uses local Qwen ASR via <code>127.0.0.1:3000/asr</code>. No third-party
            API is used.
          </p>
          <p className="text-xs text-gray-700 mb-3">
            ASR mode is JP-only and normalized to one-line subtitle text (Netflix-style).
          </p>

          <div className="mb-3">
            <label className="text-xs font-semibold block mb-1">Model</label>
            <select
              value={asrModel}
              onChange={(e) => setAsrModel(e.target.value)}
              className="w-full px-2 py-1 rounded border border-black text-sm bg-white">
              <option value="Qwen/Qwen3-ASR-0.6B">Qwen3-ASR-0.6B (Fast)</option>
              <option value="Qwen/Qwen3-ASR-1.7B">Qwen3-ASR-1.7B (More accurate)</option>
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
            First run can take time because audio download + ASR happens on your
            machine.
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
            After you start a job, it runs on the local server in the background.
            You can close the popup and come back later.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Flow: Start job -&gt; wait for auto status -&gt; Load generated subtitles.
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
