import kuromoji from "kuromoji"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: ["*://*.youtube.com/*"],
    all_frames: true
}

"use strict";

// Add styles for our custom container and tokens
const style = document.createElement("style");
style.textContent = `
  .bundai-caption-container {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.8);
    font-size: 20px;
    text-align: center;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 9999;
  }
  .bundai-caption-container.visible {
    opacity: 1;
  }
  .bundai-token {
    display: inline;
    padding: 0 2px;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  .bundai-token:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
`;
document.head.appendChild(style);

let lastCaptionText = "";
let isMonitoring = false;
let tokenizer = null;
let videoElement = null;
let wordCard = null;

// JMdict data and loading
declare global {
    interface Window {
        jmdictData: any;
        jmdictIndex: Record<string, any>;
        jmdictKanaIndex: Record<string, any>;
        jmdictLoaded: boolean;
    }
}

// Load JMdict data
(async function loadJmdict() {
    try {
        const response = await fetch(
            chrome.runtime.getURL("assets/data/japanese/jmdict-simplified-flat-full.json")
        );
        window.jmdictData = await response.json();
        console.log('[Bundai] JMdict loaded? Entries:', Array.isArray(window.jmdictData) ? window.jmdictData.length : window.jmdictData);

        // Create index for O(1) lookups
        console.log("[Bundai] Creating JMdict index...");
        window.jmdictIndex = {};
        window.jmdictKanaIndex = {};

        window.jmdictData.forEach((entry) => {
            if (Array.isArray(entry.kanji)) {
                entry.kanji.forEach((kanji) => {
                    // Store the entry directly in the index
                    window.jmdictIndex[kanji] = entry;
                });
            }
        });

        window.jmdictData.forEach((entry) => {
            if (Array.isArray(entry.kana)) {
                entry.kana.forEach((kana) => {
                    // Store the entry directly in the kana index
                    window.jmdictKanaIndex[kana] = entry;
                });
            }
        });

        window.jmdictLoaded = true;
        console.log(
            "[Bundai] JMdict loaded:",
            window.jmdictData.length,
            "entries,",
            Object.keys(window.jmdictIndex).length,
            "indexed kanji"
        );
    } catch (e) {
        console.error("[Bundai] Failed to load JMdict:", e);
        window.jmdictData = [];
        window.jmdictIndex = {};
        window.jmdictKanaIndex = {};
        window.jmdictLoaded = true;
    }
})();

// Helper functions for JMdict lookups
// function findObjectByKanji(kanjiKeyword) {
//     return window.jmdictIndex[kanjiKeyword];
// }
function findObjectByKanji(kanjiKeyword) {
    if (!window.jmdictIndex) return null;
    return window.jmdictIndex[kanjiKeyword] || null;
}

function findObjectByKana(kanaKeyword) {
    if (!window.jmdictKanaIndex) return null;
    return window.jmdictKanaIndex[kanaKeyword] || null;
}

// Add state for sticky card
let isCardSticky = false;

