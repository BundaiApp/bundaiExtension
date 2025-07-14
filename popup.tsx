import { useState } from "react"
import "./style.css"

function IndexPopup() {
  const [data, setData] = useState("")

  return (
    <div className="w-72 p-4 bg-white shadow flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-800">Plasmo + Tailwind Demo</h1>
      <input
        className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        type="text"
        placeholder="Type something..."
        value={data}
        onChange={(e) => setData(e.target.value)}
      />
      <button
        className="bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600 transition"
        onClick={() => setData("")}
      >
        Clear
      </button>
      <div className="text-gray-700">
        <span className="font-medium">You typed:</span> {data || <span className="italic text-gray-400">Nothing yet</span>}
      </div>
      <a
        href="https://docs.plasmo.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline text-sm mt-2"
      >
        View Plasmo Docs
      </a>
    </div>
  )
}

export default IndexPopup
