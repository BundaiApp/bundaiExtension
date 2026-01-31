import { ApolloClient, InMemoryCache } from "@apollo/client"

import { ADD_FLASH_CARD_MUTATION } from "./graphql/mutations/addFlashCard.mutation"
import { storage, storageReady } from "./utils/secure-storage"

export {}

const DROPLET_SERVER_ADDRESS = "https://api.bundai.app/graphql"

console.log(
  "Live now; make now always the most precious time. Now will never come again."
)

// ===== CENTRALIZED STATE MANAGEMENT =====
interface WordCardStyles {
  backgroundColor: string
  textColor: string
  fontSize: number
  borderRadius: number
  borderColor: string
  wordFontSize: number
}

interface SubtitleContainerStyles {
  backgroundColor: string
  textColor: string
  fontSize: number
  opacity: number
  borderRadius: number
  verticalPosition: number
}

interface ExtensionState {
  extensionEnabled: boolean
  subtitleMode: "api" | "user"
  wordCardStyles: WordCardStyles
  subtitleContainerStyles: SubtitleContainerStyles
}

const defaultWordCardStyles: WordCardStyles = {
  backgroundColor: "#fde047",
  textColor: "#000000",
  fontSize: 18,
  borderRadius: 24,
  borderColor: "#a16207",
  wordFontSize: 48
}

const defaultSubtitleContainerStyles: SubtitleContainerStyles = {
  backgroundColor: "#000000",
  textColor: "#ffffff",
  fontSize: 50,
  opacity: 0.9,
  borderRadius: 8,
  verticalPosition: 10
}

let extensionState: ExtensionState = {
  extensionEnabled: true,
  subtitleMode: "user",
  wordCardStyles: { ...defaultWordCardStyles },
  subtitleContainerStyles: { ...defaultSubtitleContainerStyles }
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
    extensionState.extensionEnabled =
      typeof enabledValue === "boolean" ? enabledValue : true

    // Load subtitleMode
    const modeValue = await storage.get("subtitleMode")
    extensionState.subtitleMode =
      modeValue && ["api", "user"].includes(modeValue as string)
        ? (modeValue as "api" | "user")
        : "user"

    // Load wordCardStyles
    const stylesValue = await storage.get("wordCardStyles")
    extensionState.wordCardStyles =
      stylesValue && typeof stylesValue === "object"
        ? { ...defaultWordCardStyles, ...stylesValue }
        : { ...defaultWordCardStyles }

    // Load subtitleContainerStyles
    const subtitleStylesValue = await storage.get("subtitleContainerStyles")
    extensionState.subtitleContainerStyles =
      subtitleStylesValue && typeof subtitleStylesValue === "object"
        ? { ...defaultSubtitleContainerStyles, ...subtitleStylesValue }
        : { ...defaultSubtitleContainerStyles }

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
    const tabs = await chrome.tabs.query({})

    for (const tab of tabs) {
      if (!tab.id) continue

      // Send to custom subtitle container (always enabled if extension is enabled)
      chrome.tabs
        .sendMessage(tab.id, {
          action: "setExtensionEnabled",
          enabled: extensionState.extensionEnabled
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })

      // Send wordCardStyles
      chrome.tabs
        .sendMessage(tab.id, {
          action: "setWordCardStyles",
          styles: extensionState.wordCardStyles
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })

      // Send subtitleContainerStyles
      chrome.tabs
        .sendMessage(tab.id, {
          action: "setSubtitleContainerStyles",
          styles: extensionState.subtitleContainerStyles
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })
    }

    console.log("[Background] Broadcast state to", tabs.length, "tabs")
  } catch (error) {
    console.error("[Background] Failed to broadcast state:", error)
  }
}

// Broadcast subtitle mode change to all tabs
async function broadcastSubtitleModeToAllTabs(mode: "api" | "user") {
  try {
    const tabs = await chrome.tabs.query({})

    for (const tab of tabs) {
      if (!tab.id) continue

      // Send mode to custom subtitle container
      chrome.tabs
        .sendMessage(tab.id, {
          action: "setSubtitleMode",
          subtitleMode: mode
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })
    }

    console.log("[Background] Broadcast subtitle mode to", tabs.length, "tabs")
  } catch (error) {
    console.error("[Background] Failed to broadcast subtitle mode:", error)
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

  // Subtitle mode (api | user)
  if (message.action === "getSubtitleMode") {
    ensureStateInitialized().then(() => {
      sendResponse({ mode: extensionState.subtitleMode })
    })
    return true
  }

  if (message.action === "setSubtitleMode") {
    ensureStateInitialized().then(() => {
      const mode = message.subtitleMode as "api" | "user"
      if (["api", "user"].includes(mode)) {
        extensionState.subtitleMode = mode

        // Persist to storage
        storage.set("subtitleMode", mode).catch(console.error)

        // Broadcast to all tabs
        broadcastSubtitleModeToAllTabs(mode)

        sendResponse({ success: true })
      } else {
        sendResponse({ success: false, error: "Invalid mode" })
      }
    })
    return true
  }

  return false
})

// ===== FLASH CARD HANDLERS =====
async function handleAddFlashCard(flashCardData) {
  console.log("[Background] handleAddFlashCard received:", flashCardData)
  const { userId, kanjiName, hiragana, meanings, quizAnswers, source } =
    flashCardData
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
  const { userId, kanjiName, hiragana, meanings, quizAnswers, source } =
    flashCardData

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
  if (changeInfo.status === "complete" && tab.url) {
    console.log("[Background] Tab loaded, broadcasting state to:", tab.url)
    // Small delay to ensure content scripts are ready
    setTimeout(() => {
      chrome.tabs
        .sendMessage(tabId, {
          action: "setExtensionEnabled",
          enabled: extensionState.extensionEnabled
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })

      chrome.tabs
        .sendMessage(tabId, {
          action: "setSubtitleMode",
          subtitleMode: extensionState.subtitleMode
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })

      chrome.tabs
        .sendMessage(tabId, {
          action: "setWordCardStyles",
          styles: extensionState.wordCardStyles
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })

      chrome.tabs
        .sendMessage(tabId, {
          action: "setSubtitleContainerStyles",
          styles: extensionState.subtitleContainerStyles
        })
        .catch(() => {
          // Content script might not be loaded yet, ignore
        })
    }, 500)
  }
})

// Initialize state immediately
stateInitPromise = initializeState()
stateInitPromise.then(() => {
  console.log("[Background] Ready to serve requests")
})
