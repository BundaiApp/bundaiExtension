// components/WordCard.tsx
import React, { useEffect, useRef, useState } from "react"
import { toRomaji } from "wanakana"

import { useFlashcardService } from "../hooks/useFlashcardService"
import dictionaryService, {
  type DictionaryEntry
} from "../services/dictionary-service"
import dictionaryDB from "../services/dictionaryDB"

import "../style.css"

interface WordCardStyles {
  backgroundColor?: string
  textColor?: string
  fontSize?: number
  borderRadius?: number
  borderColor?: string
  wordFontSize?: number
}

interface WordCardProps {
  word: string
  mouseX: number
  mouseY: number
  isVisible: boolean
  isSticky: boolean
  onClose: () => void
  containerRect: DOMRect | null
  customStyles?: WordCardStyles
  basicForm?: string
  reading?: string
  pos?: string
  conjugatedForm?: string
}

const WordCard: React.FC<WordCardProps> = ({
  word,
  mouseX,
  mouseY,
  isVisible,
  isSticky,
  onClose,
  containerRect,
  customStyles = {},
  basicForm,
  reading,
  pos,
  conjugatedForm
}) => {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
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

  const generateQuizAnswers = async (
    currentWord: string,
    currentEntry: DictionaryEntry
  ): Promise<string[]> => {
    const correctAnswer = currentEntry.meanings[0] || currentWord

    const alternativeAnswers: string[] = []

    try {
      const randomEntries = await dictionaryDB.getRandomEntries(3, currentWord)

      for (const entry of randomEntries) {
        const gloss = entry.senses?.[0]?.gloss?.[0]
        if (gloss && gloss !== correctAnswer) {
          alternativeAnswers.push(gloss)
        }
      }
    } catch (error) {
      console.error("[WordCard] Failed to get random entries:", error)
    }

    while (alternativeAnswers.length < 3) {
      alternativeAnswers.push(`Option ${alternativeAnswers.length + 1}`)
    }

    const allAnswers = [correctAnswer, ...alternativeAnswers.slice(0, 3)]
    for (let i = allAnswers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]]
    }

    return allAnswers
  }
  const handleAddFlashcard = async () => {
    if (!entry || isLoadingEntry || !word) {
      console.log("[WordCard] Cannot add flashcard:", {
        entry,
        isLoadingEntry,
        word
      })
      return
    }

    console.log("[WordCard] Starting to add flashcard for:", word)

    try {
      const kanjiName = entry.entry.kanji?.[0] || word
      const hiragana = entry.entry.kana?.[0] || word
      const meanings =
        entry.entry.senses?.flatMap((s) => s.gloss).filter(Boolean) || []

      console.log("[WordCard] Generating quiz answers...")
      const quizAnswers = await generateQuizAnswers(word, entry)
      console.log("[WordCard] Quiz answers generated:", quizAnswers)

      const flashcardData = {
        kanjiName,
        hiragana,
        meanings,
        quizAnswers,
        source: "extension"
      }
      console.log("[WordCard] Adding flashcard with data:", flashcardData)
      await addFlashcard(flashcardData)
      console.log("[WordCard] Flashcard added successfully")
    } catch (err) {
      console.error("[WordCard] Error in handleAddFlashcard:", err)
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

      try {
        console.log("[WordCard] Looking up word:", word)
        const result = await dictionaryService.lookupWithDeinflect(word, {
          reading
        })

        console.log("[WordCard] Lookup result:", {
          word,
          found: !!result,
          isExact: result?.isExact,
          deinflectReasons: result?.deinflectReasons
        })

        setEntry(result)
      } catch (error) {
        console.error("[WordCard] Failed to lookup word:", error)
        setEntry(null)
      } finally {
        setIsLoadingEntry(false)
      }
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
    romaji = entry?.reading ? toRomaji(entry.reading) : toRomaji(word)
  } catch {
    romaji = ""
  }

  // Apply custom styles - only include defined values to override CSS
  const containerStyle: React.CSSProperties = {}
  if (customStyles.backgroundColor)
    containerStyle.backgroundColor = customStyles.backgroundColor
  if (customStyles.textColor) containerStyle.color = customStyles.textColor
  if (customStyles.borderRadius !== undefined)
    containerStyle.borderRadius = `${customStyles.borderRadius}px`
  if (customStyles.borderColor)
    containerStyle.borderColor = customStyles.borderColor
  if (customStyles.fontSize !== undefined)
    containerStyle.fontSize = `${customStyles.fontSize}px`

  const wordStyle: React.CSSProperties = {}
  if (customStyles.wordFontSize !== undefined)
    wordStyle.fontSize = `${customStyles.wordFontSize}px`
  if (customStyles.textColor) wordStyle.color = customStyles.textColor

  // Debug log
  if (Object.keys(customStyles).length > 0) {
    console.log("[WordCard] Applying custom styles:", {
      customStyles,
      containerStyle,
      wordStyle
    })
  }

  return (
    <div ref={cardRef} style={cardStyle}>
      <div className="wordcard-container" style={containerStyle}>
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
        <div className="wordcard-word" style={wordStyle}>
          {word}
        </div>

        {/* Romaji */}
        {romaji && <div className="wordcard-romaji">{romaji}</div>}

        {/* Error Display */}
        {error && <div className="wordcard-error">{error}</div>}

        {/* Success Display */}
        {success && (
          <div className="wordcard-success">Flashcard added successfully!</div>
        )}

        {/* Dictionary Content */}
        {isLoadingEntry ? (
          <div className="wordcard-loading">Loading...</div>
        ) : entry ? (
          <>
            {/* Kanji */}
            {entry.entry.kanji?.length > 0 && (
              <div className="wordcard-section">
                <div className="wordcard-section-title">Kanji:</div>
                <div className="wordcard-tags">
                  {entry.entry.kanji
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
            {entry.entry.senses?.length > 0 && (
              <div className="wordcard-section">
                <div className="wordcard-section-title">Meanings:</div>
                <div className="wordcard-tags">
                  {entry.entry.senses
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
          <div className="wordcard-not-found">No entry found</div>
        )}
      </div>
    </div>
  )
}

export default WordCard
