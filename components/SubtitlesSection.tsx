import { useEffect, useRef, useState } from "react"

interface SubtitlesSectionProps {
  subtitles: Record<string, string[]>
  subtitleLoading: boolean
  error: string | null
  currentVideoId: string | null
}

const SubtitlesSection: React.FC<SubtitlesSectionProps> = ({
  subtitles,
  subtitleLoading,
  error,
  currentVideoId
}) => {
  // States to store the selected subtitle URLs
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

  // Track the previous video ID to detect changes
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
          `subtitlesSessionLoaded_${currentVideoId}`
        ])

        const savedSubtitle1 = result[`subtitle1_${currentVideoId}`]
        const savedSubtitle2 = result[`subtitle2_${currentVideoId}`]
        const sessionLoaded = result[
          `subtitlesSessionLoaded_${currentVideoId}`
        ] || {
          track1: false,
          track2: false
        }

        if (savedSubtitle1) {
          setSelectedSubtitle1(savedSubtitle1)
        }
        if (savedSubtitle2) {
          setSelectedSubtitle2(savedSubtitle2)
        }

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

      // Get the active tab
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

  // Clear all selections
  const clearAllSelections = async () => {
    setSelectedSubtitle1(null)
    setSelectedSubtitle2(null)
    setSessionLoadedTracks({ track1: false, track2: false })
    setSubtitlesLoaded({ track1: false, track2: false })
    await saveSelection(1, null)
    await saveSelection(2, null)

    if (currentVideoId) {
      await chrome.storage.local.remove(
        `subtitlesSessionLoaded_${currentVideoId}`
      )
    }
  }

  // Reset session loaded status when video changes
  useEffect(() => {
    const hasVideoIdChanged = previousVideoIdRef.current !== currentVideoId
    previousVideoIdRef.current = currentVideoId

    if (hasVideoIdChanged) {
      setSessionLoadedTracks({ track1: false, track2: false })
      setSubtitlesLoaded({ track1: false, track2: false })
    }
  }, [currentVideoId])

  return (
    <div className="mt-4">
      <h3 className="text-black font-bold">Available Subtitles</h3>

      {subtitleLoading && (
        <p className="text-xs text-gray-800">Loading subtitles...</p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {loadingStatus && (
        <p
          className={`text-xs ${loadingStatus.includes("Error") ? "text-red-700" : "text-green-700"}`}>
          {loadingStatus}
        </p>
      )}

      {subtitles && Object.keys(subtitles).length > 0 ? (
        <div className="max-h-40 overflow-auto text-xs mt-2">
          {/* Dropdown for Subtitle 1 */}
          <div className="mb-4">
            <label className="font-semibold text-black block">
              Subtitle 1 (Top)
            </label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              value={selectedSubtitle1 || ""}
              onChange={handleSubtitle1Change}>
              <option value="">Select Subtitle</option>
              {Object.entries(subtitles).map(([lang, urls]) =>
                urls.map((url, index) => (
                  <option key={`${lang}-${index}`} value={url}>
                    {lang.toUpperCase()} - Format {index + 1}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Dropdown for Subtitle 2 */}
          <div className="mb-4">
            <label className="font-semibold text-black block">
              Subtitle 2 (Bottom)
            </label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              value={selectedSubtitle2 || ""}
              onChange={handleSubtitle2Change}>
              <option value="">Select Subtitle</option>
              {Object.entries(subtitles).map(([lang, urls]) =>
                urls.map((url, index) => (
                  <option key={`${lang}-${index}`} value={url}>
                    {lang.toUpperCase()} - Format {index + 1}
                  </option>
                ))
              )}
            </select>
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
                {selectedSubtitle1 ? (
                  <span className="text-green-600">
                    {Object.entries(subtitles)
                      .find(([lang, urls]) =>
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
                {selectedSubtitle2 ? (
                  <span className="text-green-600">
                    {Object.entries(subtitles)
                      .find(([lang, urls]) =>
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
      ) : (
        !subtitleLoading && (
          <p className="text-xs text-gray-800">No subtitles found.</p>
        )
      )}
    </div>
  )
}

export default SubtitlesSection
