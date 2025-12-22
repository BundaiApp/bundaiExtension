import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ADD_FLASH_CARD_MUTATION } from "./graphql/mutations/addFlashCard.mutation"
import { storage, storageReady } from "./utils/secure-storage"

export {}

const DROPLET_SERVER_ADDRESS = "https://api.bundai.app/graphql"
const LOCAL_ADDRESS = "http://localhost:3000/graphql"

console.log("Live now; make now always the most precious time. Now will never come again.")

// ===== CENTRALIZED STATE MANAGEMENT =====
interface WordCardStyles {
  backgroundColor: string
  textColor: string
  fontSize: number
  borderRadius: number
  borderColor: string
  wordFontSize: number
}

interface ExtensionState {
  extensionEnabled: boolean
  universalReaderEnabled: boolean  // true = reader mode, false = API mode
  wordCardStyles: WordCardStyles
}

const defaultWordCardStyles: WordCardStyles = {
  backgroundColor: "#fde047",
  textColor: "#000000",
  fontSize: 18,
  borderRadius: 24,
  borderColor: "#a16207",
  wordFontSize: 48
}

let extensionState: ExtensionState = {
  extensionEnabled: true,
  universalReaderEnabled: true,  // Default to reader mode
  wordCardStyles: { ...defaultWordCardStyles }
}

// Track if state has been initialized from storage
let stateInitialized = false
let stateInitPromise: Promise<void> | null = null

// Initialize state from storage on startup
async function initializeState() {
  if (stateInitialized) return

  try {
    await storageReady

    // Load extensionEnabled
    const enabledValue = await storage.get("extensionEnabled")
    extensionState.extensionEnabled = typeof enabledValue === "boolean" ? enabledValue : true

    // Load universalReaderEnabled (true = reader mode, false = API mode)
    const readerValue = await storage.get("universalReaderEnabled")
    extensionState.universalReaderEnabled = typeof readerValue === "boolean" ? readerValue : true

    // Load wordCardStyles
    const stylesValue = await storage.get("wordCardStyles")
    extensionState.wordCardStyles = (stylesValue && typeof stylesValue === "object" && !Array.isArray(stylesValue))
      ? { ...defaultWordCardStyles, ...stylesValue as WordCardStyles }
      : { ...defaultWordCardStyles }

    stateInitialized = true
    console.log("[Background] State initialized:", extensionState)
  } catch (error) {
    console.error("[Background] Failed to initialize state:", error)
    stateInitialized = true // Mark as initialized even on error to avoid hanging
  }
}

// Ensure state is initialized before responding
async function ensureStateInitialized() {
  if (stateInitialized) return
  if (stateInitPromise) {
    await stateInitPromise
  } else {
    stateInitPromise = initializeState()
    await stateInitPromise
  }
}

// Broadcast state changes to all tabs
async function broadcastStateToAllTabs() {
  try {
    const allTabs = await chrome.tabs.query({})

    // Simple 2-mode logic: API mode (!reader) or Reader mode
    const isApiMode = !extensionState.universalReaderEnabled
    const isReaderMode = extensionState.universalReaderEnabled

    for (const tab of allTabs) {
      if (!tab.id) continue

      const isYouTube = tab.url?.includes("youtube.com")

      if (isYouTube) {
        // YouTube: API subtitle mode (custom-subtitles-container)
        chrome.tabs.sendMessage(tab.id, {
          action: "setExtensionEnabled",
          enabled: extensionState.extensionEnabled && isApiMode
        }).catch(() => {})

        // YouTube: reader only in Reader mode
        chrome.tabs.sendMessage(tab.id, {
          action: "setUniversalReaderEnabled",
          enabled: extensionState.extensionEnabled && isReaderMode
        }).catch(() => {})
      } else {
        // Non-YouTube: reader is always enabled (it's the only option)
        chrome.tabs.sendMessage(tab.id, {
          action: "setUniversalReaderEnabled",
          enabled: extensionState.extensionEnabled
        }).catch(() => {})
      }

      // Send wordCardStyles to all tabs
      chrome.tabs.sendMessage(tab.id, {
        action: "setWordCardStyles",
        styles: extensionState.wordCardStyles
      }).catch(() => {})
    }

    console.log("[Background] Broadcast state to", allTabs.length, "tabs")
  } catch (error) {
    console.error("[Background] Failed to broadcast state:", error)
  }
}

