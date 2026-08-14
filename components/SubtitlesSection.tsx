import { useEffect, useRef, useState } from "react"

import {
  applyTimeOffset,
  parseSubtitleText,
  type SubtitleCue
} from "~utils/subtitleParser"

interface SubtitlesSectionProps {
  subtitles: Record<string, string[]>
  subtitleLoading: boolean
  error: string | null
  currentVideoId: string | null
}

interface UploadedFileInfo {
  fileName: string
  cues: SubtitleCue[]
  format: "vtt" | "srt" | "ass"
  uploadedAt: number
  timeOffset: number
}

const SubtitlesSection: React.FC<SubtitlesSectionProps> = ({
  subtitles,
  subtitleLoading,
  error,
  currentVideoId
}) => {
  // States to store selected subtitle URLs
  const [selectedSubtitle1, setSelectedSubtitle1] = useState<string | null>(
    null
  )
  const [selectedSubtitle2, setSelectedSubtitle2] = useState<string | null>(
    null
  )
  const [loadingStatus, setLoadingStatus] = useState<string>("")
  const [subtitlesLoaded, setSubtitlesLoaded] = useState<{
    track1: boolean
    track2: boolean
  }>({ track1: false, track2: false })

  // Upload file state per track
  const [uploadedTrack1, setUploadedTrack1] =
    useState<UploadedFileInfo | null>(null)
  const [uploadedTrack2, setUploadedTrack2] =
    useState<UploadedFileInfo | null>(null)
  const [uploadLoadingTrack, setUploadLoadingTrack] = useState<1 | 2 | null>(
    null
  )
  const fileInputRef1 = useRef<HTMLInputElement>(null)
  const fileInputRef2 = useRef<HTMLInputElement>(null)

  // Track previous video ID to detect changes
  const previousVideoIdRef = useRef<string | null>(null)
  const [sessionLoadedTracks, setSessionLoadedTracks] = useState<{
    track1: boolean
    track2: boolean
  }>({ track1: false, track2: false })

  // Load saved selections when video ID changes
  useEffect(() => {
    if (!currentVideoId) return

    const loadSavedSelections = async () => {
      try {
        const result = await chrome.storage.local.get([
          `subtitle1_${currentVideoId}`,
          `subtitle2_${currentVideoId}`,
          `subtitlesSessionLoaded_${currentVideoId}`,
          `uploadedSubtitle_${currentVideoId}_track1`,
          `uploadedSubtitle_${currentVideoId}_track2`
        ])

        const savedSubtitle1 = result[`subtitle1_${currentVideoId}`]
        const savedSubtitle2 = result[`subtitle2_${currentVideoId}`]
        const sessionLoaded = result[
          `subtitlesSessionLoaded_${currentVideoId}`
        ] || {
          track1: false,
          track2: false
        }
        const savedUpload1 =
          result[`uploadedSubtitle_${currentVideoId}_track1`]
        const savedUpload2 =
          result[`uploadedSubtitle_${currentVideoId}_track2`]

        if (savedSubtitle1) {
          setSelectedSubtitle1(savedSubtitle1)
        }
        if (savedSubtitle2) {
          setSelectedSubtitle2(savedSubtitle2)
        }
        if (savedUpload1) setUploadedTrack1(savedUpload1)
        if (savedUpload2) setUploadedTrack2(savedUpload2)

        // Set session loaded state and subtitles loaded state
        setSessionLoadedTracks(sessionLoaded)
        setSubtitlesLoaded(sessionLoaded)
      } catch (error) {
        console.error("Error loading saved selections:", error)
      }
    }

    loadSavedSelections()
  }, [currentVideoId])

  // Save selections to storage
  const saveSelection = async (trackNumber: 1 | 2, url: string | null) => {
    if (!currentVideoId) return

    try {
      const key = `subtitle${trackNumber}_${currentVideoId}`
      console.log(
        `[SubtitlesSection] Saving track ${trackNumber} to storage:`,
        { key, url }
      )
      if (url) {
        await chrome.storage.local.set({ [key]: url })
      } else {
        await chrome.storage.local.remove(key)
      }
    } catch (error) {
      console.error("Error saving selection:", error)
    }
  }

  // Function to send subtitle URL to content script
  const loadSubtitleInContentScript = async (
    url: string,
    trackNumber: 1 | 2
  ) => {
    try {
      setLoadingStatus(`Loading subtitle ${trackNumber}...`)

      // Get active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (!tab.id) {
        throw new Error("No active tab found")
      }

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "loadSubtitle",
        url: url,
        trackNumber: trackNumber
      })

      if (response.success) {
        setLoadingStatus(`Subtitle ${trackNumber} loaded successfully!`)
        setSubtitlesLoaded((prev) => ({
          ...prev,
          [`track${trackNumber}`]: true
        }))

        // Mark that subtitles have been loaded for this session
        if (currentVideoId) {
          const newSessionState = {
            ...sessionLoadedTracks,
            [`track${trackNumber}`]: true
          }
          setSessionLoadedTracks(newSessionState)
          await chrome.storage.local.set({
            [`subtitlesSessionLoaded_${currentVideoId}`]: newSessionState
          })
        }

        setTimeout(() => setLoadingStatus(""), 3000)
      } else {
        throw new Error(response.error || "Failed to load subtitle")
      }
    } catch (error) {
      console.error("Error loading subtitle:", error)
      setLoadingStatus(
        `Error loading subtitle ${trackNumber}: ${error.message}`
      )
      setTimeout(() => setLoadingStatus(""), 5000)
    }
  }

  // Handle changing Subtitle 1 selection - ONLY load if user actively changes it
  const handleSubtitle1Change = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const url = event.target.value || null
    const previousSelection = selectedSubtitle1

    console.log(`[SubtitlesSection] Track 1 selection:`, {
      url,
      previous: url === previousSelection
    })
    setSelectedSubtitle1(url)
    await saveSelection(1, url)

    // Only load subtitle if user actually changed the selection (not just loading saved state)
    if (url && url !== previousSelection) {
      await loadSubtitleInContentScript(url, 1)
    } else if (!url) {
      // Reset loaded status when clearing selection
      setSubtitlesLoaded((prev) => ({ ...prev, track1: false }))
      // Clear session state
      if (currentVideoId) {
        const newSessionState = { ...sessionLoadedTracks, track1: false }
        setSessionLoadedTracks(newSessionState)
        await chrome.storage.local.set({
          [`subtitlesSessionLoaded_${currentVideoId}`]: newSessionState
        })
      }
    }
  }

  // Handle changing Subtitle 2 selection - ONLY load if user actively changes it
  const handleSubtitle2Change = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const url = event.target.value || null
    const previousSelection = selectedSubtitle2

    setSelectedSubtitle2(url)
    await saveSelection(2, url)

    // Only load subtitle if user actually changed the selection (not just loading saved state)
    if (url && url !== previousSelection) {
      await loadSubtitleInContentScript(url, 2)
    } else if (!url) {
      // Reset loaded status when clearing selection
      setSubtitlesLoaded((prev) => ({ ...prev, track2: false }))
      // Clear session state
      if (currentVideoId) {
        const newSessionState = { ...sessionLoadedTracks, track2: false }
        setSessionLoadedTracks(newSessionState)
        await chrome.storage.local.set({
          [`subtitlesSessionLoaded_${currentVideoId}`]: newSessionState
        })
      }
    }
  }

  // Upload file for a specific track
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    trackNumber: 1 | 2
  ) => {
    const file = event.target.files?.[0]
    if (!file || !currentVideoId) return

    setUploadLoadingTrack(trackNumber)

    try {
      setLoadingStatus(`Parsing uploaded file for track ${trackNumber}...`)
      const text = await file.text()
      const cues = parseSubtitleText(text, file.name)

      if (cues.length === 0) {
        setLoadingStatus("Could not parse subtitle file")
        setTimeout(() => setLoadingStatus(""), 3000)
        return
      }

      const format: "vtt" | "srt" | "ass" = file.name
        .toLowerCase()
        .endsWith(".vtt")
        ? "vtt"
        : file.name.toLowerCase().endsWith(".ass")
          ? "ass"
          : "srt"

      const fileInfo: UploadedFileInfo = {
        fileName: file.name,
        cues,
        format,
        uploadedAt: Date.now(),
        timeOffset: 0
      }

      const key = `uploadedSubtitle_${currentVideoId}_track${trackNumber}`
      await chrome.storage.local.set({ [key]: fileInfo })

      if (trackNumber === 1) {
        setUploadedTrack1(fileInfo)
        setSelectedSubtitle1(null)
        await saveSelection(1, null)
      } else {
        setUploadedTrack2(fileInfo)
        setSelectedSubtitle2(null)
        await saveSelection(2, null)
      }

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })
      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          action: "loadUserSubtitle",
          trackNumber,
          cues: applyTimeOffset(cues, fileInfo.timeOffset)
        })
      }

      setLoadingStatus(
        `Loaded ${cues.length} cues to track ${trackNumber}`
      )
      setSubtitlesLoaded((prev) => ({
        ...prev,
        [`track${trackNumber}`]: true
      }))
      setTimeout(() => setLoadingStatus(""), 3000)
    } catch (err: any) {
      setLoadingStatus(`Upload error: ${err.message}`)
      setTimeout(() => setLoadingStatus(""), 5000)
    } finally {
      setUploadLoadingTrack(null)
      if (trackNumber === 1 && fileInputRef1.current)
        fileInputRef1.current.value = ""
      if (trackNumber === 2 && fileInputRef2.current)
        fileInputRef2.current.value = ""
    }
  }

  // Clear uploaded file for a track
  const clearUploadedFile = async (trackNumber: 1 | 2) => {
    if (!currentVideoId) return

    const key = `uploadedSubtitle_${currentVideoId}_track${trackNumber}`
    await chrome.storage.local.remove(key)

    if (trackNumber === 1) setUploadedTrack1(null)
    else setUploadedTrack2(null)

    setSubtitlesLoaded((prev) => ({
      ...prev,
      [`track${trackNumber}`]: false
    }))

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    })
    if (tab.id) {
      await chrome.tabs.sendMessage(tab.id, {
        action: "clearUserSubtitle",
        trackNumber
      })
    }
  }

  // Adjust time offset for an uploaded file
  const adjustUploadOffset = async (
    trackNumber: 1 | 2,
    delta: number
  ) => {
    if (!currentVideoId) return
    const current =
      trackNumber === 1 ? uploadedTrack1 : uploadedTrack2
    if (!current) return

    const updated: UploadedFileInfo = {
      ...current,
      timeOffset: current.timeOffset + delta
    }

    const key = `uploadedSubtitle_${currentVideoId}_track${trackNumber}`
    await chrome.storage.local.set({ [key]: updated })

    if (trackNumber === 1) setUploadedTrack1(updated)
    else setUploadedTrack2(updated)

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    })
    if (tab.id) {
      await chrome.tabs.sendMessage(tab.id, {
        action: "loadUserSubtitle",
        trackNumber,
        cues: applyTimeOffset(updated.cues, updated.timeOffset)
      })
    }
  }

  // Clear all selections
  const clearAllSelections = async () => {
    setSelectedSubtitle1(null)
    setSelectedSubtitle2(null)
    setSessionLoadedTracks({ track1: false, track2: false })
    setSubtitlesLoaded({ track1: false, track2: false })
    setUploadedTrack1(null)
    setUploadedTrack2(null)
    await saveSelection(1, null)
    await saveSelection(2, null)

    if (currentVideoId) {
      await chrome.storage.local.remove([
        `subtitlesSessionLoaded_${currentVideoId}`,
        `uploadedSubtitle_${currentVideoId}_track1`,
        `uploadedSubtitle_${currentVideoId}_track2`
      ])
    }
  }

  // Reset session loaded status when video changes
  useEffect(() => {
    const hasVideoIdChanged = previousVideoIdRef.current !== currentVideoId
    previousVideoIdRef.current = currentVideoId

    if (hasVideoIdChanged) {
      setSessionLoadedTracks({ track1: false, track2: false })
      setSubtitlesLoaded({ track1: false, track2: false })
      setUploadedTrack1(null)
      setUploadedTrack2(null)
    }
  }, [currentVideoId])

  // Function to get all subtitle URLs for a language
  const getSubtitleOptions = (langCode: string) => {
    const langSubtitles = subtitles[langCode] || []
    return langSubtitles
  }

  // Function to get display name for a language code
  const getLanguageName = (langCode: string) => {
    const names: Record<string, string> = {
      ja: "Japanese",
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
      ko: "Korean",
      zh: "Chinese",
      ar: "Arabic",
      hi: "Hindi",
      th: "Thai",
      vi: "Vietnamese"
    }
    return names[langCode] || langCode.toUpperCase()
  }

  // Function to get display name for a format number
  const getFormatName = (formatNum: number) => {
    return `Format ${formatNum + 1}`
  }

  const isJapaneseLang = (langCode: string) =>
    langCode.toLowerCase().startsWith("ja")

  // Track selection is fixed to Japanese. Track 2 is open to all languages,
  // but English is listed first.
  const japaneseEntries = Object.entries(subtitles).filter(([langCode]) =>
    isJapaneseLang(langCode)
  )
  const track2Entries = Object.entries(subtitles).sort(([a], [b]) => {
    const aIsEn = a.toLowerCase().startsWith("en") ? 0 : 1
    const bIsEn = b.toLowerCase().startsWith("en") ? 0 : 1
    return aIsEn - bIsEn
  })

  return (
    <div className="mt-4">
      <h3 className="text-black font-bold">Available Subtitles</h3>

      {subtitleLoading && (
        <p className="text-xs text-gray-800">Loading subtitles...</p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {loadingStatus && (
        <p
          className={`text-xs ${loadingStatus.includes("Error") || loadingStatus.includes("error") ? "text-red-700" : "text-green-700"}`}>
          {loadingStatus}
        </p>
      )}

      <div className="text-xs mt-2">
        {/* Dropdown for Subtitle 1 */}
        <div className="mb-4">
          <label className="font-semibold text-black block">
            Subtitle 1 (Top)
          </label>
          {subtitles && Object.keys(subtitles).length > 0 ? (
            <div className="flex items-center gap-1">
              <select
                className="flex-1 p-2 border border-gray-300 rounded-md text-sm"
                value={selectedSubtitle1 || ""}
                onChange={handleSubtitle1Change}
                disabled={!!uploadedTrack1}>
                <option value="">{japaneseEntries.length > 0 ? "Select Subtitle" : "No Japanese subtitles"}</option>
                {japaneseEntries.map(([langCode, urls]) =>
                  urls.map((url, index) => (
                    <option key={`${langCode}-${index}`} value={url}>
                      {getLanguageName(langCode)} -{" "}
                      {getFormatName(index + 1)}
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={() => fileInputRef1.current?.click()}
                disabled={uploadLoadingTrack === 1}
                className="px-2 py-2 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:bg-gray-400 whitespace-nowrap">
                +Upload
              </button>
              <input
                ref={fileInputRef1}
                type="file"
                accept=".vtt,.srt,.ass"
                onChange={(e) => handleFileUpload(e, 1)}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p className="flex-1 p-2 border border-gray-200 rounded text-gray-400 text-sm">
                No API subtitles available
              </p>
              <button
                onClick={() => fileInputRef1.current?.click()}
                disabled={uploadLoadingTrack === 1}
                className="px-2 py-2 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:bg-gray-400 whitespace-nowrap">
                +Upload
              </button>
              <input
                ref={fileInputRef1}
                type="file"
                accept=".vtt,.srt,.ass"
                onChange={(e) => handleFileUpload(e, 1)}
                style={{ display: "none" }}
              />
            </div>
          )}

          {/* Uploaded file info for track 1 */}
          {uploadedTrack1 && (
            <div className="mt-1 p-2 bg-green-50 rounded border border-green-300">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-green-800 text-xs">
                  {uploadedTrack1.fileName}
                </span>
                <span className="text-green-600 whitespace-nowrap text-xs">
                  {uploadedTrack1.cues.length} cues
                </span>
                <button
                  onClick={() => clearUploadedFile(1)}
                  className="px-2 py-0.5 bg-red-400 text-white rounded text-xs hover:bg-red-500">
                  X
                </button>
              </div>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <button
                  onClick={() => adjustUploadOffset(1, -0.5)}
                  className="w-12 h-10 bg-red-500 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>«</span>
                  <span className="text-[10px]">-0.5</span>
                </button>
                <button
                  onClick={() => adjustUploadOffset(1, -0.1)}
                  style={{ backgroundColor: "#f97316" }}
                  className="w-12 h-10 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>‹</span>
                  <span className="text-[10px]">-0.1</span>
                </button>
                <span className="text-[10px] text-gray-500 mx-0.5">
                  {uploadedTrack1.timeOffset.toFixed(1)}s
                </span>
                <button
                  onClick={() => adjustUploadOffset(1, 0.1)}
                  className="w-12 h-10 bg-green-500 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>›</span>
                  <span className="text-[10px]">+0.1</span>
                </button>
                <button
                  onClick={() => adjustUploadOffset(1, 0.5)}
                  className="w-12 h-10 bg-green-600 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>»</span>
                  <span className="text-[10px]">+0.5</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dropdown for Subtitle 2 */}
        <div className="mb-4">
          <label className="font-semibold text-black block">
            Subtitle 2 (Bottom)
          </label>
          {subtitles && Object.keys(subtitles).length > 0 ? (
            <div className="flex items-center gap-1">
              <select
                className="flex-1 p-2 border border-gray-300 rounded-md text-sm"
                value={selectedSubtitle2 || ""}
                onChange={handleSubtitle2Change}
                disabled={!!uploadedTrack2}>
                <option value="">Select Subtitle</option>
                {track2Entries.map(([langCode, urls]) =>
                  urls.map((url, index) => (
                    <option key={`${langCode}-${index}`} value={url}>
                      {getLanguageName(langCode)} -{" "}
                      {getFormatName(index + 1)}
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={() => fileInputRef2.current?.click()}
                disabled={uploadLoadingTrack === 2}
                className="px-2 py-2 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:bg-gray-400 whitespace-nowrap">
                +Upload
              </button>
              <input
                ref={fileInputRef2}
                type="file"
                accept=".vtt,.srt,.ass"
                onChange={(e) => handleFileUpload(e, 2)}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p className="flex-1 p-2 border border-gray-200 rounded text-gray-400 text-sm">
                No API subtitles available
              </p>
              <button
                onClick={() => fileInputRef2.current?.click()}
                disabled={uploadLoadingTrack === 2}
                className="px-2 py-2 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:bg-gray-400 whitespace-nowrap">
                +Upload
              </button>
              <input
                ref={fileInputRef2}
                type="file"
                accept=".vtt,.srt,.ass"
                onChange={(e) => handleFileUpload(e, 2)}
                style={{ display: "none" }}
              />
            </div>
          )}

          {/* Uploaded file info for track 2 */}
          {uploadedTrack2 && (
            <div className="mt-1 p-2 bg-green-50 rounded border border-green-300">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-green-800 text-xs">
                  {uploadedTrack2.fileName}
                </span>
                <span className="text-green-600 whitespace-nowrap text-xs">
                  {uploadedTrack2.cues.length} cues
                </span>
                <button
                  onClick={() => clearUploadedFile(2)}
                  className="px-2 py-0.5 bg-red-400 text-white rounded text-xs hover:bg-red-500">
                  X
                </button>
              </div>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <button
                  onClick={() => adjustUploadOffset(2, -0.5)}
                  className="w-12 h-10 bg-red-500 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>«</span>
                  <span className="text-[10px]">-0.5</span>
                </button>
                <button
                  onClick={() => adjustUploadOffset(2, -0.1)}
                  style={{ backgroundColor: "#f97316" }}
                  className="w-12 h-10 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>‹</span>
                  <span className="text-[10px]">-0.1</span>
                </button>
                <span className="text-[10px] text-gray-500 mx-0.5">
                  {uploadedTrack2.timeOffset.toFixed(1)}s
                </span>
                <button
                  onClick={() => adjustUploadOffset(2, 0.1)}
                  className="w-12 h-10 bg-green-500 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>›</span>
                  <span className="text-[10px]">+0.1</span>
                </button>
                <button
                  onClick={() => adjustUploadOffset(2, 0.5)}
                  className="w-12 h-10 bg-green-600 text-white text-xs rounded font-bold flex flex-col items-center justify-center leading-tight">
                  <span>»</span>
                  <span className="text-[10px]">+0.5</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={clearAllSelections}
            className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600">
            Clear All
          </button>
          <button
            onClick={() => {
              if (selectedSubtitle1)
                loadSubtitleInContentScript(selectedSubtitle1, 1)
              if (selectedSubtitle2)
                loadSubtitleInContentScript(selectedSubtitle2, 2)
            }}
            className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
            disabled={!selectedSubtitle1 && !selectedSubtitle2}>
            Reload Subtitles
          </button>
        </div>

        {/* Display selected subtitles */}
        <div className="mt-4 p-3 bg-gray-100 rounded">
          <h4 className="text-black font-semibold mb-2">
            Currently Selected
          </h4>
          <div className="space-y-1">
            <p className="text-xs">
              <strong>Top Subtitle: </strong>
              {uploadedTrack1 ? (
                <span className="text-green-600">
                  {uploadedTrack1.fileName} ✓
                </span>
              ) : selectedSubtitle1 ? (
                <span className="text-green-600">
                  {Object.entries(subtitles)
                    .find(([langCode, urls]) =>
                      urls.includes(selectedSubtitle1)
                    )?.[0]
                    ?.toUpperCase() || "Selected"}
                  {subtitlesLoaded.track1 && (
                    <span className="ml-1 text-xs">✓</span>
                  )}
                </span>
              ) : (
                <span className="text-gray-500">None selected</span>
              )}
            </p>
            <p className="text-xs">
              <strong>Bottom Subtitle: </strong>
              {uploadedTrack2 ? (
                <span className="text-green-600">
                  {uploadedTrack2.fileName} ✓
                </span>
              ) : selectedSubtitle2 ? (
                <span className="text-green-600">
                  {Object.entries(subtitles)
                    .find(([langCode, urls]) =>
                      urls.includes(selectedSubtitle2)
                    )?.[0]
                    ?.toUpperCase() || "Selected"}
                  {subtitlesLoaded.track2 && (
                    <span className="ml-1 text-xs">✓</span>
                  )}
                </span>
              ) : (
                <span className="text-gray-500">None selected</span>
              )}
            </p>
          </div>
          {currentVideoId && (
            <p className="text-xs text-gray-500 mt-1">
              Saved for video: {currentVideoId}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default SubtitlesSection
