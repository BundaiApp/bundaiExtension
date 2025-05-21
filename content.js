// content.js
(() => {
  // Extension state
  let settings = {
    enabled: false,
    subtitle1: {
      source: 'cc',
      color: '#ffffff',
      background: '#000000',
      opacity: 0.7,
      fontSize: 18
    },
    subtitle2: {
      source: 'subtitle1',
      color: '#ffffff',
      background: '#000000',
      opacity: 0.7,
      fontSize: 18
    },
    position: 25, // % from bottom
    gap: 20,
  };

  let subtitleContainer = null;
  let subtitle1Element = null;
  let subtitle2Element = null;
  let videoElement = null;
  let activeTextTracks = {};
  let subtitleObserver = null;
  let domObserver = null;
  let nativeSubtitleObserver = null;
  let debugMode = true; // Set to true to see console logs for debugging
  let isYouTube = false;
  let availableTracks = [];
  let youtubeSubtitleTracks = [];

  // Logging helper function
  function log(message, data) {
    if (debugMode) {
      console.log(`[Dual Subtitles] ${message}`, data || '');
    }
  }

  // Initialize when document is fully loaded
  function initialize() {
    // Check if we're on YouTube
    isYouTube = window.location.hostname.includes('youtube.com');
    log('Initializing on ' + (isYouTube ? 'YouTube' : 'other site'));

    // Load YouTube utils script if we're on YouTube
    if (isYouTube) {
      injectYouTubeUtilsScript();
    }

    // Load saved settings
    chrome.storage.sync.get(settings, (items) => {
      settings = items;
      log('Loaded settings', settings);

      if (settings.enabled) {
        setupSubtitleDisplay();
      }
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      log('Received message', message);

      if (message.action === 'updateSettings') {
        log('Received settings update', message.settings);
        const wasEnabled = settings.enabled;
        settings = message.settings;

        if (!wasEnabled && settings.enabled) {
          setupSubtitleDisplay();
        } else if (wasEnabled && !settings.enabled) {
          removeSubtitleDisplay();
        } else if (settings.enabled) {
          updateSubtitleDisplay();
        }

        updateSubtitleStyles(settings);

        sendResponse({ success: true });
      } else if (message.action === 'updateTracks') {
        log('Received track update', message.settings);
        if (message.settings.subtitle1) {
          settings.subtitle1.source = message.settings.subtitle1.source;
        }
        if (message.settings.subtitle2) {
          settings.subtitle2.source = message.settings.subtitle2.source;
        }
        setupTextTracks(); // This will update the active tracks
        updateSubtitleContent(); // This will update the display
        sendResponse({ success: true });
      }
      else if (message.action === 'getSubtitleTracks') {
        // Send available subtitle tracks back to the popup
        detectAvailableTracks().then(() => {
          sendResponse({ tracks: availableTracks });
        });
        return true; // Keep the message channel open for async response
      }

      return true;
    });

    // Start watching for DOM changes to detect video elements and subtitle containers
    observeDOMChanges();
  }

  // Inject YouTube utils script
  function injectYouTubeUtilsScript() {
    // Check if the script is already loaded
    if (window.dualSubtitles && window.dualSubtitles.youtube) {
      log('YouTube utils already loaded');
      return;
    }

    try {
      // Create a script element to load the YouTube utils
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('getYtSubs.js');
      script.onload = function () {
        log('YouTube subtitle utils script loaded');
        // Script has loaded, now we can use the YouTube subtitle functions
        if (settings.enabled) {
          loadYouTubeSubtitles();
        }
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      log('Error injecting YouTube utils script', e);
    }
  }

  // Load YouTube subtitles
  async function loadYouTubeSubtitles() {
    if (!isYouTube || !videoElement) return;

    log('Attempting to load YouTube subtitles');

    // Make sure video element is found
    if (!videoElement) {
      videoElement = findVideoElement();
      if (!videoElement) {
        log('No video element found for YouTube subtitles');
        return;
      }
    }

    try {
      const videoId = extractYouTubeVideoIdFromUrl(window.location.href);
      if (!videoId) {
        log('Could not extract YouTube video ID');
        return;
      }

      log('Loading subtitles for YouTube video ID:', videoId);

      // Fetch the video page to get subtitle information
      const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
      const html = await response.text();

      // Extract ytInitialPlayerResponse JSON from HTML
      const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
      if (!playerResponseMatch) {
        log('Could not find player response in HTML');
        return;
      }

      // Parse the player response
      const playerResponse = JSON.parse(playerResponseMatch[1]);
      const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (!captionTracks || captionTracks.length === 0) {
        log('No subtitles available for this video');
        return;
      }

      // Transform the tracks into a more usable format
      youtubeSubtitleTracks = captionTracks.map((track, index) => ({
        id: `youtube_${index}`,
        index: index,
        languageCode: track.languageCode,
        name: track.name.simpleText,
        baseUrl: track.baseUrl,
        isDefault: !!track.isDefault
      }));

      log('Found YouTube subtitle tracks', youtubeSubtitleTracks);

      // Clear existing tracks
      availableTracks = [{
        id: 'cc',
        label: 'Closed Captions (CC)'
      }];

      // Add YouTube tracks to available tracks
      youtubeSubtitleTracks.forEach(track => {
        availableTracks.push({
          id: track.id,
          label: `YouTube: ${track.name} (${track.languageCode})`
        });
      });

      // Load subtitles for the selected tracks
      await loadSelectedYouTubeSubtitles();
    } catch (e) {
      log('Error loading YouTube subtitles', e);
    }
  }

  // Extract YouTube video ID from URL
  function extractYouTubeVideoIdFromUrl(url) {
    if (!url) return null;

    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/i,
      /youtube\.com\/watch.*?[?&]v=([^&?/]+)/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  // Load selected YouTube subtitle tracks
  async function loadSelectedYouTubeSubtitles() {
    if (youtubeSubtitleTracks.length === 0) return;

    // Determine which YouTube tracks to load based on settings
    const trackIds = [
      settings.subtitle1.source,
      settings.subtitle2.source
    ];

    const tracksToLoad = [];

    trackIds.forEach(sourceId => {
      if (sourceId.startsWith('youtube_')) {
        const index = parseInt(sourceId.replace('youtube_', ''));
        if (youtubeSubtitleTracks[index]) {
          tracksToLoad.push(youtubeSubtitleTracks[index]);
        }
      }
    });

    // For each selected track, fetch its content and create a text track
    for (const track of tracksToLoad) {
      try {
        const response = await fetch(`${track.baseUrl}&fmt=json3`);
        const data = await response.json();

        if (!data.events) continue;

        // Transform the events into cues
        const cues = data.events
          .filter(event => event.segs)
          .map(event => {
            const text = event.segs
              .map(seg => seg.utf8 || '')
              .join('')
              .trim();

            const startTime = event.tStartMs / 1000;
            const endTime = (event.tStartMs + (event.dDurationMs || 0)) / 1000;

            return {
              start: startTime,
              end: endTime,
              text: text
            };
          })
          .filter(cue => cue.text);

        if (cues.length === 0) continue;

        // Create a text track
        const textTrack = videoElement.addTextTrack('subtitles', track.name, track.languageCode);
        textTrack.mode = 'hidden';

        // Add cues to the track
        cues.forEach(cue => {
          const vttCue = new VTTCue(cue.start, cue.end, cue.text);
          textTrack.addCue(vttCue);
        });

        // Store additional YouTube-specific information
        textTrack.youtubeTrack = {
          id: track.id,
          baseUrl: track.baseUrl
        };

        log(`Created text track for ${track.name}`);
      } catch (e) {
        log(`Error loading YouTube track ${track.name}`, e);
      }
    }

    // Setup text tracks after loading YouTube subtitles
    setupTextTracks();
  }

  // Set up DOM observer to detect new videos and subtitles
  function observeDOMChanges() {
    if (domObserver) {
      domObserver.disconnect();
    }

    domObserver = new MutationObserver((mutations) => {
      if (settings.enabled && (!videoElement || !subtitleContainer)) {
        const videoFound = findVideoElement();
        if (videoFound && videoFound !== videoElement) {
          log('New video element detected', videoFound);
          videoElement = videoFound;
          setupSubtitleDisplay();

          // If we're on YouTube, load YouTube subtitles
          if (isYouTube) {
            loadYouTubeSubtitles();
          }
        }

        // Look for native subtitle containers that we can extract text from
        detectNativeSubtitles();
      }
    });

    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
  }

  // Detect available subtitle tracks
  async function detectAvailableTracks() {
    availableTracks = [];

    // Default CC option
    availableTracks.push({
      id: 'cc',
      label: 'Closed Captions (CC)'
    });

    if (!videoElement) {
      videoElement = findVideoElement();
      if (!videoElement) {
        log('No video element found for track detection');
        return;
      }
    }

    // For YouTube, try to get tracks from our YouTube subtitle loader
    if (isYouTube) {
      try {
        const videoId = extractYouTubeVideoIdFromUrl(window.location.href);
        if (videoId) {
          // Fetch the video page to get subtitle information
          const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
          const html = await response.text();

          // Extract ytInitialPlayerResponse JSON from HTML
          const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
          if (playerResponseMatch) {
            const playerResponse = JSON.parse(playerResponseMatch[1]);
            const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

            if (captionTracks && captionTracks.length > 0) {
              log('Found YouTube subtitle tracks:', captionTracks.length);

              // Add each track to available tracks
              captionTracks.forEach((track, index) => {
                const trackId = `youtube_${index}`;
                const trackLabel = `${track.name.simpleText} (${track.languageCode})`;

                // Only add if not already in the list
                if (!availableTracks.some(t => t.id === trackId)) {
                  availableTracks.push({
                    id: trackId,
                    label: trackLabel
                  });
                }
              });

              // Store the tracks for later use
              youtubeSubtitleTracks = captionTracks.map((track, index) => ({
                id: `youtube_${index}`,
                index: index,
                languageCode: track.languageCode,
                name: track.name.simpleText,
                baseUrl: track.baseUrl,
                isDefault: !!track.isDefault
              }));
            }
          }
        }
      } catch (e) {
        log('Error detecting YouTube subtitle tracks:', e);
      }
    }

    // Try to get tracks from video element
    if (videoElement.textTracks && videoElement.textTracks.length > 0) {
      const tracks = Array.from(videoElement.textTracks);
      log('Found text tracks on video element:', tracks.length);

      tracks.forEach((track, index) => {
        const trackId = `subtitle${index + 1}`;
        const trackLabel = track.label || track.language || `Track ${index + 1}`;

        // Only add if not already in the list
        if (!availableTracks.some(t => t.id === trackId)) {
          availableTracks.push({
            id: trackId,
            label: trackLabel
          });
        }
      });
    }

    log('Available tracks:', availableTracks);
  }

  // YouTube-specific subtitle detection
  function detectYouTubeSubtitles() {
    // Try to access YouTube player API
    if (typeof document.querySelector('.html5-video-player') !== 'undefined') {
      const ytPlayer = document.querySelector('.html5-video-player');

      // Look for subtitle menu button and simulate a click to populate tracks
      const subtitleButton = document.querySelector('.ytp-subtitles-button');
      if (subtitleButton) {
        log('Found YouTube subtitle button');

        // Look for existing subtitle menu items
        const settingsButton = document.querySelector('.ytp-settings-button');
        if (settingsButton) {
          // Click settings button to open menu
          try {
            settingsButton.click();

            // Look for subtitle menu item
            setTimeout(() => {
              const subtitleMenuItem = Array.from(document.querySelectorAll('.ytp-menuitem')).find(
                item => item.textContent.includes('Subtitles/CC') || item.textContent.includes('Caption')
              );

              if (subtitleMenuItem) {
                subtitleMenuItem.click();

                // Now the caption options should be showing
                setTimeout(() => {
                  const captionOptions = document.querySelectorAll('.ytp-menuitem');
                  if (captionOptions.length > 0) {
                    log('Found YouTube caption options', captionOptions.length);

                    captionOptions.forEach((option, index) => {
                      const label = option.textContent.trim();
                      if (label && !label.includes('Off')) {
                        // Only add if not already in the list
                        if (!availableTracks.some(t => t.label === `YouTube UI: ${label}`)) {
                          availableTracks.push({
                            id: `youtube_ui_${index}`,
                            label: `YouTube UI: ${label}`
                          });
                        }
                      }
                    });
                  }

                  // Close the menu by clicking outside
                  document.querySelector('.ytp-popup').click();
                }, 100);
              } else {
                // Close the menu
                settingsButton.click();
              }
            }, 100);
          } catch (e) {
            log('Error accessing YouTube captions menu', e);
          }
        }
      }
    }
  }

  // Set up the subtitle display elements
  function setupSubtitleDisplay() {
    // Find the video element if not already found
    if (!videoElement) {
      videoElement = findVideoElement();
      if (!videoElement) {
        log('No video element found, retrying later');
        setTimeout(setupSubtitleDisplay, 1000);
        return;
      }
    }

    log('Setting up subtitle display for video', videoElement);

    // Create container for subtitles if not already created
    if (!subtitleContainer) {
      subtitleContainer = document.createElement('div');
      subtitleContainer.className = 'dual-subtitles-container';
      subtitleContainer.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: ${settings.position}%;
      transform: translateX(-50%);
      z-index: 9999;
      text-align: center;
      pointer-events: auto;
      width: 100%;
      max-width: 80%;
      display: flex;
      flex-direction: column;
      gap: ${settings.gap}px;
    `;
      document.body.appendChild(subtitleContainer);

      // Add mouse events to container for video control
      subtitleContainer.addEventListener('mouseenter', () => {
        if (videoElement && !videoElement.paused) {
          videoElement.pause();
          console.log('Video paused');
        }
      });

      subtitleContainer.addEventListener('mouseleave', () => {
        if (videoElement && videoElement.paused) {
          videoElement.play();
          console.log('Video playing');
        }
      });

      // Create elements for each subtitle track
      subtitle1Element = document.createElement('div');
      subtitle1Element.className = 'subtitle-track subtitle-track-1';
      subtitle1Element.style.cssText = `
        padding: 5px 10px;
        border-radius: 4px;
        display: none;
        font-size: ${settings.subtitle1.fontSize}px;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
        pointer-events: auto;
        cursor: pointer;
        background: rgba(0, 0, 0, 0.5);
      `;
      applySubtitleStyles(subtitle1Element, settings.subtitle1);
      subtitleContainer.appendChild(subtitle1Element);

      subtitle2Element = document.createElement('div');
      subtitle2Element.className = 'subtitle-track subtitle-track-2';
      subtitle2Element.style.cssText = `
        padding: 5px 10px;
        border-radius: 4px;
        display: none;
        font-size: ${settings.subtitle2.fontSize}px;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
        pointer-events: auto;
        cursor: pointer;
        background: rgba(0, 0, 0, 0.5);
      `;
      applySubtitleStyles(subtitle2Element, settings.subtitle2);
      subtitleContainer.appendChild(subtitle2Element);

      log('Created subtitle container elements');
    }

    // Set up both methods of subtitle extraction
    setupTextTrackObservers();
    detectNativeSubtitles();

    // Add video event listeners
    videoElement.addEventListener('play', onVideoEvent);
    videoElement.addEventListener('seeked', onVideoEvent);
    videoElement.addEventListener('timeupdate', updateSubtitleContent);

    // If we're on YouTube, try to load YouTube subtitles
    if (isYouTube) {
      loadYouTubeSubtitles();
    }
  }

  // Handle video events
  function onVideoEvent(event) {
    log('Video event', event.type);
    // Refresh subtitle detection when video state changes
    setTimeout(() => {
      updateSubtitleContent();
      detectNativeSubtitles();

      // If URL changed (YouTube SPA navigation), reload YouTube subtitles
      if (isYouTube && event.type === 'play') {
        const videoId = extractYouTubeVideoIdFromUrl(window.location.href);
        if (videoId) {
          loadYouTubeSubtitles();
        }
      }
    }, 500);
  }

  // Apply styles to subtitle elements
  function applySubtitleStyles(element, subtitleSettings) {
    element.style.color = subtitleSettings.color;
    element.style.backgroundColor = hexToRgba(subtitleSettings.background, subtitleSettings.opacity);
  }

  // Convert hex color to rgba for opacity
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // Find the main video element on the page
  function findVideoElement() {
    // First try to find the largest video
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    log('Found video elements', videos.length);

    // For YouTube, prefer the main player video
    if (isYouTube) {
      const ytVideo = document.querySelector('.html5-main-video');
      if (ytVideo) {
        log('Found YouTube main video');
        return ytVideo;
      }
    }

    // Sort by size (height * width) and return the largest
    videos.sort((a, b) => {
      const areaA = a.offsetWidth * a.offsetHeight;
      const areaB = b.offsetWidth * b.offsetHeight;
      return areaB - areaA;
    });

    return videos[0];
  }

  // Look for native subtitle elements on the page
  function detectNativeSubtitles() {
    if (!settings.enabled) return;

    // Common subtitle container selectors for popular streaming platforms
    const subtitleSelectors = [
      // YouTube - More specific selectors for YouTube
      '.ytp-caption-segment',
      '.caption-window .captions-text .caption-visual-line .caption-visual-text',
      '.captions-text span',
      // Netflix
      '.player-timedtext-text-container',
      // Amazon Prime
      '.atvwebplayersdk-captions-text',
      // Hulu
      '.closed-caption-container',
      // Disney+
      '.atv-subtitle-span',
      // General video players
      '.vjs-text-track-display',
      '.mejs-captions-text',
      '.fp-captions',
      // Generic selectors that might contain subtitles
      '[class*="caption"]',
      '[class*="subtitle"]',
      '[id*="caption"]',
      '[id*="subtitle"]'
    ];

    let subtitleElements = [];

    // Try each selector
    for (const selector of subtitleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        subtitleElements = [...subtitleElements, ...Array.from(elements)];
      }
    }

    if (subtitleElements.length > 0) {
      log('Found native subtitle elements', subtitleElements.length);

      // Set up observer for each potential subtitle element
      if (nativeSubtitleObserver) {
        nativeSubtitleObserver.disconnect();
      }

      nativeSubtitleObserver = new MutationObserver((mutations) => {
        // Extract text from the subtitle elements
        extractNativeSubtitles(subtitleElements);
      });

      // Start observing the subtitle elements
      subtitleElements.forEach(element => {
        nativeSubtitleObserver.observe(element, {
          childList: true,
          subtree: true,
          characterData: true
        });
      });

      // Initial extraction
      extractNativeSubtitles(subtitleElements);
    } else {
      log('No native subtitle elements found with standard selectors');

      // Special handling for YouTube if no elements found with standard selectors
      if (isYouTube) {
        const ytCaptionWindow = document.querySelector('.caption-window');
        if (ytCaptionWindow) {
          log('Found YouTube caption window', ytCaptionWindow);

          if (nativeSubtitleObserver) {
            nativeSubtitleObserver.disconnect();
          }

          nativeSubtitleObserver = new MutationObserver((mutations) => {
            const captionTexts = ytCaptionWindow.querySelectorAll('.captions-text span');
            if (captionTexts.length > 0) {
              let subtitleText = '';
              captionTexts.forEach(span => {
                subtitleText += span.textContent + ' ';
              });

              // Use the extracted text based on the selected source
              if (settings.subtitle1.source === 'cc' || settings.subtitle1.source.startsWith('youtube_ui_')) {
                subtitle1Element.textContent = subtitleText.trim();
                subtitle1Element.style.display = 'inline-block';
                log('Updated YouTube subtitle 1 text', subtitleText);
              }

              if (settings.subtitle2.source === 'cc' || settings.subtitle2.source.startsWith('youtube_ui_')) {
                subtitle2Element.textContent = subtitleText.trim();
                subtitle2Element.style.display = 'inline-block';
                log('Updated YouTube subtitle 2 text', subtitleText);
              }
            }
          });

          nativeSubtitleObserver.observe(ytCaptionWindow, {
            childList: true,
            subtree: true,
            characterData: true
          });
        }
      }
    }
  }

  // Extract text from native subtitle elements
  function extractNativeSubtitles(elements) {
    if (!subtitle1Element || !subtitle2Element) return;

    // Get text from the first element for subtitle 1 based on source
    if (settings.subtitle1.source === 'cc' && elements[0] && elements[0].textContent.trim()) {
      subtitle1Element.textContent = elements[0].textContent.trim();
      subtitle1Element.style.display = 'inline-block';
      log('Updated subtitle 1 text from native', subtitle1Element.textContent);
    }

    // Get text from the second element for subtitle 2 based on source
    if (settings.subtitle2.source === 'cc' && elements[0] && elements[0].textContent.trim()) {
      // If there's a second subtitle element, use it, otherwise use the first one
      if (elements[1] && elements[1].textContent.trim()) {
        subtitle2Element.textContent = elements[1].textContent.trim();
      } else {
        subtitle2Element.textContent = elements[0].textContent.trim();
      }
      subtitle2Element.style.display = 'inline-block';
      log('Updated subtitle 2 text from native', subtitle2Element.textContent);
    }
  }

  // Setup observers for text track changes
  function setupTextTrackObservers() {
    if (!videoElement) return;

    // Check if textTracks is available
    if (videoElement.textTracks) {
      log('Setting up textTrack observers', videoElement.textTracks.length);

      // Watch for changes in the textTracks
      if (subtitleObserver) {
        subtitleObserver.disconnect();
      }

      subtitleObserver = new MutationObserver((mutations) => {
        updateSubtitleContent();
      });

      // Start observing textTracks
      try {
        subtitleObserver.observe(videoElement.textTracks, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
      } catch (e) {
        log('Error observing textTracks', e);
      }

      // Set up initial state
      setupTextTracks();

      // Also listen for cuechange events on each track
      try {
        Array.from(videoElement.textTracks).forEach(track => {
          track.addEventListener('cuechange', updateSubtitleContent);
        });
      } catch (e) {
        log('Error adding cuechange listeners', e);
      }
    } else {
      log('No textTracks found on video element');
    }

    // Listen for the 'timeupdate' event as a fallback
    videoElement.addEventListener('timeupdate', () => {
      if (!subtitle1Element.textContent && !subtitle2Element.textContent) {
        updateSubtitleContent();
      }
    });
  }

  // Setup the text tracks based on selected sources
  function setupTextTracks() {
    if (!videoElement || !videoElement.textTracks) return;

    const tracks = Array.from(videoElement.textTracks);
    log('Available text tracks', tracks.length);

    if (tracks.length === 0) {
      // No tracks found, retry later
      setTimeout(setupTextTracks, 2000);
      return;
    }

    // Log details of each track
    tracks.forEach((track, index) => {
      log(`Track ${index}: kind=${track.kind}, label=${track.label}, language=${track.language}, mode=${track.mode}`);
    });

    // Disable all tracks first to avoid browser's native subtitle display
    tracks.forEach(track => {
      try {
        track.mode = 'hidden';
      } catch (e) {
        log('Error setting track mode', e);
      }
    });

    // Reset active tracks
    activeTextTracks = {};

    // Map source selection to actual track
    function findTrackBySource(source) {
      // Handle different source types
      if (source === 'cc') {
        // Try to find a CC track (often the first or has 'captions' kind)
        return tracks.find(t => t.kind === 'captions') || tracks[0];
      } else if (source.startsWith('youtube_')) {
        // Find YouTube track by ID
        return tracks.find(t => t.youtubeTrack && t.youtubeTrack.id === source);
      } else if (source.startsWith('subtitle')) {
        // Get track by index - subtitle1 would be tracks[0], subtitle2 would be tracks[1], etc.
        const index = parseInt(source.replace('subtitle', '')) - 1;
        return tracks[index >= 0 && index < tracks.length ? index : 0] || null;
      }
      return null;
    }

    // Set up active tracks
    const track1 = findTrackBySource(settings.subtitle1.source);
    const track2 = findTrackBySource(settings.subtitle2.source);

    if (track1) {
      try {
        track1.mode = 'hidden';
        activeTextTracks.track1 = track1;
        log('Selected track 1', track1.label || track1.language || 'Unnamed track');
      } catch (e) {
        log('Error setting track1', e);
      }
    }

    if (track2) {
      try {
        track2.mode = 'hidden';
        activeTextTracks.track2 = track2;
        log('Selected track 2', track2.label || track2.language || 'Unnamed track');
      } catch (e) {
        log('Error setting track2', e);
      }
    }

    // Initial update
    updateSubtitleContent();
  }

  // Clean word of special characters
  function cleanWord(word) {
    return word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]'"<>?]/g, '');
  }

  // Update the content of the subtitle elements from text tracks
  function updateSubtitleContent() {
    if (!subtitle1Element || !subtitle2Element) return;

    // Update subtitle 1
    if (activeTextTracks.track1) {
      try {
        const hasCues = activeTextTracks.track1.activeCues && activeTextTracks.track1.activeCues.length > 0;
        if (hasCues) {
          const cue = activeTextTracks.track1.activeCues[0];
          if (cue.text) {
            // Wrap each word in a span
            const wrappedText = cue.text.split(/\s+/).map(word =>
              `<span class="subtitle-word">${word}</span>`
            ).join(' ');
            subtitle1Element.innerHTML = wrappedText;
            subtitle1Element.style.display = 'inline-block';

            // Add hover listeners to each word
            subtitle1Element.querySelectorAll('.subtitle-word').forEach(span => {
              span.onmouseover = function () {
                const cleanedWord = cleanWord(this.textContent);
                if (cleanedWord) {  // Only log if there's something left after cleaning
                  console.log(cleanedWord);
                }
              };
            });
          }
        } else {
          subtitle1Element.style.display = 'none';
        }
      } catch (e) {
        console.error('Error updating subtitle 1:', e);
      }
    }

    // Update subtitle 2
    if (activeTextTracks.track2) {
      try {
        const hasCues = activeTextTracks.track2.activeCues && activeTextTracks.track2.activeCues.length > 0;
        if (hasCues) {
          const cue = activeTextTracks.track2.activeCues[0];
          if (cue.text) {
            // Wrap each word in a span
            const wrappedText = cue.text.split(/\s+/).map(word =>
              `<span class="subtitle-word">${word}</span>`
            ).join(' ');
            subtitle2Element.innerHTML = wrappedText;
            subtitle2Element.style.display = 'inline-block';

            // Add hover listeners to each word
            subtitle2Element.querySelectorAll('.subtitle-word').forEach(span => {
              span.onmouseover = function () {
                const cleanedWord = cleanWord(this.textContent);
                if (cleanedWord) {  // Only log if there's something left after cleaning
                  console.log(cleanedWord);
                }
              };
            });
          }
        } else {
          subtitle2Element.style.display = 'none';
        }
      } catch (e) {
        console.error('Error updating subtitle 2:', e);
      }
    }

    // Check for cases where second subtitle is a copy of the first
    if (settings.subtitle2.source === 'subtitle1' && subtitle1Element.textContent) {
      const wrappedText = subtitle1Element.innerHTML;
      subtitle2Element.innerHTML = wrappedText;
      subtitle2Element.style.display = 'inline-block';

      // Add hover listeners to each word in subtitle 2
      subtitle2Element.querySelectorAll('.subtitle-word').forEach(span => {
        span.onmouseover = function () {
          const cleanedWord = cleanWord(this.textContent);
          if (cleanedWord) {  // Only log if there's something left after cleaning
            console.log(cleanedWord);
          }
        };
      });
    }
  }

  // Update the display based on new settings
  function updateSubtitleDisplay() {
    if (!subtitleContainer || !subtitle1Element || !subtitle2Element) return;

    // Update styles
    applySubtitleStyles(subtitle1Element, settings.subtitle1);
    applySubtitleStyles(subtitle2Element, settings.subtitle2);

    // Update position
    subtitleContainer.style.bottom = `${settings.position}%`;
    subtitleContainer.style.gap = `${settings.gap}px`;

    // Force refresh active tracks
    setupTextTracks();

    // Force refresh of subtitle content
    updateSubtitleContent();

    log('Updated subtitle display with new settings');
  }

  // Remove the subtitle display
  function removeSubtitleDisplay() {
    log('Removing subtitle display');

    // Clean up event listeners
    if (videoElement) {
      videoElement.removeEventListener('play', onVideoEvent);
      videoElement.removeEventListener('seeked', onVideoEvent);
      videoElement.removeEventListener('timeupdate', updateSubtitleContent);
    }

    // Remove observers
    if (subtitleObserver) {
      subtitleObserver.disconnect();
    }

    if (nativeSubtitleObserver) {
      nativeSubtitleObserver.disconnect();
    }

    if (domObserver) {
      domObserver.disconnect();
    }

    // Remove subtitle elements
    if (subtitleContainer) {
      subtitleContainer.remove();
      subtitleContainer = null;
      subtitle1Element = null;
      subtitle2Element = null;
    }

    // Reset variables
    activeTextTracks = {};

    log('Subtitle display removed');
  }

  function updateSubtitleStyles(settings) {
    const subtitle1 = document.querySelector('.subtitle-track-1');
    const subtitle2 = document.querySelector('.subtitle-track-2');

    if (subtitle1) {
      subtitle1.style.color = settings.subtitle1.color;
      subtitle1.style.backgroundColor = hexToRgba(settings.subtitle1.background, settings.subtitle1.opacity);
      subtitle1.style.fontSize = `${settings.subtitle1.fontSize}px`;
    }

    if (subtitle2) {
      subtitle2.style.color = settings.subtitle2.color;
      subtitle2.style.backgroundColor = hexToRgba(settings.subtitle2.background, settings.subtitle2.opacity);
      subtitle2.style.fontSize = `${settings.subtitle2.fontSize}px`;
    }

    // If source settings are included, update the tracks
    if (settings.subtitle1 && settings.subtitle1.source) {
      setupTextTracks();
      updateSubtitleContent();
    }
  }

  // Handle hover events on subtitle elements
  function handleSubtitleHover(event) {
    console.log('Hover event triggered');
    const text = event.target.textContent;
    console.log('Subtitle text:', text);

    const words = text.split(/\s+/);
    console.log('Words in subtitle:', words);

    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    console.log('Mouse position:', { x, y });
    console.log('Element bounds:', rect);

    const word = words.find(word => {
      // Create a temporary span to measure word positions
      const tempSpan = document.createElement('span');
      tempSpan.style.visibility = 'hidden';
      tempSpan.style.position = 'absolute';
      tempSpan.style.font = window.getComputedStyle(event.target).font;
      tempSpan.textContent = word;
      document.body.appendChild(tempSpan);

      const wordWidth = tempSpan.offsetWidth;
      document.body.removeChild(tempSpan);

      // Approximate word position based on character count
      const charCount = text.substring(0, text.indexOf(word)).length;
      const charWidth = rect.width / text.length;
      const wordStartX = charCount * charWidth;

      console.log('Checking word:', word, {
        wordWidth,
        charCount,
        charWidth,
        wordStartX,
        isHovered: x >= wordStartX && x <= wordStartX + wordWidth
      });

      return x >= wordStartX && x <= wordStartX + wordWidth;
    });

    if (word) {
      console.log('Hovered word:', word);
    } else {
      console.log('No word detected at hover position');
    }
  }

  // Initialize when the content script is loaded
  initialize();
})();