// ===== MESSAGE HANDLERS =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Flash card handling
  if (message.action === "addFlashCard") {
    handleAddFlashCard(message.data)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }))
    return true
  }

  // Extension enabled state
  if (message.action === "getExtensionState") {
    ensureStateInitialized().then(() => {
      sendResponse({ enabled: extensionState.extensionEnabled })
    })
    return true
  }

  if (message.action === "setExtensionEnabled") {
    ensureStateInitialized().then(() => {
      extensionState.extensionEnabled = message.enabled
      
      // Persist to storage
      storage.set("extensionEnabled", message.enabled).catch(console.error)
      
      // Broadcast to all tabs
      broadcastStateToAllTabs()
      
      sendResponse({ success: true })
    })
    return true
  }

  // Universal reader state
  if (message.action === "getUniversalReaderEnabled") {
    ensureStateInitialized().then(() => {
      sendResponse({ 
        universalReaderEnabled: extensionState.universalReaderEnabled,
        extensionEnabled: extensionState.extensionEnabled
      })
    })
    return true
  }

  if (message.action === "setUniversalReaderEnabled") {
    ensureStateInitialized().then(() => {
      extensionState.universalReaderEnabled = message.enabled
      
      // Persist to storage
      storage.set("universalReaderEnabled", message.enabled).catch(console.error)
      
      // Broadcast to all tabs
      broadcastStateToAllTabs()
      
      sendResponse({ success: true })
    })
    return true
  }

  // Subtitle mode (combined handler for popup)
  if (message.action === "setSubtitleMode") {
    ensureStateInitialized().then(() => {
      const { mode, universalReaderEnabled } = message

      extensionState.universalReaderEnabled = universalReaderEnabled

      // Persist to storage
      storage.set("universalReaderEnabled", universalReaderEnabled).catch(console.error)
      storage.set("subtitleMode", mode).catch(console.error)

      // Broadcast to all tabs
      broadcastStateToAllTabs()

      sendResponse({ success: true })
    })
    return true
  }

  // WordCard styles state
  if (message.action === "getWordCardStyles") {
    ensureStateInitialized().then(() => {
      sendResponse({ styles: extensionState.wordCardStyles })
    })
    return true
  }

  if (message.action === "setWordCardStyles") {
    ensureStateInitialized().then(() => {
      extensionState.wordCardStyles = { ...defaultWordCardStyles, ...message.styles }
      
      // Persist to storage
      storage.set("wordCardStyles", extensionState.wordCardStyles).catch(console.error)
      
      // Broadcast to all tabs
      broadcastStateToAllTabs()
      
      sendResponse({ success: true })
    })
    return true
  }

  return false
})