// Function to create word card
function createWordCard() {
    if (wordCard) {
        return wordCard;
    }

    wordCard = document.createElement("div");
    wordCard.className = "word-card";
    wordCard.style.cssText = `
    position: fixed;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    min-width: 200px;
    max-width: 300px;
    font-size: 16px;
    line-height: 1.4;
    pointer-events: auto;
    display: none;
  `;

    // Add close button
    const closeButton = document.createElement("button");
    closeButton.innerHTML = "×";
    closeButton.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 0.2s;
  `;
    closeButton.addEventListener("mouseenter", () => {
        closeButton.style.opacity = "1";
    });
    closeButton.addEventListener("mouseleave", () => {
        closeButton.style.opacity = "0.7";
    });
    closeButton.addEventListener("click", () => {
        isCardSticky = false;
        hideWordCard();
    });
    wordCard.appendChild(closeButton);

    // Add content container
    const contentContainer = document.createElement("div");
    contentContainer.className = "word-card-content";
    wordCard.appendChild(contentContainer);

    document.body.appendChild(wordCard);
    return wordCard;
}

// Function to show word card
async function showWordCard(word, x, y): Promise<void> {
    if (!word) return;

    // Wait for jmdict to be loaded if not already
    if (!window.jmdictLoaded) {
        await new Promise<void>((resolve) => {
            const check = () =>
                window.jmdictLoaded ? resolve() : setTimeout(check, 50);
            check();
        });
    }

    const card = createWordCard();
    const contentContainer = card.querySelector(".word-card-content");
    contentContainer.innerHTML = ""; // Clear previous content

    // Show the word at the top
    const wordElement = document.createElement("div");
    wordElement.style.cssText = `
    font-size: 1.2em;
    font-weight: bold;
    margin-bottom: 4px;
  `;
    wordElement.textContent = word;
    contentContainer.appendChild(wordElement);

    // Lookup in JMdict
    let entry = findObjectByKanji(word);
    if (!entry) {
        entry = findObjectByKana(word);
    }

    if (entry) {
        // Show kanji readings if available, otherwise show kana
        if (Array.isArray(entry.kanji) && entry.kanji.length > 0) {
            const kanjiContainer = document.createElement("div");
            kanjiContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 4px 0;
      `;

            const kanjiLabel = document.createElement("span");
            kanjiLabel.textContent = "Kanji: ";
            kanjiLabel.style.cssText = `
        font-size: 0.9em;
        opacity: 0.8;
        margin-right: 4px;
      `;
            kanjiContainer.appendChild(kanjiLabel);

            entry.kanji
                .filter(k => typeof k === "string" && /[\u4E00-\u9FAF]/.test(k)) // Only real kanji
                .forEach((kanji) => {
                    const kanjiChip = document.createElement("span");
                    kanjiChip.textContent = kanji;
                    kanjiChip.style.cssText = `
          background: rgba(255, 255, 255, 0.15);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.85em;
          border: 1px solid rgba(255, 255, 255, 0.2);
        `;
                    kanjiContainer.appendChild(kanjiChip);
                });

            contentContainer.appendChild(kanjiContainer);
        }

        // Show meanings (gloss)
        if (Array.isArray(entry.senses) && entry.senses.length > 0) {
            const meaningsContainer = document.createElement("div");
            meaningsContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 4px 0;
      `;

            const meaningsLabel = document.createElement("span");
            meaningsLabel.textContent = "Meanings:";
            meaningsLabel.style.cssText = `
        font-size: 0.9em;
        opacity: 0.8;
        margin-bottom: 2px;
      `;
            meaningsContainer.appendChild(meaningsLabel);

            const meaningsList = document.createElement("div");
            meaningsList.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      `;

            // Get all glosses from all senses
            const glosses = entry.senses
                .flatMap((sense) => sense.gloss)
                .filter(Boolean);
            glosses.forEach((gloss) => {
                const meaningChip = document.createElement("span");
                meaningChip.textContent = gloss;
                meaningChip.style.cssText = `
          background: rgba(100, 149, 237, 0.3);
          padding: 3px 10px;
          border-radius: 14px;
          font-size: 0.8em;
          border: 1px solid rgba(100, 149, 237, 0.4);
          line-height: 1.2;
        `;
                meaningsList.appendChild(meaningChip);
            });

            meaningsContainer.appendChild(meaningsList);
            contentContainer.appendChild(meaningsContainer);
        }
    }

    // Position the card
    const cardRect = card.getBoundingClientRect();
    const left = Math.max(
        10,
        Math.min(window.innerWidth - cardRect.width - 10, x - cardRect.width / 2)
    );
    const top = y - 100; // 100px above the word span

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.display = "block";
}

// Function to hide word card
function hideWordCard() {
    if (!isCardSticky && wordCard) {
        wordCard.style.display = "none";
    }
}

// Function to find the video element
function findVideoElement() {
    // First try to find the largest video
    const videos = Array.from(document.querySelectorAll("video"));
    if (videos.length === 0) return null;

    // For YouTube, prefer the main player video
    const ytVideo = document.querySelector(".html5-main-video");
    if (ytVideo) {
        return ytVideo;
    }

    // Sort by size (height * width) and return the largest
    videos.sort((a, b) => {
        const areaA = a.offsetWidth * a.offsetHeight;
        const areaB = b.offsetWidth * b.offsetHeight;
        return areaB - areaA;
    });

    return videos[0];
}

// Function to setup hover events for caption container
function setupCaptionHoverEvents() {
    const captionContainer = document.querySelector(".captions-text");
    if (captionContainer) {
        captionContainer.addEventListener("mouseenter", () => {
            if (videoElement && !videoElement.paused) {
                videoElement.pause();
            }
        });
        // captionContainer.addEventListener("mouseleave", () => {
        //   if (videoElement && videoElement.paused) {
        //     videoElement.play();
        //   }
        // });
    }
}

// Function to wrap Japanese words in spans
function wrapJapaneseWords(element) {
    if (!element) return;

    // Get the text content
    const text = element.textContent;
    if (!isJapaneseText(text)) return;

    // Tokenize the text
    const tokens = tokenizeJapanese(text);

    // Create a document fragment to hold our new content
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    // Process each token
    tokens.forEach((token) => {
        const word = token.surface_form;
        const index = text.indexOf(word, lastIndex);

        if (index > lastIndex) {
            // Add any non-Japanese text before this token
            fragment.appendChild(
                document.createTextNode(text.slice(lastIndex, index))
            );
        }

        // Create span for the Japanese word
        const wordSpan = document.createElement("span");
        wordSpan.textContent = word;
        wordSpan.className = "bundai-token";
        wordSpan.style.cssText = `
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background-color 0.2s;
    `;

        // Add hover events
        wordSpan.addEventListener("mouseenter", (e) => {
            const rect = wordSpan.getBoundingClientRect();
            showWordCard(word, rect.left + rect.width / 2, rect.top - 100);
        });
        wordSpan.addEventListener("mouseleave", hideWordCard);

        // Add click event for sticky card
        wordSpan.addEventListener("click", (e) => {
            e.stopPropagation();
            isCardSticky = true;
            const rect = wordSpan.getBoundingClientRect();
            showWordCard(word, rect.left + rect.width / 2, rect.top - 100);
        });

        fragment.appendChild(wordSpan);
        lastIndex = index + word.length;
    });

    // Add any remaining text
    if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    // Replace the content
    element.textContent = "";
    element.appendChild(fragment);
}

