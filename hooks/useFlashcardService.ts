// hooks/useFlashcardService.ts
import { useCallback, useState } from "react"

import { storage, storageReady } from "../utils/secure-storage"

interface FlashcardData {
  kanjiName: string
  hiragana: string
  meanings: string[]
  quizAnswers: string[]
}

interface UseFlashcardServiceReturn {
  addFlashcard: (data: FlashcardData) => Promise<void>
  isLoading: boolean
  error: string | null
  success: boolean
}

export const useFlashcardService = (): UseFlashcardServiceReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const addFlashcard = useCallback(async (data: FlashcardData) => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      await storageReady
      const userId = await storage.get("userId")

      if (!userId) {
        throw new Error("User not authenticated")
      }

      // Send message to background script or use direct approach
      const result = await sendFlashcardRequest({
        ...data,
        userId
      })

      setSuccess(true)
      console.log("Flashcard added successfully:", result)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to add flashcard"
      setError(errorMessage)
      console.error("Failed to add flashcard:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const sendFlashcardRequest = async (
    payload: FlashcardData & { userId: string }
  ) => {
    // Try background script first (for content scripts)
    if (typeof chrome !== "undefined" && chrome.runtime) {
      try {
        return await sendToBackground(payload)
      } catch (bgError) {
        console.warn("Background script method failed, trying direct:", bgError)
        // Fall back to direct method
      }
    }

    // Direct GraphQL request (for popup/options pages)
    return await sendDirectRequest(payload)
  }

  const sendToBackground = (
    payload: FlashcardData & { userId: string }
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "addFlashCard",
          data: payload
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (response?.success) {
            resolve(response.data)
          } else {
            reject(new Error(response?.error || "Unknown error"))
          }
        }
      )
    })
  }

  const sendDirectRequest = async (
    payload: FlashcardData & { userId: string }
  ) => {
    await storageReady
    const token = await storage.get("token")

    if (!token) {
      throw new Error("Authentication token not found")
    }

    // Replace with your actual GraphQL endpoint
    const response = await fetch(
      process.env.PLASMO_PUBLIC_GRAPHQL_ENDPOINT || "YOUR_GRAPHQL_ENDPOINT",
      {
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
          variables: payload
        })
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()

    if (result.errors) {
      throw new Error(result.errors[0].message)
    }

    return result.data.addFlashCard
  }

  return {
    addFlashcard,
    isLoading,
    error,
    success
  }
}
