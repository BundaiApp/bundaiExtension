// getYtSubs.js
async function getSubtitles(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        const html = await response.text();

        // Extract ytInitialPlayerResponse JSON from HTML
        const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
        if (!playerResponseMatch) {
            console.error('Could not find player response in HTML.');
            return [];
        }

        const playerResponseJson = playerResponseMatch[1];
        const playerResponse = JSON.parse(playerResponseJson);

        const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!captionTracks) {
            console.log('No subtitles available for this video.');
            return [];
        }

        return captionTracks.map((track, index) => ({
            id: `youtube_${index}`,
            index: index,
            languageCode: track.languageCode,
            name: track.name.simpleText,
            baseUrl: track.baseUrl,
            isDefault: !!track.isDefault
        }));
    } catch (err) {
        console.error('Error:', err.message);
        return [];
    }
}

// Export the function
window.dualSubtitles = window.dualSubtitles || {};
window.dualSubtitles.getSubtitles = getSubtitles;
