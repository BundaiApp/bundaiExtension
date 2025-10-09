import { useState, useEffect, useCallback } from 'react';

type Subtitles = {
  [languageCode: string]: string[]; // e.g. { "en": [url1, url2, ...] }
};

type UseSubtitleResult = {
  subtitles: Subtitles | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useSubtitle(videoId: string): UseSubtitleResult {
  const [subtitles, setSubtitles] = useState<Subtitles | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubtitles = useCallback(async () => {
    if (!videoId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch subtitles only in vtt format
      const res = await fetch(`https://api.bundai.app/subtitles/${videoId}?subtitle_format=vtt`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to fetch subtitles.');
      }

      const data: Subtitles = await res.json();
      setSubtitles(data);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
      setSubtitles(null);
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    fetchSubtitles();
  }, [fetchSubtitles]);

  return { subtitles, loading, error, refetch: fetchSubtitles };
}
