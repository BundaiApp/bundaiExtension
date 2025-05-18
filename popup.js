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
      opacity: 0.7
    },
    subtitle2: {
      source: 'subtitle1',
      color: '#ffffff',
      background: '#000000',
      opacity: 0.7
    },
    position: 25 // % from bottom
  }, function (items) {
    // Set values based on saved settings
    document.getElementById('subtitle1-color').value = items.subtitle1.color;
    document.getElementById('subtitle1-bg').value = items.subtitle1.background;
    document.getElementById('subtitle1-opacity').value = items.subtitle1.opacity;

    document.getElementById('subtitle2-color').value = items.subtitle2.color;
    document.getElementById('subtitle2-bg').value = items.subtitle2.background;
    document.getElementById('subtitle2-opacity').value = items.subtitle2.opacity;

    document.getElementById('top-position').value = items.position;

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
        opacity: parseFloat(document.getElementById('subtitle1-opacity').value)
      },
      subtitle2: {
        source: document.getElementById('subtitle2-source').value,
        color: document.getElementById('subtitle2-color').value,
        background: document.getElementById('subtitle2-bg').value,
        opacity: parseFloat(document.getElementById('subtitle2-opacity').value)
      },
      position: parseInt(document.getElementById('top-position').value)
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

  // Add event listeners for all settings fields
  const settingsFields = [
    'subtitle1-source', 'subtitle1-color', 'subtitle1-bg', 'subtitle1-opacity',
    'subtitle2-source', 'subtitle2-color', 'subtitle2-bg', 'subtitle2-opacity',
    'top-position'
  ];

  settingsFields.forEach(field => {
    document.getElementById(field).addEventListener('change', saveSettings);
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