import { useEffect, useRef, useState } from "react"

import {
  applyTimeOffset,
  parseSubtitleText,
  type SubtitleCue
} from "~utils/subtitleParser"

// Simple hash function for URL-based storage keys
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36).substring(0, 10)
}

interface UserSubtitleUploadProps {
  currentVideoId: string | null
  currentUrl: string
  isEnabled: boolean
  isYouTube?: boolean
}

interface StoredUserSubtitle {
  cues: SubtitleCue[]
  timeOffset: number
  fileName: string
  format: "vtt" | "srt" | "ass"
  uploadedAt: number
}

export default function UserSubtitleUpload({
  currentVideoId,
  currentUrl,
  isEnabled,
  isYouTube = false
}: UserSubtitleUploadProps) {
  const storageKey = currentVideoId || `url_${hashString(currentUrl)}`
  const [subtitle, setSubtitle] = useState<StoredUserSubtitle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (storageKey) {
      loadSavedSubtitle()
    }
  }, [storageKey])

  const loadSavedSubtitle = async () => {
    if (!storageKey) return
    try {
      const result = await chrome.storage.local.get([
        `userSubtitle_${storageKey}`
      ])
      const saved = result[`userSubtitle_${storageKey}`]
      if (saved) setSubtitle(saved)
    } catch (error) {
      console.error("Error loading saved user subtitle:", error)
    }
  }

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file || !storageKey) {
      setError("No file selected")
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const text = await file.text()
      const cues = parseSubtitleText(text, file.name)
      if (cues.length === 0) {
        setError("Could not parse subtitle file")
        setLoading(false)
        return
      }
      const format: "vtt" | "srt" | "ass" = file.name
        .toLowerCase()
        .endsWith(".vtt")
        ? "vtt"
        : file.name.toLowerCase().endsWith(".ass")
          ? "ass"
          : "srt"
      const subtitleData: StoredUserSubtitle = {
        cues,
        timeOffset: 0,
        fileName: file.name,
        format,
        uploadedAt: Date.now()
      }
      await chrome.storage.local.set({
        [`userSubtitle_${storageKey}`]: subtitleData
      })
      setSubtitle(subtitleData)
      setSuccess(`Loaded ${cues.length} cues`)
      await loadSubtitleInContentScript(subtitleData)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(`Error: ${err.message}`)
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const loadSubtitleInContentScript = async (
    subtitleData: StoredUserSubtitle,
    retries: number = 3
  ) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        })
        if (!tab.id) throw new Error("No active tab")
        const adjustedCues = applyTimeOffset(
          subtitleData.cues,
          subtitleData.timeOffset
        )

        // Check if extension is enabled first
        const state = await chrome.runtime.sendMessage({
          action: "getExtensionState"
        })
        if (!state?.enabled) {
          setError("Extension is disabled. Enable it first.")
          return
        }

        await chrome.tabs.sendMessage(tab.id, {
          action: "loadUserSubtitle",
          trackNumber: 1,
          cues: adjustedCues
        })
        return // Success
      } catch (error: any) {
        console.error(`Attempt ${attempt + 1}: Error loading subtitle:`, error)
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500)) // Wait 500ms before retry
        } else {
          setError(`Failed: ${error.message}. Try reloading the page.`)
        }
      }
    }
  }

  const sendCommand = async (
    command: string,
    value?: number,
    retries: number = 3
  ) => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        })
        if (tab.id) {
          await chrome.tabs.sendMessage(tab.id, {
            action: "subtitlePlayback",
            command,
            value
          })
          return // Success
        }
      } catch (e: any) {
        console.error(`Attempt ${attempt + 1}: Command failed:`, e.message)
        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    }
  }

  const clearSubtitle = async () => {
    if (!storageKey) return
    await chrome.storage.local.remove([`userSubtitle_${storageKey}`])
    setSubtitle(null)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab.id) {
      await chrome.tabs.sendMessage(tab.id, {
        action: "clearUserSubtitle",
        trackNumber: 1
      })
    }
  }

  const adjustTimeOffset = async (delta: number) => {
    if (!storageKey || !subtitle) return
    const updated = { ...subtitle, timeOffset: subtitle.timeOffset + delta }
    setSubtitle(updated)
    await chrome.storage.local.set({ [`userSubtitle_${storageKey}`]: updated })
    await loadSubtitleInContentScript(updated)
  }

  if (!isEnabled) {
    return (
      <div className="mt-4 p-3 bg-gray-200 rounded">
        <p className="text-xs">Enable extension to upload</p>
      </div>
    )
  }

  return (
    <div className="mt-4 bg-white bg-opacity-50 p-3 rounded border-2 border-black">
      <h3 className="text-black font-bold mb-2">Upload Subtitle</h3>
      {loading && <p className="text-xs text-blue-600 mb-2">Loading...</p>}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {success && <p className="text-xs text-green-600 mb-2">{success}</p>}

      {subtitle ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-green-50 p-2 rounded">
            <span className="text-xs text-green-800 truncate">
              {subtitle.fileName}
            </span>
            <span className="text-xs text-green-600 ml-2">
              {subtitle.cues.length} cues
            </span>
          </div>

          {/* Non-YouTube Controls */}
          {!isYouTube && (
            <div className="bg-yellow-50 p-2 rounded border border-yellow-300">
              <p className="text-xs font-bold text-yellow-800 mb-2">
                Manual Controls
              </p>

              {/* Main control row: [ -0.5s ] [ -0.2s ] [ PLAY/PAUSE ] [ +0.2s ] [ +0.5s ] */}
              <div className="flex items-center justify-center gap-1 mb-2">
                <button
                  onClick={() => sendCommand("seek", -0.5)}
                  className="w-12 h-10 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs rounded font-bold transition-colors flex flex-col items-center justify-center leading-tight">
                  <span>«</span>
                  <span>-0.5</span>
                </button>
                <button
                  onClick={() => sendCommand("seek", -0.2)}
                  className="w-12 h-10 bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white text-xs rounded font-bold transition-colors flex flex-col items-center justify-center leading-tight">
                  <span>‹</span>
                  <span>-0.2</span>
                </button>

                {/* Play/Pause Toggle Button */}
                <button
                  onClick={() => sendCommand("toggle")}
                  className="w-16 h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm rounded font-bold transition-colors flex flex-col items-center justify-center mx-1">
                  <span>▶</span>
                  <span className="text-xs">/⏸</span>
                </button>

                <button
                  onClick={() => sendCommand("seek", 0.2)}
                  className="w-12 h-10 bg-green-400 hover:bg-green-500 active:bg-green-600 text-white text-xs rounded font-bold transition-colors flex flex-col items-center justify-center leading-tight">
                  <span>›</span>
                  <span>+0.2</span>
                </button>
                <button
                  onClick={() => sendCommand("seek", 0.5)}
                  className="w-12 h-10 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xs rounded font-bold transition-colors flex flex-col items-center justify-center leading-tight">
                  <span>»</span>
                  <span>+0.5</span>
                </button>
              </div>

              {/* Reset button below */}
              <button
                onClick={() => sendCommand("reset")}
                className="w-full py-2 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm rounded font-bold transition-colors flex items-center justify-center gap-2">
                <span>↺</span>
                <span>RESET (Sync to Video Start)</span>
              </button>

              <p className="text-xs text-yellow-700 mt-2 text-center">
                Press RESET when video starts playing
              </p>
            </div>
          )}

          {/* YouTube Controls */}
          {isYouTube && (
            <div className="bg-gray-50 p-2 rounded">
              <p className="text-xs font-bold mb-1">
                Time Offset: {subtitle.timeOffset.toFixed(1)}s
              </p>
              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => adjustTimeOffset(-0.5)}
                  className="py-1 bg-blue-500 text-white text-xs rounded">
                  -0.5s
                </button>
                <button
                  onClick={() => adjustTimeOffset(-0.1)}
                  className="py-1 bg-blue-400 text-white text-xs rounded">
                  -0.1s
                </button>
                <button
                  onClick={() => adjustTimeOffset(0.1)}
                  className="py-1 bg-blue-400 text-white text-xs rounded">
                  +0.1s
                </button>
                <button
                  onClick={() => adjustTimeOffset(0.5)}
                  className="py-1 bg-blue-500 text-white text-xs rounded">
                  +0.5s
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={clearSubtitle}
              className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded">
              Remove
            </button>
            <button
              onClick={() => loadSubtitleInContentScript(subtitle)}
              className="flex-1 py-1.5 bg-blue-500 text-white text-xs rounded">
              Reload
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vtt,.srt,.ass"
            onChange={handleFileUpload}
            className="w-full text-xs mb-2"
          />
          <p className="text-xs text-gray-600">Upload VTT, SRT, or ASS file</p>
        </div>
      )}
    </div>
  )
}
