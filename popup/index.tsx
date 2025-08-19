// Modified index.tsx
import { useEffect, useState } from "react"

import Login from "./login"
import Register from "./register"

import "../style.css"

import { ApolloProvider } from "@apollo/client"

import { SecureStorage } from "@plasmohq/storage/secure"

import SubtitlesSection from "~components/SubtitlesSection"
import client from "~graphql"
import { useSubtitle } from "~hooks/useSubtitle"

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

function MainPage({ onLogout }) {
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

  // Don't use useSubtitle hook - we'll manage subtitle fetching manually

  // Function to get current tab URL and extract video ID
  const getCurrentVideoId = async () => {
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (tab && tab.url) {
        setCurrentUrl(tab.url)
        const videoId = extractVideoId(tab.url)

        // Only update video ID if it actually changed
        if (videoId !== currentVideoId) {
          setCurrentVideoId(videoId)
          // Load cached subtitles for this video if available
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
        // Cache expired or doesn't exist
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

    setIsFetchingSubtitles(true)
    setSubtitleError(null)

    try {
      // Use the same logic as your useSubtitle hook
      const res = await fetch(
        `http://localhost:8000/subtitles/${videoId}?subtitle_format=vtt`
      )

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || "Failed to fetch subtitles.")
      }

      const subtitles = await res.json()

      // Cache the result
      const cacheKey = `subtitles_cache_${videoId}`
      const cacheData = {
        data: subtitles,
        timestamp: Date.now(),
        expiry: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      }
      await chrome.storage.local.set({ [cacheKey]: cacheData })

      setCachedSubtitles(subtitles)
      console.log("Fetched and cached subtitles for video:", videoId)
    } catch (error) {
      console.error("Error fetching subtitles:", error)
      setSubtitleError(error.message || "Failed to fetch subtitles")
    } finally {
      setIsFetchingSubtitles(false)
    }
  }

  // Send message to content script to update extension state
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
    secureStorage
      .setPassword("bundai-secure-key")
      .then(() => setSecureReady(true))
  }, [secureStorage])

  // Load extension enabled state
  useEffect(() => {
    if (!secureReady) return
    secureStorage.get("extensionEnabled").then((value) => {
      const enabledValue = typeof value === "boolean" ? value : true
      setEnabled(enabledValue)
      setLoading(false)
      notifyContentScript(enabledValue)
    })
  }, [secureReady, secureStorage])

  // Get current video ID when component mounts and load cached subtitles
  useEffect(() => {
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
    setEnabled(newValue)

    // Save to storage
    await secureStorage.set("extensionEnabled", newValue)

    // Notify content script immediately
    await notifyContentScript(newValue)
  }

  const handleRefreshVideoId = async () => {
    const videoId = await getCurrentVideoId()
    if (videoId) {
      await loadCachedSubtitles(videoId)
    }
  }

  // Function to fetch subtitles when user needs them
  const handleFetchSubtitles = async () => {
    if (!currentVideoId) return
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
        onClick={onLogout}
        className="bg-black text-yellow-400 p-2 rounded font-bold mt-2">
        Logout
      </button>
    </div>
  )
}

// Rest of the component remains the same...
function IndexPopup() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [secureReady, setSecureReady] = useState(false)
  const [secureStorage] = useState(() => new SecureStorage())
  const [showRegister, setShowRegister] = useState(false)

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

  const handleLogin = () => {
    setLoggedIn(true)
    setShowRegister(false)
  }

  const handleLogout = async () => {
    await secureStorage.set("loggedIn", false)
    setLoggedIn(false)
  }

  const handleShowRegister = () => setShowRegister(true)
  const handleShowLogin = () => setShowRegister(false)

  if (!secureReady || loggedIn === null) return null

  if (!loggedIn) {
    if (showRegister) {
      return <Register onRegister={handleLogin} onShowLogin={handleShowLogin} />
    } else {
      return <Login onLogin={handleLogin} onShowRegister={handleShowRegister} />
    }
  }

  return <MainPage onLogout={handleLogout} />
}

const MainApp = () => (
  <ApolloProvider client={client}>
    <IndexPopup />
  </ApolloProvider>
)

export default MainApp
