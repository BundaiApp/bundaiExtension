// components/WordCard.tsx
import React, { useEffect, useRef, useState } from "react"
import { toRomaji } from "wanakana"

import { useFlashcardService } from "../hooks/useFlashcardService"

import "../style.css"

interface JMDictEntry {
  kanji?: string[]
  kana?: string[]
  senses?: Array<{ gloss: string[] }>
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
  const [isLoadingEntry, setIsLoadingEntry] = useState(true)
  const [cardHeight, setCardHeight] = useState<number>(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const {
    addFlashcard,
    isLoading: isAddingFlashcard,
    error,
    success,
    resetState
  } = useFlashcardService()

  useEffect(() => resetState(), [word, resetState])

  const generateQuizAnswers = (
    currentWord: string,
    currentEntry: JMDictEntry
  ) => {
    // Get the current word's first gloss (correct answer)
    const correctAnswer = currentEntry.senses?.[0]?.gloss?.[0] || currentWord

    // Find adjacent entries in the dictionary
    const adjacentGlosses: string[] = []

    // Try to find the current entry in the global dictionary array
    if (window.jmdictData) {
      const currentIndex = window.jmdictData.findIndex(
        (entry) =>
          entry.kana?.includes(currentEntry.kana?.[0] || currentWord) ||
          (entry.kanji && entry.kanji.includes(currentWord))
      )

      if (currentIndex !== -1) {
        // Get glosses from entries before and after current entry
        for (
          let i = Math.max(0, currentIndex - 2);
          i <= Math.min(window.jmdictData.length - 1, currentIndex + 2);
          i++
        ) {
          if (
            i !== currentIndex &&
            window.jmdictData[i]?.senses?.[0]?.gloss?.[0]
          ) {
            const adjacentGloss = window.jmdictData[i].senses[0].gloss[0]
            if (adjacentGloss !== correctAnswer) {
              adjacentGlosses.push(adjacentGloss)
            }
          }
        }
      }
    }

    // If we don't have enough adjacent glosses, add fallback options
    while (adjacentGlosses.length < 3) {
      adjacentGlosses.push(`Option ${adjacentGlosses.length + 1}`)
    }

    // Shuffling the answers using fisher yates algorithm
    const allAnswers = [correctAnswer, ...adjacentGlosses.slice(0, 3)]
    for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]]
  }

    // Return the shuffled array
    return allAnswers
  }
  const handleAddFlashcard = async () => {
    if (!entry || isLoadingEntry || !word) return
    try {
      const kanjiName = entry.kanji?.[0] || word
      const hiragana = entry.kana?.[0] || word
      const meanings =
        entry.senses?.flatMap((s) => s.gloss).filter(Boolean) || []
      // const quizAnswers = [
      //   ...(entry.kana || []),
      //   ...(entry.kanji || [])
      // ].filter(Boolean)
      const quizAnswers = generateQuizAnswers(word, entry)
      await addFlashcard({ kanjiName, hiragana, meanings, quizAnswers })
    } catch (err) {
      console.error("Error in handleAddFlashcard:", err)
    }
  }

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => resetState(), 2000)
      return () => clearTimeout(timer)
    }
  }, [success, resetState])

  useEffect(() => {
    if (cardRef.current) {
      setCardHeight(cardRef.current.offsetHeight)
    }
  }, [entry, isLoadingEntry, word])

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
      const foundEntry =
        window.jmdictIndex?.[word] || window.jmdictKanaIndex?.[word]
      setEntry(foundEntry || null)
      setIsLoadingEntry(false)
    }

    if (word) {
      setIsLoadingEntry(true)
      setEntry(null)
      loadEntry()
    } else {
      setIsLoadingEntry(false)
      setEntry(null)
    }
  }, [word])

  const cardWidth = 380
  const margin = 16
  let left = mouseX - cardWidth / 2
  let top = containerRect
    ? containerRect.top - cardHeight - margin
    : mouseY - cardHeight - margin

  if (containerRect) {
    left = Math.max(
      containerRect.left,
      Math.min(left, containerRect.right - cardWidth)
    )
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

  let romaji = ""
  try {
    romaji = entry?.kana?.[0] ? toRomaji(entry.kana[0]) : toRomaji(word)
  } catch {
    romaji = ""
  }

  return (
    <div ref={cardRef} style={cardStyle}>
      <div className="wordcard-container">
        <div className="wordcard-buttons">
          <button
            className={`wordcard-button ${isAddingFlashcard ? "wordcard-button-disabled" : ""}`}
            onClick={handleAddFlashcard}
            disabled={isAddingFlashcard}
            title={success ? "Added!" : "Add flashcard"}>
            {isAddingFlashcard ? "..." : success ? "✓" : "+"}
          </button>
          <button
            className="wordcard-button wordcard-button-close"
            onClick={onClose}
            title="Close">
            ×
          </button>
        </div>

        {/* Word Display */}
        <div className="wordcard-word">
          {word}
        </div>

        {/* Romaji */}
        {romaji && (
          <div className="wordcard-romaji">
            {romaji}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="wordcard-error">
            {error}
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="wordcard-success">
            Flashcard added successfully!
          </div>
        )}

        {/* Dictionary Content */}
        {isLoadingEntry ? (
          <div className="wordcard-loading">Loading...</div>
        ) : entry ? (
          <>
            {/* Kanji */}
            {entry.kanji?.length > 0 && (
              <div className="wordcard-section">
                <div className="wordcard-section-title">
                  Kanji:
                </div>
                <div className="wordcard-tags">
                  {entry.kanji
                    .filter(
                      (k) => typeof k === "string" && /[\u4E00-\u9FAF]/.test(k)
                    )
                    .map((kanji, index) => (
                      <span key={index} className="wordcard-kanji-tag">
                        {kanji}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Meanings */}
            {entry.senses?.length > 0 && (
              <div className="wordcard-section">
                <div className="wordcard-section-title">
                  Meanings:
                </div>
                <div className="wordcard-tags">
                  {entry.senses
                    .flatMap((sense) => sense.gloss)
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((gloss, index) => (
                      <span key={index} className="wordcard-meaning-tag">
                        {gloss}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="wordcard-not-found">No dictionary entry found</div>
        )}
      </div>
    </div>
  )
}

export default WordCard
