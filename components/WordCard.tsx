import { useMutation } from "@apollo/client"
import React, { useEffect, useRef, useState } from "react"
import { toRomaji } from "wanakana"

import "../style.css"

import client from "../graphql"
import { ADD_FLASH_CARD_MUTATION } from "../graphql/mutations/addFlashCard.mutation"
import { storage, storageReady } from "../utils/secure-storage"

// Types
interface JMDictEntry {
  kanji?: string[]
  kana?: string[]
  senses?: Array<{
    gloss: string[]
  }>
}

interface WordCardProps {
  word: string
  mouseX: number
  mouseY: number
  isVisible: boolean
  isSticky: boolean
  onClose: () => void
  containerRect: DOMRect | null
}

const WordCard: React.FC<WordCardProps> = ({
  word,
  mouseX,
  mouseY,
  isVisible,
  isSticky,
  onClose,
  containerRect
}) => {
  const [entry, setEntry] = useState<JMDictEntry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [cardHeight, setCardHeight] = useState<number>(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const [addFlashCard] = useMutation(ADD_FLASH_CARD_MUTATION, { client })

  const addCardManually = async () => {
    if (!entry || isLoading || !word) return
    await storageReady
    const userId = await storage.get("userId")
    if (!userId) {
      console.log("No userId found in secure storage.")
      return
    }

    const kanjiName =
      entry.kanji && entry.kanji.length > 0 ? entry.kanji[0] : word
    const hiragana = entry.kana && entry.kana.length > 0 ? entry.kana[0] : word
    const meanings = entry.senses
      ? entry.senses.flatMap((s) => s.gloss).filter(Boolean)
      : []
    const quizAnswers = [...(entry.kana || []), ...(entry.kanji || [])].filter(
      Boolean
    )

    try {
      const result = await addFlashCard({
        variables: {
          userId,
          kanjiName,
          hiragana,
          meanings,
          quizAnswers
        }
      })
      console.log("Flashcard added:", result)
    } catch (err) {
      console.error("Failed to add flashcard:", err)
    }
  }

  // Measure card height after render
  useEffect(() => {
    if (cardRef.current) {
      setCardHeight(cardRef.current.offsetHeight)
    }
  }, [entry, isLoading, word])

  useEffect(() => {
    const loadEntry = async () => {
      if (!word) return
      if (!window.jmdictLoaded) {
        await new Promise<void>((resolve) => {
          const check = () =>
            window.jmdictLoaded ? resolve() : setTimeout(check, 50)
          check()
        })
      }
      let foundEntry = window.jmdictIndex?.[word]
      if (!foundEntry) {
        foundEntry = window.jmdictKanaIndex?.[word]
      }
      setEntry(foundEntry || null)
      setIsLoading(false)
    }
    if (word) {
      setIsLoading(true)
      setEntry(null)
      loadEntry()
    } else {
      setIsLoading(false)
      setEntry(null)
    }
  }, [word])

  // If the card just became sticky, trigger the mutation
  //   useEffect(() => {
  //     if (isSticky && entry && !isLoading && word) {
  //       ;(async () => {
  //         await storageReady
  //         const userId = await storage.get("userId")
  //         if (!userId) {
  //           console.log("No userId found in secure storage.")
  //           return
  //         }
  //         // Extract data from entry
  //         const kanjiName =
  //           entry.kanji && entry.kanji.length > 0 ? entry.kanji[0] : word
  //         const hiragana =
  //           entry.kana && entry.kana.length > 0 ? entry.kana[0] : word
  //         const meanings = entry.senses
  //           ? entry.senses.flatMap((s) => s.gloss).filter(Boolean)
  //           : []
  //         const quizAnswers = [
  //           ...(entry.kana || []),
  //           ...(entry.kanji || [])
  //         ].filter(Boolean)
  //         try {
  //           const result = await addFlashCard({
  //             variables: {
  //               userId,
  //               kanjiName,
  //               hiragana,
  //               meanings,
  //               quizAnswers
  //             }
  //           })
  //           console.log("Flashcard added:", result)
  //         } catch (err) {
  //           console.error("Failed to add flashcard:", err)
  //         }
  //       })()
  //     }
  //   }, [isSticky, entry, isLoading, word, addFlashCard])

  // Calculate position: above the subtitle container, x based on mouseX (clamped), y above mouseY
  const cardWidth = 300
  const margin = 12
  let left = mouseX - cardWidth / 2
  let top = containerRect.top - cardHeight - margin

  if (containerRect) {
    // Clamp horizontally to container bounds
    left = Math.max(
      containerRect.left,
      Math.min(left, containerRect.right - cardWidth)
    )

    // Ensure card doesn't go above viewport
    top = Math.max(margin, top)
  }

  const cardStyle: React.CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 10000,
    pointerEvents: isVisible ? "auto" : "none",
    opacity: isVisible ? 1 : 0,
    transition: "opacity 0.25s ease",
    userSelect: "none",
    display: containerRect ? "block" : "none"
  }

  // Compute romaji for the word (using kana reading if available)
  let romaji = ""
  try {
    if (
      entry &&
      Array.isArray(entry.kana) &&
      typeof entry.kana[0] === "string" &&
      entry.kana[0].length > 0
    ) {
      romaji = toRomaji(entry.kana[0])
    } else if (typeof word === "string" && word.length > 0) {
      romaji = toRomaji(word)
    }
  } catch (e) {
    console.error("Romaji conversion error:", e)
    romaji = ""
  }

  return (
    <div ref={cardRef} style={cardStyle}>
      <div className="bg-yellow-400 text-black rounded-lg p-4 shadow-lg min-w-[200px] max-w-[300px] text-lg leading-relaxed border-2 border-black relative">
        <div className="absolute top-2 right-2 flex space-x-2">
          <button
            className="bg-none border-none text-black text-2xl cursor-pointer p-1 opacity-70 hover:opacity-100 transition-opacity"
            onClick={addCardManually}
            title="Add flashcard">
            +
          </button>
          <button
            className="bg-none border-none text-black text-2xl cursor-pointer p-1 opacity-70 hover:opacity-100 transition-opacity"
            onClick={onClose}
            title="Close">
            ×
          </button>
        </div>
        <div className="text-2xl font-extrabold">{word}</div>
        {romaji && (
          <div className="text-lg opacity-50 font-bold mb-2">{romaji}</div>
        )}
        {isLoading ? (
          <div className="text-lg opacity-70">Loading...</div>
        ) : entry ? (
          <>
            {entry.kanji && entry.kanji.length > 0 && (
              <div className="my-2">
                <span className="text-lg opacity-80 mr-2">Kanji: </span>
                <div className="inline">
                  {entry.kanji
                    .filter(
                      (k) => typeof k === "string" && /[\u4E00-\u9FAF]/.test(k)
                    )
                    .map((kanji, index) => (
                      <span
                        key={index}
                        className="inline-block bg-black text-yellow-300 px-3 py-1 rounded-xl text-xl border border-yellow-600 mr-2 mb-2">
                        {kanji}
                      </span>
                    ))}
                </div>
              </div>
            )}
            {entry.senses && entry.senses.length > 0 && (
              <div className="my-2">
                <div className="text-lg opacity-80 mb-1">Meanings:</div>
                <div className="mt-1">
                  {entry.senses
                    .flatMap((sense) => sense.gloss)
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((gloss, index) => (
                      <span
                        key={index}
                        className="inline-block bg-black text-yellow-200 px-3 py-1 rounded-2xl text-lg border border-yellow-600 mr-2 mb-2">
                        {gloss}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-lg opacity-70">No dictionary entry found</div>
        )}
      </div>
    </div>
  )
}

export default WordCard
