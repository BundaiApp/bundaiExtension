import { useState, useEffect } from 'react';

interface SubtitlesSectionProps {
  subtitles: Record<string, string[]>;
  subtitleLoading: boolean;
  error: string | null;
}

const SubtitlesSection: React.FC<SubtitlesSectionProps> = ({ subtitles, subtitleLoading, error }) => {
  // States to store the selected subtitle URLs
  const [selectedSubtitle1, setSelectedSubtitle1] = useState<string | null>(null);
  const [selectedSubtitle2, setSelectedSubtitle2] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>('');

  // Function to send subtitle URL to content script
  const loadSubtitleInContentScript = async (url: string, trackNumber: 1 | 2) => {
    try {
      setLoadingStatus(`Loading subtitle ${trackNumber}...`);
      
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'loadSubtitle',
        url: url,
        trackNumber: trackNumber
      });

      if (response.success) {
        setLoadingStatus(`Subtitle ${trackNumber} loaded successfully!`);
        setTimeout(() => setLoadingStatus(''), 3000); // Clear status after 3 seconds
      } else {
        throw new Error(response.error || 'Failed to load subtitle');
      }
    } catch (error) {
      console.error('Error loading subtitle:', error);
      setLoadingStatus(`Error loading subtitle ${trackNumber}: ${error.message}`);
      setTimeout(() => setLoadingStatus(''), 5000);
    }
  };

  // Handle changing Subtitle 1 selection
  const handleSubtitle1Change = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const url = event.target.value;
    setSelectedSubtitle1(url);
    
    if (url) {
      await loadSubtitleInContentScript(url, 1);
    }
  };

  // Handle changing Subtitle 2 selection
  const handleSubtitle2Change = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const url = event.target.value;
    setSelectedSubtitle2(url);
    
    if (url) {
      await loadSubtitleInContentScript(url, 2);
    }
  };

  // Auto-load subtitles when they become available
  useEffect(() => {
    if (subtitles && Object.keys(subtitles).length > 0 && !selectedSubtitle1 && !selectedSubtitle2) {
      // Auto-select first two different language subtitles if available
      const languages = Object.keys(subtitles);
      if (languages.length >= 2) {
        const firstLangUrl = subtitles[languages[0]][0];
        const secondLangUrl = subtitles[languages[1]][0];
        
        setSelectedSubtitle1(firstLangUrl);
        setSelectedSubtitle2(secondLangUrl);
        
        // Auto-load both subtitles
        loadSubtitleInContentScript(firstLangUrl, 1);
        loadSubtitleInContentScript(secondLangUrl, 2);
      } else if (languages.length === 1) {
        // If only one language, use it for subtitle 1
        const firstLangUrl = subtitles[languages[0]][0];
        setSelectedSubtitle1(firstLangUrl);
        loadSubtitleInContentScript(firstLangUrl, 1);
      }
    }
  }, [subtitles]);

  return (
    <div className="mt-4">
      <h3 className="text-black font-bold">Available Subtitles</h3>

      {subtitleLoading && <p className="text-xs text-gray-800">Loading subtitles...</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {loadingStatus && (
        <p className={`text-xs ${loadingStatus.includes('Error') ? 'text-red-700' : 'text-green-700'}`}>
          {loadingStatus}
        </p>
      )}

      {subtitles && Object.keys(subtitles).length > 0 ? (
        <div className="max-h-40 overflow-auto text-xs mt-2">
          {/* Dropdown for Subtitle 1 */}
          <div className="mb-4">
            <label className="font-semibold text-black block">Subtitle 1 (Top)</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              value={selectedSubtitle1 || ''}
              onChange={handleSubtitle1Change}
            >
              <option value="">Select Subtitle</option>
              {Object.entries(subtitles).map(([lang, urls]) => (
                // Show the language directly with available formats
                urls.map((url, index) => (
                  <option key={`${lang}-${index}`} value={url}>
                    {lang.toUpperCase()} - Format {index + 1}
                  </option>
                ))
              ))}
            </select>
          </div>

          {/* Dropdown for Subtitle 2 */}
          <div className="mb-4">
            <label className="font-semibold text-black block">Subtitle 2 (Bottom)</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
              value={selectedSubtitle2 || ''}
              onChange={handleSubtitle2Change}
            >
              <option value="">Select Subtitle</option>
              {Object.entries(subtitles).map(([lang, urls]) => (
                // Show the language directly with available formats
                urls.map((url, index) => (
                  <option key={`${lang}-${index}`} value={url}>
                    {lang.toUpperCase()} - Format {index + 1}
                  </option>
                ))
              ))}
            </select>
          </div>

          {/* Control buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setSelectedSubtitle1(null);
                setSelectedSubtitle2(null);
              }}
              className="px-3 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
            >
              Clear All
            </button>
            <button
              onClick={() => {
                if (selectedSubtitle1) loadSubtitleInContentScript(selectedSubtitle1, 1);
                if (selectedSubtitle2) loadSubtitleInContentScript(selectedSubtitle2, 2);
              }}
              className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
              disabled={!selectedSubtitle1 && !selectedSubtitle2}
            >
              Reload Subtitles
            </button>
          </div>

          {/* Display selected subtitles */}
          <div className="mt-4 p-3 bg-gray-100 rounded">
            <h4 className="text-black font-semibold mb-2">Currently Loaded</h4>
            <div className="space-y-1">
              <p className="text-xs">
                <strong>Top Subtitle: </strong>
                {selectedSubtitle1 ? (
                  <span className="text-green-600">
                    {Object.entries(subtitles).find(([lang, urls]) => 
                      urls.includes(selectedSubtitle1)
                    )?.[0]?.toUpperCase() || 'Selected'}
                  </span>
                ) : (
                  <span className="text-gray-500">None selected</span>
                )}
              </p>
              <p className="text-xs">
                <strong>Bottom Subtitle: </strong>
                {selectedSubtitle2 ? (
                  <span className="text-green-600">
                    {Object.entries(subtitles).find(([lang, urls]) => 
                      urls.includes(selectedSubtitle2)
                    )?.[0]?.toUpperCase() || 'Selected'}
                  </span>
                ) : (
                  <span className="text-gray-500">None selected</span>
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        !subtitleLoading && <p className="text-xs text-gray-800">No subtitles found.</p>
      )}
    </div>
  );
};

export default SubtitlesSection;