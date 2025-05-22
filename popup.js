// popup.js
document.addEventListener('DOMContentLoaded', function () {
  // Populate subtitle source options dynamically based on detected tracks
  function updateSubtitleOptions() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'getSubtitleTracks'
      }, function (response) {
        if (response && response.tracks) {
          const subtitle1Select = document.getElementById('subtitle1-source');
          const subtitle2Select = document.getElementById('subtitle2-source');

          // Clear all options
          subtitle1Select.innerHTML = '';
          subtitle2Select.innerHTML = '';

          // Add default CC option
          const ccOption = document.createElement('option');
          ccOption.value = 'cc';
          ccOption.textContent = 'Closed Captions (CC)';
          subtitle1Select.appendChild(ccOption);
          subtitle2Select.appendChild(ccOption.cloneNode(true));

          // Add available tracks
          response.tracks.forEach(track => {
            if (track.id !== 'cc') {  // Skip CC as we already added it
              const option1 = document.createElement('option');
              option1.value = track.id;
              option1.textContent = track.label;
              subtitle1Select.appendChild(option1);

              const option2 = option1.cloneNode(true);
              subtitle2Select.appendChild(option2);
            }
          });

          // Restore selected values if they exist
          chrome.storage.sync.get(['subtitle1', 'subtitle2'], function (items) {
            if (items.subtitle1 && items.subtitle1.source) {
              subtitle1Select.value = items.subtitle1.source;
            }
            if (items.subtitle2 && items.subtitle2.source) {
              subtitle2Select.value = items.subtitle2.source;
            }
          });
        }
      });
    });
  }

  // Load saved settings
  chrome.storage.sync.get({
    enabled: false,
    subtitle1: {
      source: 'cc',
      color: '#ffffff',
      background: '#000000',
      opacity: 0.7,
      fontSize: 22
    },
    subtitle2: {
      source: 'subtitle1',
      color: '#ffffff',
      background: '#000000',
      opacity: 0.7,
      fontSize: 22
    },
    position: 25, // % from bottom
    gap: 20, // pixels between subtitles
    wordCard: {
      backgroundColor: '#000000',
      backgroundOpacity: 0.9,
      textColor: '#ffffff',
      borderRadius: 8,
      padding: 16,
      shadowIntensity: 12
    }
  }, function (items) {
    // Set values based on saved settings
    document.getElementById('subtitle1-color').value = items.subtitle1.color;
    document.getElementById('subtitle1-bg').value = items.subtitle1.background;
    document.getElementById('subtitle1-opacity').value = items.subtitle1.opacity;
    document.getElementById('subtitle1-size').value = items.subtitle1.fontSize;

    document.getElementById('subtitle2-color').value = items.subtitle2.color;
    document.getElementById('subtitle2-bg').value = items.subtitle2.background;
    document.getElementById('subtitle2-opacity').value = items.subtitle2.opacity;
    document.getElementById('subtitle2-size').value = items.subtitle2.fontSize;

    document.getElementById('subtitle-gap').value = items.gap;
    document.getElementById('top-position').value = items.position;

    // Set word card values
    document.getElementById('card-bg').value = items.wordCard.backgroundColor;
    document.getElementById('card-opacity').value = items.wordCard.backgroundOpacity;
    document.getElementById('card-text-color').value = items.wordCard.textColor;
    document.getElementById('card-border-radius').value = items.wordCard.borderRadius;
    document.getElementById('card-padding').value = items.wordCard.padding;
    document.getElementById('card-shadow').value = items.wordCard.shadowIntensity;

    // Update button and status
    const toggleButton = document.getElementById('toggle-subtitles');
    const statusDiv = document.getElementById('status');

    if (items.enabled) {
      toggleButton.textContent = 'Disable Dual Subtitles';
      statusDiv.textContent = 'Dual Subtitles: Enabled';
      statusDiv.className = 'status enabled';
    } else {
      toggleButton.textContent = 'Enable Dual Subtitles';
      statusDiv.textContent = 'Dual Subtitles: Disabled';
      statusDiv.className = 'status disabled';
    }
  });

  // Save settings when changed
  function saveSettings() {
    const settings = {
      enabled: document.getElementById('status').classList.contains('enabled'),
      subtitle1: {
        source: document.getElementById('subtitle1-source').value,
        color: document.getElementById('subtitle1-color').value,
        background: document.getElementById('subtitle1-bg').value,
        opacity: parseFloat(document.getElementById('subtitle1-opacity').value),
        fontSize: parseInt(document.getElementById('subtitle1-size').value)
      },
      subtitle2: {
        source: document.getElementById('subtitle2-source').value,
        color: document.getElementById('subtitle2-color').value,
        background: document.getElementById('subtitle2-bg').value,
        opacity: parseFloat(document.getElementById('subtitle2-opacity').value),
        fontSize: parseInt(document.getElementById('subtitle2-size').value)
      },
      position: parseInt(document.getElementById('top-position').value),
      gap: parseInt(document.getElementById('subtitle-gap').value),
      wordCard: {
        backgroundColor: document.getElementById('card-bg').value,
        backgroundOpacity: parseFloat(document.getElementById('card-opacity').value),
        textColor: document.getElementById('card-text-color').value,
        borderRadius: parseInt(document.getElementById('card-border-radius').value),
        padding: parseInt(document.getElementById('card-padding').value),
        shadowIntensity: parseInt(document.getElementById('card-shadow').value)
      }
    };

    chrome.storage.sync.set(settings);

    // Send message to content script to update settings
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'updateSettings',
        settings: settings
      });
    });
  }

  // add event listeners for all settings fields
  const settingsFields = [
    'subtitle1-source', 'subtitle1-color', 'subtitle1-bg', 'subtitle1-opacity', 'subtitle1-size',
    'subtitle2-source', 'subtitle2-color', 'subtitle2-bg', 'subtitle2-opacity', 'subtitle2-size',
    'top-position', 'subtitle-gap',
    'card-bg', 'card-opacity', 'card-text-color', 'card-border-radius', 'card-padding', 'card-shadow'
  ];

  settingsFields.forEach(field => {
    const element = document.getElementById(field);
    if (element) {
      // For number inputs and range inputs, use 'input' event for real-time updates
      if (element.type === 'number' || element.type === 'range') {
        element.addEventListener('input', saveSettings);
      } else if (field.includes('source')) {
        // For source selectors, toggle enabled state
        element.addEventListener('change', () => {
          const statusDiv = document.getElementById('status');
          const isEnabled = statusDiv.classList.contains('enabled');

          if (isEnabled) {
            // Temporarily set enabled to false
            const settings = {
              enabled: false,
              subtitle1: {
                source: document.getElementById('subtitle1-source').value,
                color: document.getElementById('subtitle1-color').value,
                background: document.getElementById('subtitle1-bg').value,
                opacity: parseFloat(document.getElementById('subtitle1-opacity').value),
                fontSize: parseInt(document.getElementById('subtitle1-size').value)
              },
              subtitle2: {
                source: document.getElementById('subtitle2-source').value,
                color: document.getElementById('subtitle2-color').value,
                background: document.getElementById('subtitle2-bg').value,
                opacity: parseFloat(document.getElementById('subtitle2-opacity').value),
                fontSize: parseInt(document.getElementById('subtitle2-size').value)
              },
              position: parseInt(document.getElementById('top-position').value)
            };

            // Send disable message
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'updateSettings',
                settings: settings
              }, () => {
                // Immediately re-enable
                settings.enabled = true;
                chrome.tabs.sendMessage(tabs[0].id, {
                  action: 'updateSettings',
                  settings: settings
                });
              });
            });
          } else {
            // If not enabled, just save the settings
            saveSettings();
          }
        });
      } else {
        element.addEventListener('change', saveSettings);
      }
    }
  });

  // Toggle button action
  document.getElementById('toggle-subtitles').addEventListener('click', function () {
    const statusDiv = document.getElementById('status');
    const isEnabled = statusDiv.classList.contains('enabled');

    if (isEnabled) {
      this.textContent = 'Enable Dual Subtitles';
      statusDiv.textContent = 'Dual Subtitles: Disabled';
      statusDiv.className = 'status disabled';
    } else {
      this.textContent = 'Disable Dual Subtitles';
      statusDiv.textContent = 'Dual Subtitles: Enabled';
      statusDiv.className = 'status enabled';
    }

    saveSettings();
  });

  // Update subtitle options when popup opens
  updateSubtitleOptions();
});