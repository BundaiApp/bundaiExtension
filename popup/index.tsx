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

  // Use the dynamic video ID, fallback to null if no video ID found
  const {
    subtitles,
    loading: subtitleLoading,
    error,
    refetch
  } = useSubtitle(currentVideoId)

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
        setCurrentVideoId(videoId)

        console.log("Current URL:", tab.url)
        console.log("Extracted Video ID:", videoId)

        return videoId
      }
    } catch (error) {
      console.error("Error getting current tab:", error)
      return null
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
      const enabledValue = typeof value === "boolean" ? value : true // Default to enabled
      setEnabled(enabledValue)
      setLoading(false)

      // Notify content script of initial state
      notifyContentScript(enabledValue)
    })
  }, [secureReady, secureStorage])

  // Get current video ID when component mounts
  useEffect(() => {
    getCurrentVideoId()
  }, [])

  // Listen for tab changes (when user navigates to different videos)
  useEffect(() => {
    const handleTabChange = () => {
      getCurrentVideoId()
    }

    // Listen for tab updates
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(handleTabChange)
    }

    // Cleanup listener
    return () => {
      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.removeListener(handleTabChange)
      }
    }
  }, [])

  const handleToggle = async (e) => {
    const newValue = e.target.checked
    setEnabled(newValue)

    // Save to storage
    await secureStorage.set("extensionEnabled", newValue)

    // Notify content script immediately
    await notifyContentScript(newValue)
  }

  const handleRefreshVideoId = () => {
    getCurrentVideoId()
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

      {/* Only show subtitles section if extension is enabled */}
      {enabled && isYouTubePage && currentVideoId ? (
        <SubtitlesSection
          subtitles={subtitles}
          error={error}
          subtitleLoading={subtitleLoading}
          currentVideoId={currentVideoId}
        />
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
