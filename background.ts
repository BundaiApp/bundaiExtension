import { ApolloClient, InMemoryCache } from "@apollo/client"

import { ADD_FLASH_CARD_MUTATION } from "./graphql/mutations/addFlashCard.mutation"
import { storage, storageReady } from "./utils/secure-storage"

export {}
const DROPLET_SERVER_ADDRESS = "https://api.bundai.app/graphql"
const LOCAL_ADDRESS = "http://localhost:3000/graphql"
console.log(
  "Live now; make now always the most precious time. Now will never come again."
)
// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "addFlashCard") {
    handleAddFlashCard(message.data)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }))

    return true // Keep message channel open for async response
  }

  if (message.action === "getExtensionState") {
    // Handle extension state requests
    chrome.storage.local.get(["extensionEnabled"], (result) => {
      sendResponse({ enabled: result.extensionEnabled || false })
    })
    return true
  }

  if (message.action === "setExtensionEnabled") {
    // Handle extension enable/disable
    chrome.storage.local.set({ extensionEnabled: message.enabled }, () => {
      sendResponse({ success: true })
    })
    return true
  }
})

async function handleAddFlashCard(flashCardData) {
  const { userId, kanjiName, hiragana, meanings, quizAnswers } = flashCardData

  try {
    // Get authentication token from storage
    await storageReady
    const token = await storage.get("token")

    if (!token) {
      throw new Error("Authentication token not found")
    }

    // Create a new client instance with auth headers for this request
    const authenticatedClient = new ApolloClient({
      // uri: DROPLET_SERVER_ADDRESS,
      uri: LOCAL_ADDRESS,
      cache: new InMemoryCache({
        dataIdFromObject: (o) => (o.id != null ? String(o.id) : undefined)
      }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    })

    const result = await authenticatedClient.mutate({
      mutation: ADD_FLASH_CARD_MUTATION,
      variables: {
        userId,
        kanjiName,
        hiragana,
        meanings,
        quizAnswers
      }
    })

    console.log("Background script: Flashcard added successfully", result.data)
    return result.data
  } catch (error) {
    console.error("Background script addFlashCard error:", error)

    // If GraphQL fails, try direct fetch as fallback
    try {
      return await handleAddFlashCardDirect(flashCardData)
    } catch (directError) {
      console.error("Direct fetch fallback also failed:", directError)
      throw error // Throw the original GraphQL error
    }
  }
}

// Fallback direct fetch method
async function handleAddFlashCardDirect(flashCardData) {
  const { userId, kanjiName, hiragana, meanings, quizAnswers } = flashCardData

  await storageReady
  const token = await storage.get("token")

  if (!token) {
    throw new Error("Authentication token not found")
  }

  const response = await fetch(LOCAL_ADDRESS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      query: `
        mutation AddFlashCard($userId: ID!, $kanjiName: String!, $hiragana: String!, $meanings: [String!]!, $quizAnswers: [String!]!) {
          addFlashCard(userId: $userId, kanjiName: $kanjiName, hiragana: $hiragana, meanings: $meanings, quizAnswers: $quizAnswers) {
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
        quizAnswers
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

// Extension installation/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("Bundai Extension installed/updated")

  // Set default extension state
  chrome.storage.local.set({ extensionEnabled: true })
})

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log("Bundai Extension started")
})

// Handle extension icon click (if you have a popup)
chrome.action.onClicked.addListener((tab) => {
  // Optional: Handle extension icon click
  console.log("Extension icon clicked on tab:", tab.url)
})
