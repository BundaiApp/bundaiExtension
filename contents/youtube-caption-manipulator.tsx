import cssText from "data-text:~style.css"
import React, { useState, useEffect, useRef } from "react"
import type { PlasmoCSConfig } from "plasmo"
import kuromoji from "kuromoji"
import { useMutation, ApolloProvider } from "@apollo/client"
import client from "../graphql"
import {ADD_FLASH_CARD_MUTATION} from "../graphql/mutations/addFlashCard.mutation"
import { storage, storageReady } from "../utils/secure-storage"

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
  }

export const config: PlasmoCSConfig = {
    matches: ["*://*.youtube.com/*"],
    all_frames: true
}

// Types
interface JMDictEntry {
    kanji?: string[]
    kana?: string[]
    senses?: Array<{
        gloss: string[]
    }>
}

interface Token {
    surface_form: string
}

// Global declarations
declare global {
    interface Window {
        jmdictData: JMDictEntry[]
        jmdictIndex: Record<string, JMDictEntry>
        jmdictKanaIndex: Record<string, JMDictEntry>
        jmdictLoaded: boolean
        kuromojiTokenizer: any
    }
}

// WordCard Component
interface WordCardProps {
    word: string
    mouseX: number
    isVisible: boolean
    isSticky: boolean
    onClose: () => void
}