// ===== FLASH CARD HANDLERS =====
async function handleAddFlashCard(flashCardData) {
  console.log("[Background] handleAddFlashCard received:", flashCardData)
  const { userId, kanjiName, hiragana, meanings, quizAnswers, source } = flashCardData
  console.log("[Background] Extracted source:", source)

  try {
    await storageReady
    const token = await storage.get("token")

    if (!token) {
      throw new Error("Authentication token not found")
    }

    const authenticatedClient = new ApolloClient({
      uri: DROPLET_SERVER_ADDRESS,
      cache: new InMemoryCache({
        dataIdFromObject: (o) => (o.id != null ? String(o.id) : undefined)
      }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    })

    const variables = {
      userId,
      kanjiName,
      hiragana,
      meanings,
      quizAnswers,
      source: source || "extension"
    }
    console.log("[Background] Apollo mutation variables:", variables)
    
    const result = await authenticatedClient.mutate({
      mutation: ADD_FLASH_CARD_MUTATION,
      variables
    })

    console.log("Background script: Flashcard added successfully", result.data)
    return result.data
  } catch (error) {
    console.error("Background script addFlashCard error:", error)

    try {
      return await handleAddFlashCardDirect(flashCardData)
    } catch (directError) {
      console.error("Direct fetch fallback also failed:", directError)
      throw error
    }
  }
}

async function handleAddFlashCardDirect(flashCardData) {
  const { userId, kanjiName, hiragana, meanings, quizAnswers, source } = flashCardData

  await storageReady
  const token = await storage.get("token")

  if (!token) {
    throw new Error("Authentication token not found")
  }

  const response = await fetch(DROPLET_SERVER_ADDRESS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        mutation AddFlashCard($userId: ID!, $kanjiName: String!, $hiragana: String!, $meanings: [String!]!, $quizAnswers: [String!]!, $source: String) {
          addFlashCard(userId: $userId, kanjiName: $kanjiName, hiragana: $hiragana, meanings: $meanings, quizAnswers: $quizAnswers, source: $source) {
            _id
            kanjiName
            hiragana
            meanings
            quizAnswers
          }
        }
      `,
      variables: {
        userId,
        kanjiName,
        hiragana,
        meanings,
        quizAnswers,
        source: source || "extension"
      }
    })
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const result = await response.json()

  if (result.errors) {
    throw new Error(result.errors[0].message)
  }

  console.log("Background script: Direct fetch successful", result.data)
  return result.data.addFlashCard
}

// ===== LIFECYCLE HANDLERS =====
chrome.runtime.onInstalled.addListener(() => {
  console.log("Bundai Extension installed/updated")
  initializeState()
})

chrome.runtime.onStartup.addListener(() => {
  console.log("Bundai Extension started")
  initializeState()
})

chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked on tab:", tab.url)
})

// Listen for tab updates to broadcast state when content scripts load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // When any page finishes loading, broadcast current state
  if (changeInfo.status === 'complete' && tab.url) {
    const isYouTube = tab.url.includes('youtube.com')

    // Simple 2-mode logic: API mode (!reader) or Reader mode
    const isApiMode = !extensionState.universalReaderEnabled
    const isReaderMode = extensionState.universalReaderEnabled

    console.log("[Background] Tab loaded, broadcasting state. YouTube:", isYouTube, "API:", isApiMode, "Reader:", isReaderMode)

    // Small delay to ensure content scripts are ready
    setTimeout(() => {
      if (isYouTube) {
        // YouTube: API subtitle mode (custom-subtitles-container)
        chrome.tabs.sendMessage(tabId, {
          action: "setExtensionEnabled",
          enabled: extensionState.extensionEnabled && isApiMode
        }).catch(() => {})

        // YouTube: reader only in Reader mode
        chrome.tabs.sendMessage(tabId, {
          action: "setUniversalReaderEnabled",
          enabled: extensionState.extensionEnabled && isReaderMode
        }).catch(() => {})
      } else {
        // Non-YouTube: reader is always enabled (it's the only option)
        chrome.tabs.sendMessage(tabId, {
          action: "setUniversalReaderEnabled",
          enabled: extensionState.extensionEnabled
        }).catch(() => {})
      }

      // WordCard styles for all tabs
      chrome.tabs.sendMessage(tabId, {
        action: "setWordCardStyles",
        styles: extensionState.wordCardStyles
      }).catch(() => {})
    }, 500)
  }
})

// Initialize state immediately
stateInitPromise = initializeState()
stateInitPromise.then(() => {
  console.log("[Background] Ready to serve requests")
})
