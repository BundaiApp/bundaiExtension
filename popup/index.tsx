// Simplified popup index.tsx - only shows main functionality
import { useEffect, useRef, useState } from "react"
import "../style.css"
import { ApolloProvider } from "@apollo/client"
import { SecureStorage } from "@plasmohq/storage/secure"
import SubtitlesSection from "~components/SubtitlesSection"
import client from "~graphql"

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

  const DROPLET_BASE_URL = "https://api.bundai.app"

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

      const res = await fetch(
        `${DROPLET_BASE_URL}/subtitles/${videoId}?subtitle_format=vtt`,
        {
          headers: cookieHeader
            ? {
                "X-Youtube-Cookies": cookieHeader
              }
            : undefined
        }
      )

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || "Failed to fetch subtitles.")
      }

      const raw = await res.json()
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

  const notifyContentScript = async (enabled: boolean) => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (tab?.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: "extensionToggled",
            enabled: enabled
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log(
                "Content script not ready or page doesn't support extension"
              )
            } else {
              console.log("Extension state updated in content script:", enabled)
            }
          }
        )
      }
    } catch (error) {
      console.error("Error notifying content script:", error)
    }
  }

  // Initialize secure storage
  useEffect(() => {
    console.log("[MainPage] initializing secure storage")
    secureStorage.setPassword("bundai-secure-key").then(() => {
      console.log("[MainPage] secure storage ready")
      setSecureReady(true)
    })
  }, [secureStorage])

  // Load extension enabled state
  useEffect(() => {
    if (!secureReady) return
    console.log("[MainPage] loading extensionEnabled from storage")
    secureStorage.get("extensionEnabled").then((value) => {
      const enabledValue = typeof value === "boolean" ? value : true
      setEnabled(enabledValue)
      setLoading(false)
      notifyContentScript(enabledValue)
      console.log("[MainPage] extensionEnabled:", enabledValue)
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
    await notifyContentScript(newValue)
  }

  const handleRefreshVideoId = async () => {
    const videoId = await getCurrentVideoId()
    if (videoId) {
      await loadCachedSubtitles(videoId)
    }
  }

  const handleFetchSubtitles = async () => {
    if (!currentVideoId) return
    console.log("[MainPage] fetch subtitles for", currentVideoId)
    await fetchAndCacheSubtitles(currentVideoId)
  }

  const isYouTubePage = currentUrl.includes("youtube.com")

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
        <button
          onClick={handleRefreshVideoId}
          className="mt-1 px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-black font-medium opacity-80">Disabled</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={handleToggle}
            disabled={loading}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-yellow-400 rounded-full peer peer-checked:bg-black transition-all"></div>
          <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
        </label>
        <span className="text-black font-medium opacity-80">Enabled</span>
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

      <div className="text-black text-xs mt-1 opacity-70">
        To completely turn off the extension, disable it from{" "}
        <span className="underline">browser://extensions</span>.
      </div>

      {/* Conditional subtitle section */}
      {enabled && isYouTubePage && currentVideoId ? (
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
      ) : enabled && isYouTubePage ? (
        <div className="mt-4 p-3 bg-red-100 rounded">
          <h3 className="text-red-700 font-bold">Video ID Not Found</h3>
          <p className="text-xs text-red-600 mt-1">
            Could not extract video ID from current URL. Make sure you're on a
            YouTube video page.
          </p>
        </div>
      ) : enabled ? (
        <div className="mt-4 p-3 bg-gray-100 rounded">
          <h3 className="text-gray-700 font-bold">Not on YouTube</h3>
          <p className="text-xs text-gray-600 mt-1">
            Navigate to a YouTube video to load subtitles.
          </p>
        </div>
      ) : (
        <div className="mt-4 p-3 bg-gray-200 rounded">
          <h3 className="text-gray-600 font-bold">Extension Disabled</h3>
          <p className="text-xs text-gray-500 mt-1">
            Enable the extension to use subtitle features.
          </p>
        </div>
      )}

      <button
        onClick={onOpenTabs}
        className="bg-black text-yellow-400 p-2 rounded font-bold mt-2">
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
          className="w-full bg-black text-yellow-400 p-2 rounded font-bold hover:bg-gray-800 transition-colors">
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

  useEffect(() => {
    secureStorage
      .setPassword("bundai-secure-key")
      .then(() => setSecureReady(true))
  }, [secureStorage])

  useEffect(() => {
    if (!secureReady) return
    secureStorage.get("loggedIn").then((value) => {
      setLoggedIn(typeof value === "boolean" ? value : false)
    })
  }, [secureReady, secureStorage])

  const handleOpenTabs = () => {
    chrome.tabs.create({ 
      url: chrome.runtime.getURL('tabs/auth.html')
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