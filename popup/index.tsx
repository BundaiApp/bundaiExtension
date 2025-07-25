import { useState, useEffect } from "react"
import Login from "./login"
import Register from "./register"
import "../style.css"
import { SecureStorage } from "@plasmohq/storage/secure"
import { ApolloProvider } from "@apollo/client"
import client from "~graphql"

function MainPage({ onLogout }) {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [secureReady, setSecureReady] = useState(false)
  const [secureStorage] = useState(() => new SecureStorage())
  useEffect(() => {
    secureStorage.setPassword("bundai-secure-key").then(() => setSecureReady(true))
  }, [secureStorage])
  useEffect(() => {
    if (!secureReady) return
    secureStorage.get("extensionEnabled").then((value) => {
      setEnabled(typeof value === "boolean" ? value : false)
      setLoading(false)
    })
  }, [secureReady, secureStorage])
  const handleToggle = (e) => {
    const newValue = e.target.checked
    setEnabled(newValue)
    secureStorage.set("extensionEnabled", newValue)
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
      <button onClick={onLogout} className="bg-black text-yellow-400 p-2 rounded font-bold mt-2">Logout</button>
    </div>
  )
}

function IndexPopup() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [secureReady, setSecureReady] = useState(false)
  const [secureStorage] = useState(() => new SecureStorage())
  const [showRegister, setShowRegister] = useState(false)
  useEffect(() => {
    secureStorage.setPassword("bundai-secure-key").then(() => setSecureReady(true))
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

const MainApp = ()=>(
  <ApolloProvider client={client}>
    <IndexPopup/>
  </ApolloProvider>
)

export default MainApp
