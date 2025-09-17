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

  const handleAddFlashcard = async () => {
    if (!entry || isLoadingEntry || !word) return
    try {
      const kanjiName = entry.kanji?.[0] || word
      const hiragana = entry.kana?.[0] || word
      const meanings = entry.senses?.flatMap((s) => s.gloss).filter(Boolean) || []
      const quizAnswers = [...(entry.kana || []), ...(entry.kanji || [])].filter(Boolean)
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
      const foundEntry = window.jmdictIndex?.[word] || window.jmdictKanaIndex?.[word]
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
      <div className="relative p-6 rounded-3xl min-w-[300px] max-w-[400px] border-2 border-yellow-700 shadow-2xl bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500 text-black transition-all duration-300">
        <div className="absolute top-4 right-4 flex space-x-3">
          <button
            className={`text-4xl font-bold p-2 rounded-full transition-all duration-200 ${
              isAddingFlashcard
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-yellow-600 hover:text-white opacity-90"
            }`}
            onClick={handleAddFlashcard}
            disabled={isAddingFlashcard}
            title={success ? "Added!" : "Add flashcard"}>
            {isAddingFlashcard ? "..." : success ? "✓" : "+"}
          </button>
          <button
            className="text-4xl font-bold p-2 rounded-full opacity-80 hover:bg-red-600 hover:text-white transition-all duration-200"
            onClick={onClose}
            title="Close">
            ×
          </button>
        </div>

        {/* Word Display */}
        <div className="text-5xl font-extrabold tracking-tight mb-2 leading-tight">{word}</div>

        {/* Romaji */}
        {romaji && (
          <div className="text-2xl italic text-black/70 font-medium mb-4 tracking-wide">
            {romaji}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="text-red-900 text-lg mb-4 bg-red-100 border border-red-300 p-3 rounded shadow">
            {error}
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="text-green-900 text-lg mb-4 bg-green-100 border border-green-300 p-3 rounded shadow">
            Flashcard added successfully!
          </div>
        )}

        {/* Dictionary Content */}
        {isLoadingEntry ? (
          <div className="text-2xl opacity-70">Loading...</div>
        ) : entry ? (
          <>
            {/* Kanji */}
            {entry.kanji?.length > 0 && (
              <div className="my-5">
                <div className="text-2xl font-semibold opacity-80 mb-2">Kanji:</div>
                <div className="flex flex-wrap">
                  {entry.kanji
                    .filter(k => typeof k === "string" && /[\u4E00-\u9FAF]/.test(k))
                    .map((kanji, index) => (
                      <span
                        key={index}
                        className="inline-block bg-black text-yellow-300 px-5 py-2 rounded-2xl text-3xl font-bold border border-yellow-600 mr-3 mb-3 shadow-md hover:scale-105 hover:bg-yellow-900 transition-all duration-200">
                        {kanji}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Meanings */}
            {entry.senses?.length > 0 && (
              <div className="my-5">
                <div className="text-2xl font-semibold opacity-80 mb-2">Meanings:</div>
                <div className="flex flex-wrap">
                  {entry.senses
                    .flatMap(sense => sense.gloss)
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((gloss, index) => (
                      <span
                        key={index}
                        className="inline-block bg-yellow-200 text-black px-5 py-2 rounded-full text-xl font-semibold border border-yellow-500 mr-3 mb-3 shadow hover:bg-yellow-300 transition-colors duration-200">
                        {gloss}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-2xl opacity-70">No dictionary entry found</div>
        )}
      </div>
    </div>
  )
}

export default WordCard
