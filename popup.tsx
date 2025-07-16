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
    <div className="w-72 p-4 bg-white shadow flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-800">Extension Toggle</h1>
      <div className="flex items-center gap-3">
        <span className="text-gray-700 font-medium">Disabled</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={handleToggle}
            disabled={loading}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:bg-blue-500 transition-all"></div>
          <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
        </label>
        <span className="text-gray-700 font-medium">Enabled</span>
      </div>
      <div className="text-gray-500 text-sm mt-2">
        The extension is <span className={enabled ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{enabled ? "Enabled" : "Disabled"}</span>.
      </div>
    </div>
  )
}

export default IndexPopup