// Function to process caption segments
function processCaptionSegments() {
    const segments = document.querySelectorAll(".ytp-caption-segment");
    segments.forEach((segment) => {
        wrapJapaneseWords(segment);
    });
    // Setup hover events after processing segments
    setupCaptionHoverEvents();
}

// Function to log captions when they change
function logCaptions() {
    const currentText = getCaptionText();

    if (currentText && currentText !== lastCaptionText) {
        if (isJapaneseText(currentText)) {
            const tokens = tokenizeJapanese(currentText);
            console.log("Japanese Caption:", currentText);
            console.log(
                "Tokens:",
                tokens.map((token) => token.surface_form)
            );

            // Process the caption segments
            processCaptionSegments();
        }
        lastCaptionText = currentText;
    }
}

// Start monitoring captions
function startMonitoring() {
    if (isMonitoring) return;

    // Find video element
    videoElement = findVideoElement();
    if (!videoElement) {
        console.log("No video element found");
        return;
    }

    isMonitoring = true;
    console.log("YouTube Caption Logger started");

    // Check for captions every 500ms
    const interval = setInterval(() => {
        // Stop if we're no longer on a YouTube video page
        if (!window.location.href.includes("youtube.com/watch")) {
            clearInterval(interval);
            isMonitoring = false;
            console.log("YouTube Caption Logger stopped");
            return;
        }

        logCaptions();
    }, 500);
}

// Function to extract caption text from the container
function getCaptionText() {
    const captionContainer = document.querySelector(".captions-text");
    if (!captionContainer) return null;

    const segments = captionContainer.querySelectorAll(".ytp-caption-segment");
    if (segments.length === 0) return null;

    const text = Array.from(segments)
        .map((segment) => segment.textContent.trim())
        .filter((text) => text.length > 0)
        .join(" ");

    return text;
}

// Initialize Kuromoji tokenizer
function initializeTokenizer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        kuromoji
            .builder({
                dicPath: chrome.runtime.getURL("node_modules/kuromoji/dict/"),
            })
            .build((err, _tokenizer) => {
                if (err) {
                    console.error("Kuromoji initialization error:", err);
                    reject(err);
                    return;
                }
                tokenizer = _tokenizer;
                resolve();
            });
    });
}

// Function to detect if text is Japanese
function isJapaneseText(text) {
    // Check if text contains Japanese characters (Hiragana, Katakana, or Kanji)
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

// Function to tokenize Japanese text
function tokenizeJapanese(text) {
    if (!tokenizer) return [];
    return tokenizer.tokenize(text);
}

// Function to clean text by removing punctuation and special characters
function cleanText(text) {
    // Remove punctuation, special characters, but keep Japanese characters
    return text
        .replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s]/g, "")
        .replace(/\s+/g, " ") // Replace multiple spaces with single space
        .trim();
}

// Wait for the page to load and start monitoring
async function initialize() {
    // Check if we're on a YouTube video page
    if (!window.location.href.includes("youtube.com/watch")) {
        return;
    }

    // Initialize Kuromoji
    try {
        await initializeTokenizer();
    } catch (error) {
        console.error("Failed to initialize Kuromoji:", error);
        return;
    }

    // Wait for the video player to load
    const checkForPlayer = setInterval(() => {
        const player = document.querySelector("#movie_player");
        if (player) {
            clearInterval(checkForPlayer);

            // Wait a bit more for captions to potentially load
            setTimeout(() => {
                startMonitoring();
            }, 2000);
        }
    }, 1000);

    // Stop checking after 10 seconds if player not found
    setTimeout(() => {
        clearInterval(checkForPlayer);
    }, 10000);
}

// Handle YouTube's single-page app navigation
let currentUrl = window.location.href;

// Observer for URL changes (YouTube SPA navigation)
const observer = new MutationObserver(() => {
    if (currentUrl !== window.location.href) {
        currentUrl = window.location.href;
        lastCaptionText = "";
        isMonitoring = false;

        // Wait a bit for the new page to load, then initialize
        setTimeout(initialize, 1000);
    }
});

// Start observing
observer.observe(document.body, {
    childList: true,
    subtree: true,
});

// Initial setup
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
} else {
    initialize();
}

if (!window.jmdictKanaIndex || Object.keys(window.jmdictKanaIndex).length === 0) {
    console.warn("JMdict kana index is empty or not loaded.");
}