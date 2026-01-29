import { useEffect, useRef, useState } from "react"

import {
  applyTimeOffset,
  parseSubtitleText,
  SubtitleCue
} from "~utils/subtitleParser"

interface UserSubtitleUploadProps {
  currentVideoId: string | null
  isEnabled: boolean
}

interface StoredUserSubtitle {
  cues: SubtitleCue[]
  timeOffset: number
  fileName: string
  format: "vtt" | "srt"
  uploadedAt: number
}

const UserSubtitleUpload: React.FC<UserSubtitleUploadProps> = ({
  currentVideoId,
  isEnabled
}) => {
  const [subtitle, setSubtitle] = useState<StoredUserSubtitle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (currentVideoId) {
      loadSavedSubtitle()
    }
  }, [currentVideoId])

  const loadSavedSubtitle = async () => {
    if (!currentVideoId) return
    try {
      const result = await chrome.storage.local.get([`userSubtitle_${currentVideoId}`])
      const saved = result[`userSubtitle_${currentVideoId}`]
      if (saved) setSubtitle(saved)
    } catch (error) {
      console.error("Error loading saved user subtitle:", error)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentVideoId) {
      setError("No file selected or no video detected")
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const text = await file.text()
      const cues = parseSubtitleText(text, file.name)
      if (cues.length === 0) {
        setError("Could not parse subtitle file. Please check the format.")
        setLoading(false)
        return
      }
      const lowerName = file.name.toLowerCase()
      const format = lowerName.endsWith(".vtt") ? "vtt" : lowerName.endsWith(".ass") ? "ass" : "srt"
      const subtitleData: StoredUserSubtitle = {
        cues, timeOffset: 0, fileName: file.name, format, uploadedAt: Date.now()
      }
      await chrome.storage.local.set({ [`userSubtitle_${currentVideoId}`]: subtitleData })
      setSubtitle(subtitleData)
      setSuccess(`Subtitle uploaded successfully! (${cues.length} cues)`)
      await loadSubtitleInContentScript(subtitleData)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(`Error uploading file: ${err.message}`)
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const loadSubtitleInContentScript = async (subtitleData: StoredUserSubtitle) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) throw new Error("No active tab found")
      const adjustedCues = applyTimeOffset(subtitleData.cues, subtitleData.timeOffset)
      await chrome.tabs.sendMessage(tab.id, { action: "loadUserSubtitle", trackNumber: 1, cues: adjustedCues })
    } catch (error: any) {
      console.error("Error loading subtitle:", error)
      setError(`Failed to load subtitle: ${error.message}`)
    }
  }

  const adjustTimeOffset = async (deltaSeconds: number) => {
    if (!currentVideoId || !subtitle) return
    const newOffset = subtitle.timeOffset + deltaSeconds
    const updatedSubtitle = { ...subtitle, timeOffset: newOffset }
    setSubtitle(updatedSubtitle)
    await chrome.storage.local.set({ [`userSubtitle_${currentVideoId}`]: updatedSubtitle })
    await loadSubtitleInContentScript(updatedSubtitle)
  }

  const clearSubtitle = async () => {
    if (!currentVideoId) return
    try {
      await chrome.storage.local.remove([`userSubtitle_${currentVideoId}`])
      setSubtitle(null)
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab.id) await chrome.tabs.sendMessage(tab.id, { action: "clearUserSubtitle", trackNumber: 1 })
      setSuccess("Subtitle cleared")
      setTimeout(() => setSuccess(null), 2000)
    } catch (error: any) {
      setError(`Error clearing subtitle: ${error.message}`)
    }
  }

  const formatTimeOffset = (seconds: number): string => {
    const sign = seconds >= 0 ? "+" : ""
    const absSeconds = Math.abs(seconds)
    const mins = Math.floor(absSeconds / 60)
    const secs = Math.floor(absSeconds % 60)
    const millis = Math.floor((absSeconds % 1) * 1000)
    return `${sign}${mins}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
  }

  if (!isEnabled) {
    return <div className="mt-4 p-3 bg-gray-200 rounded"><p className="text-xs text-gray-600">Enable the extension to upload subtitles</p></div>
  }

  return (
    <div className="mt-4 bg-white bg-opacity-50 p-3 rounded border-2 border-black">
      <h3 className="text-black font-bold mb-2">Upload Japanese Subtitle</h3>
      {loading && <p className="text-xs text-blue-700 mb-2">Processing subtitle file...</p>}
      {error && <p className="text-xs text-red-700 mb-2">{error}</p>}
      {success && <p className="text-xs text-green-700 mb-2">{success}</p>}
      {subtitle ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-green-50 p-2 rounded">
            <span className="text-xs text-green-800 truncate flex-1 mr-2">{subtitle.fileName}</span>
            <span className="text-xs text-green-600">{subtitle.cues.length} cues</span>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <label className="text-xs font-semibold block mb-2">Time Sync (Offset: {formatTimeOffset(subtitle.timeOffset)}s)</label>
            <div className="grid grid-cols-4 gap-1">
              <button onClick={() => adjustTimeOffset(-0.5)} className="px-1 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">← -0.5s</button>
              <button onClick={() => adjustTimeOffset(-0.1)} className="px-1 py-1.5 bg-blue-400 text-white text-xs rounded hover:bg-blue-500">← -0.1s</button>
              <button onClick={() => adjustTimeOffset(0.1)} className="px-1 py-1.5 bg-blue-400 text-white text-xs rounded hover:bg-blue-500">+0.1s →</button>
              <button onClick={() => adjustTimeOffset(0.5)} className="px-1 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">+0.5s →</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Negative = show earlier, Positive = show later</p>
          </div>
          <div className="flex gap-2">
            <button onClick={clearSubtitle} className="flex-1 px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 font-medium">Remove Subtitle</button>
            <button onClick={() => loadSubtitleInContentScript(subtitle)} className="flex-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 font-medium">Reload</button>
          </div>
          <div className="border-t border-gray-200 pt-3 mt-3">
            <label className="text-xs text-gray-600 block mb-1">Or upload a different file:</label>
            <input ref={fileInputRef} type="file" accept=".vtt,.srt,.ass" onChange={handleFileUpload} className="w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-500 file:text-white hover:file:bg-gray-600" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input ref={fileInputRef} type="file" accept=".vtt,.srt,.ass" onChange={handleFileUpload} className="w-full text-xs file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-500 file:text-white hover:file:bg-blue-600" />
          <p className="text-xs text-gray-500">Upload VTT, SRT, or ASS file with Japanese subtitles</p>
        </div>
      )}
    </div>
  )
}

export default UserSubtitleUpload
