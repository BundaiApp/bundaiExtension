import { useState, useEffect } from "react"
import "./style.css"

function IndexPopup() {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  // Load the enabled state from chrome.storage.local on mount
  useEffect(() => {
    chrome.storage.local.get(["extensionEnabled"], (result) => {
      setEnabled(result.extensionEnabled !== false) // default to true
      setLoading(false)
    })
  }, [])

  // Handle toggle change
  const handleToggle = (e) => {
    const newValue = e.target.checked
    setEnabled(newValue)
    chrome.storage.local.set({ extensionEnabled: newValue })
  }

  return (
    <div className="w-72 p-4 bg-yellow-400 text-black flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-black border-b-2 pb-1">
        <h1 className="text-xl font-extrabold text-black">Bundai</h1>
        <h2 className="text-xs text-black opacity-80">A Japanese learning browser extension</h2>
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
        The extension is <span className={enabled ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>{enabled ? "Enabled" : "Disabled"}</span>.
      </div>
      <div className="text-black text-xs mt-1 opacity-70">
        To completely turn off the extension, disable it from <span className="underline">browser://extensions</span>.
      </div>
    </div>
  )
}

export default IndexPopup
