import { useState } from 'react';

const SubtitlesSection = ({ subtitles, subtitleLoading, error }) => {
  // States to store the selected subtitle URLs
  const [selectedSubtitle1, setSelectedSubtitle1] = useState<string | null>(null);
  const [selectedSubtitle2, setSelectedSubtitle2] = useState<string | null>(null);

  // Handle changing Subtitle 1 selection
  const handleSubtitle1Change = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSubtitle1(event.target.value);
  };

  // Handle changing Subtitle 2 selection
  const handleSubtitle2Change = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSubtitle2(event.target.value);
  };

  return (
    <div className="mt-4">
      <h3 className="text-black font-bold">Available Subtitles</h3>

      {subtitleLoading && <p className="text-xs text-gray-800">Loading subtitles...</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}

      {subtitles && Object.keys(subtitles).length > 0 ? (
        <div className="max-h-40 overflow-auto text-xs mt-2">
          {/* Dropdown for Subtitle 1 */}
          <div className="mb-4">
            <label className="font-semibold text-black block">Subtitle 1</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md"
              value={selectedSubtitle1 || ''}
              onChange={handleSubtitle1Change}
            >
              <option value="">Select Subtitle</option>
              {Object.entries(subtitles).map(([lang, urls]) => (
                // Show the language directly with available formats
                urls.map((url, index) => (
                  <option key={index} value={url}>
                    {lang.toUpperCase()} - Format {index + 1}
                  </option>
                ))
              ))}
            </select>
          </div>

          {/* Dropdown for Subtitle 2 */}
          <div className="mb-4">
            <label className="font-semibold text-black block">Subtitle 2</label>
            <select
              className="w-full p-2 border border-gray-300 rounded-md"
              value={selectedSubtitle2 || ''}
              onChange={handleSubtitle2Change}
            >
              <option value="">Select Subtitle</option>
              {Object.entries(subtitles).map(([lang, urls]) => (
                // Show the language directly with available formats
                urls.map((url, index) => (
                  <option key={index} value={url}>
                    {lang.toUpperCase()} - Format {index + 1}
                  </option>
                ))
              ))}
            </select>
          </div>

          {/* Display selected subtitles */}
          <div className="mt-4">
            <h4 className="text-black font-semibold">Selected Subtitles</h4>
            <p>
              <strong>Subtitle 1: </strong>
              {selectedSubtitle1 ? (
                <a href={selectedSubtitle1} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                  View Subtitle 1
                </a>
              ) : (
                <span>No subtitle selected</span>
              )}
            </p>
            <p>
              <strong>Subtitle 2: </strong>
              {selectedSubtitle2 ? (
                <a href={selectedSubtitle2} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                  View Subtitle 2
                </a>
              ) : (
                <span>No subtitle selected</span>
              )}
            </p>
          </div>
        </div>
      ) : (
        !subtitleLoading && <p className="text-xs text-gray-800">No subtitles found.</p>
      )}
    </div>
  );
};

export default SubtitlesSection;