const WordCard: React.FC<WordCardProps> = ({ word, mouseX, isVisible, isSticky, onClose }) => {
    const [entry, setEntry] = useState<JMDictEntry | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [containerRect, setContainerRect] = useState<DOMRect | null>(null)
    const [cardHeight, setCardHeight] = useState<number>(0)
    const cardRef = useRef<HTMLDivElement>(null)
    const [addFlashCard] = useMutation(ADD_FLASH_CARD_MUTATION, { client })

    // Always update containerRect on mount and when visible changes
    useEffect(() => {
        const captionContainer = document.querySelector('.captions-text')
        if (captionContainer) {
            setContainerRect(captionContainer.getBoundingClientRect())
        }
    }, [isVisible])

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
                    const check = () => window.jmdictLoaded ? resolve() : setTimeout(check, 50)
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
    useEffect(() => {
        if (isSticky && entry && !isLoading && word) {
            (async () => {
                await storageReady
                const userId = await storage.get("userId")
                if (!userId) {
                    console.log("No userId found in secure storage.")
                    return
                }
                // Extract data from entry
                const kanjiName = entry.kanji && entry.kanji.length > 0 ? entry.kanji[0] : word
                const hiragana = entry.kana && entry.kana.length > 0 ? entry.kana[0] : word
                const meanings = entry.senses ? entry.senses.flatMap(s => s.gloss).filter(Boolean) : []
                const quizAnswers = [
                    ...(entry.kana || []),
                    ...(entry.kanji || [])
                ].filter(Boolean)
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
            })()
        }
    }, [isSticky, entry, isLoading, word])

    // Calculate position: above the subtitle container, x based on mouseX (clamped), y based on dynamic card height
    const cardWidth = 300
    const margin = 12
    let left = mouseX - cardWidth / 2
    let top = 0
    if (containerRect) {
        left = Math.max(containerRect.left, Math.min(left, containerRect.right - cardWidth))
        top = containerRect.top - cardHeight - margin
    }

    const cardStyle: React.CSSProperties = {
        position: 'fixed',
        left,
        top,
        zIndex: 999999,
        pointerEvents: isVisible ? 'auto' : 'none',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.25s ease',
        // Prevent accidental selection
        userSelect: 'none',
        // Hide if no containerRect (not on watch page)
        display: containerRect ? 'block' : 'none',
    }

    return (
        <div 
            ref={cardRef}
            style={cardStyle}
        >
            <div className="bg-yellow-400 text-black rounded-lg p-4 shadow-lg min-w-[200px] max-w-[300px] text-lg leading-relaxed border-2 border-black relative">
                <button
                    className="absolute top-2 right-2 bg-none border-none text-black text-2xl cursor-pointer p-1 opacity-70 hover:opacity-100 transition-opacity"
                    onClick={onClose}
                >
                    ×
                </button>
                <div className="text-2xl font-extrabold mb-2">{word}</div>
                {isLoading ? (
                    <div className="text-lg opacity-70">Loading...</div>
                ) : entry ? (
                    <>
                        {entry.kanji && entry.kanji.length > 0 && (
                            <div className="my-2">
                                <span className="text-lg opacity-80 mr-2">Kanji: </span>
                                <div className="inline">
                                    {entry.kanji
                                        .filter(k => typeof k === "string" && /[\u4E00-\u9FAF]/.test(k))
                                        .map((kanji, index) => (
                                            <span
                                                key={index}
                                                className="inline-block bg-black text-yellow-300 px-3 py-1 rounded-xl text-xl border border-yellow-600 mr-2 mb-2"
                                            >
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
                                        .flatMap(sense => sense.gloss)
                                        .filter(Boolean)
                                        .map((gloss, index) => (
                                            <span
                                                key={index}
                                                className="inline-block bg-black text-yellow-200 px-3 py-1 rounded-2xl text-lg border border-yellow-600 mr-2 mb-2"
                                            >
                                                {gloss}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-lg opacity-70">
                        No dictionary entry found
                    </div>
                )}
            </div>
        </div>
    )
}

// Main CaptionEnhancer Component (Default Export for Plasmo)
const CaptionEnhancer: React.FC = () => {
    const [isInitialized, setIsInitialized] = useState(false)
    const [lastCaptionText, setLastCaptionText] = useState("")
    const [wordCard, setWordCard] = useState<{
        word: string
        mouseX: number
        isVisible: boolean
        isSticky: boolean
    }>({
        word: "",
        mouseX: 0,
        isVisible: false,
        isSticky: false
    })
    const [enabled, setEnabled] = useState(true)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const cleanupListenersRef = useRef<(() => void) | null>(null)

    // Check extension enabled state on mount
    useEffect(() => {
        chrome.storage.local.get(["extensionEnabled"], (result) => {
            setEnabled(result.extensionEnabled !== false) // default to true
        })
        // Listen for changes to extensionEnabled
        const handleStorageChange = (changes, area) => {
            if (area === "local" && changes.extensionEnabled) {
                setEnabled(changes.extensionEnabled.newValue !== false)
            }
        }
        chrome.storage.onChanged.addListener(handleStorageChange)
        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange)
        }
    }, [])

    // Initialization and cleanup based on enabled state
    useEffect(() => {
        if (!enabled) {
            // Clean up everything if disabled
            setIsInitialized(false)
            setLastCaptionText("")
            setWordCard({ word: "", mouseX: 0, isVisible: false, isSticky: false })
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            if (cleanupListenersRef.current) {
                cleanupListenersRef.current()
                cleanupListenersRef.current = null
            }
            return
        }
        let didCancel = false
        const initialize = async () => {
            try {
                // Initialize Kuromoji tokenizer
                if (!window.kuromojiTokenizer) {
                    const tokenizer = await new Promise<any>((resolve, reject) => {
                        kuromoji
                            .builder({
                                dicPath: chrome.runtime.getURL("node_modules/kuromoji/dict/"),
                            })
                            .build((err, tokenizer) => {
                                if (err) {
                                    reject(err)
                                    return
                                }
                                resolve(tokenizer)
                            })
                    })
                    window.kuromojiTokenizer = tokenizer
                }
                // Load JMdict data
                if (!window.jmdictLoaded) {
                    try {
                        const response = await fetch(
                            chrome.runtime.getURL("assets/data/japanese/jmdict-simplified-flat-full.json")
                        )
                        window.jmdictData = await response.json()
                        window.jmdictIndex = {}
                        window.jmdictKanaIndex = {}
                        window.jmdictData.forEach((entry) => {
                            if (Array.isArray(entry.kanji)) {
                                entry.kanji.forEach((kanji) => {
                                    window.jmdictIndex[kanji] = entry
                                })
                            }
                            if (Array.isArray(entry.kana)) {
                                entry.kana.forEach((kana) => {
                                    window.jmdictKanaIndex[kana] = entry
                                })
                            }
                        })
                        window.jmdictLoaded = true
                        console.log("[Bundai] JMdict loaded:", window.jmdictData.length, "entries")
                    } catch (e) {
                        console.error("[Bundai] Failed to load JMdict:", e)
                        window.jmdictData = []
                        window.jmdictIndex = {}
                        window.jmdictKanaIndex = {}
                        window.jmdictLoaded = true
                    }
                }
                if (!didCancel) setIsInitialized(true)
            } catch (error) {
                console.error("Failed to initialize:", error)
            }
        }
        initialize()
        return () => {
            didCancel = true
        }
    }, [enabled])

    // Utility functions
    const isJapaneseText = (text: string) => {
        return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)
    }

    const tokenizeJapanese = (text: string): Token[] => {
        if (!window.kuromojiTokenizer) return []
        return window.kuromojiTokenizer.tokenize(text)
    }

    const getCaptionText = () => {
        const captionContainer = document.querySelector(".captions-text")
        if (!captionContainer) return null

        const segments = captionContainer.querySelectorAll(".ytp-caption-segment")
        if (segments.length === 0) return null

        return Array.from(segments)
            .map(segment => segment.textContent?.trim())
            .filter(text => text && text.length > 0)
            .join(" ")
    }

    // Word card handlers
    const handleWordHover = (word: string, mouseX: number) => {
        setWordCard(prev => ({
            ...prev,
            word,
            mouseX,
            isVisible: true,
            isSticky: false
        }))
    }

    const handleWordLeave = () => {
        setWordCard(prev => ({
            ...prev,
            isVisible: prev.isSticky
        }))
    }

    const handleWordClick = (word: string, mouseX: number) => {
        setWordCard(prev => ({
            ...prev,
            word,
            mouseX,
            isVisible: true,
            isSticky: true
        }))
    }

    const handleCardClose = () => {
        setWordCard(prev => ({
            ...prev,
            isVisible: false,
            isSticky: false,
            word: ""
        }))
    }

    // Enhanced word component for inline rendering
    const createTokenizedWord = (token: Token, index: number) => {
        const handleMouseEnter = (e: React.MouseEvent) => {
            const rect = (e.target as HTMLElement).getBoundingClientRect()
            handleWordHover(token.surface_form, rect.left + rect.width / 2)
        }

        const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation()
            const rect = (e.target as HTMLElement).getBoundingClientRect()
            handleWordClick(token.surface_form, rect.left + rect.width / 2)
        }

        return (
            <span
                key={index}
                className="inline cursor-pointer px-1 py-0.5 rounded transition-colors duration-200 hover:bg-white hover:bg-opacity-20"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleWordLeave}
                onClick={handleClick}
            >
                {token.surface_form}
            </span>
        )
    }

    // Process captions
    const processCaptionSegments = () => {
        const segments = document.querySelectorAll(".ytp-caption-segment")
        
        segments.forEach((segment) => {
            const text = segment.textContent
            if (!text || !isJapaneseText(text)) return

            const tokens = tokenizeJapanese(text)
            if (tokens.length === 0) return

            // Create a temporary container for React rendering
            const tempContainer = document.createElement("div")
            tempContainer.style.display = "contents"
            
            // Use innerHTML to render the tokenized words
            tempContainer.innerHTML = tokens.map((token, index) => 
                `<span class="tokenized-word" data-word="${token.surface_form}" data-index="${index}">${token.surface_form}</span>`
            ).join("")

            // Add event listeners to each tokenized word
            tempContainer.querySelectorAll(".tokenized-word").forEach((wordElement) => {
                const word = wordElement.getAttribute("data-word")
                if (!word) return

                wordElement.addEventListener("mouseenter", (e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    handleWordHover(word, rect.left + rect.width / 2)
                })

                wordElement.addEventListener("mouseleave", handleWordLeave)

                wordElement.addEventListener("click", (e) => {
                    e.stopPropagation()
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    handleWordClick(word, rect.left + rect.width / 2)
                })

                // Add styling
                const element = wordElement as HTMLElement
                element.style.cursor = "pointer"
                element.style.padding = "2px 4px"
                element.style.borderRadius = "4px"
                element.style.transition = "background-color 0.2s"
                element.style.display = "inline"
                
                element.addEventListener("mouseenter", () => {
                    element.style.backgroundColor = "rgba(255, 255, 255, 0.2)"
                })
                
                element.addEventListener("mouseleave", () => {
                    element.style.backgroundColor = "transparent"
                })
            })

            // Replace segment content
            segment.innerHTML = ""
            segment.appendChild(tempContainer)
        })
    }

    // Monitor captions (only if enabled)
    useEffect(() => {
        if (!isInitialized || !enabled) return
        // Only start monitoring if we're on a YouTube watch page
        if (!window.location.href.includes("youtube.com/watch")) {
            return
        }
        // Add pause/resume on subtitle container hover
        const addSubtitleHoverListeners = () => {
            const captionContainer = document.querySelector('.captions-text');
            if (!captionContainer) return;
            const handleMouseEnter = () => {
                const video = document.querySelector('video');
                if (video && typeof (video as HTMLVideoElement).pause === 'function') {
                    (video as HTMLVideoElement).pause();
                }
            };
            const handleMouseLeave = () => {};
            captionContainer.addEventListener('mouseenter', handleMouseEnter);
            captionContainer.addEventListener('mouseleave', handleMouseLeave);
            // Cleanup
            return () => {
                captionContainer.removeEventListener('mouseenter', handleMouseEnter);
                captionContainer.removeEventListener('mouseleave', handleMouseLeave);
            };
        };
        const cleanupListeners = addSubtitleHoverListeners();
        cleanupListenersRef.current = cleanupListeners || null;
        const startMonitoring = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
            intervalRef.current = setInterval(() => {
                if (!window.location.href.includes("youtube.com/watch")) {
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current)
                        intervalRef.current = null
                    }
                    return
                }
                const currentText = getCaptionText()
                if (currentText && currentText !== lastCaptionText && isJapaneseText(currentText)) {
                    setLastCaptionText(currentText)
                    processCaptionSegments()
                }
            }, 500)
        }
        startMonitoring()
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            if (cleanupListeners) cleanupListeners();
        }
    }, [isInitialized, lastCaptionText, enabled])

    // Handle YouTube SPA navigation (only if enabled)
    useEffect(() => {
        if (!enabled) return
        let currentUrl = window.location.href
        const observer = new MutationObserver(() => {
            if (currentUrl !== window.location.href) {
                currentUrl = window.location.href
                setLastCaptionText("")
                setWordCard(prev => ({ ...prev, isVisible: false, isSticky: false }))
            }
        })
        observer.observe(document.body, {
            childList: true,
            subtree: true
        })
        return () => observer.disconnect()
    }, [enabled])

    // When extension is disabled, hide card and cleanup
    useEffect(() => {
        if (!enabled) {
            setWordCard({ word: "", mouseX: 0, isVisible: false, isSticky: false })
        }
    }, [enabled])

    // Only render if we're on a YouTube watch page, initialized, and enabled
    if (!window.location.href.includes("youtube.com/watch") || !isInitialized) {
        return null
    }

    return (
        <WordCard
            word={wordCard.word}
            mouseX={wordCard.mouseX}
            isVisible={wordCard.isVisible && enabled}
            isSticky={wordCard.isSticky}
            onClose={handleCardClose}
        />
    )
}

export default CaptionEnhancer