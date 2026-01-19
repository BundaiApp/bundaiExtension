import { gql, useMutation } from "@apollo/client"

import client from "~graphql"

const GET_AUTO_TRANSCRIPT = gql`
  query GetAutoTranscript($videoId: String!, $language: String) {
    getAutoTranscript(videoId: $videoId, language: $language) {
      videoId
      language
      vtt
      segmentCount
      success
      error
    }
  }
`

export function useAutoSubtitle(videoId: string, language: string = "ja") {
  const [fetchAutoTranscript, { loading, data, error }] =
    useMutation(GET_AUTO_TRANSCRIPT)

  const fetch = async () => {
    if (!videoId) return

    try {
      const result = await fetchAutoTranscript({
        variables: { videoId, language }
      })

      console.log("[useAutoSubtitle] Auto transcript result:", result)

      return result.data?.getAutoTranscript
    } catch (err) {
      console.error("[useAutoSubtitle] Error fetching auto transcript:", err)
      return null
    }
  }

  return {
    fetch,
    loading,
    data: data?.getAutoTranscript || null,
    error
  }
}
