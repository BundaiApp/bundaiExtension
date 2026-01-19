import { gql, useMutation, useQuery } from "@apollo/client"

import client from "~graphql"

const GET_TRANSCRIPT = gql`
  query GetTranscript($videoId: String!, $language: String) {
    getTranscript(videoId: $videoId, language: $language) {
      videoId
      language
      vtt
      segmentCount
      success
      error
    }
  }
`

type UseSubtitleResult = {
  transcript: {
    videoId: string
    language: string
    vtt: string
    segmentCount: number
    success: boolean
    error: string | null
  } | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useSubtitle(
  videoId: string,
  language: string = "ja"
): UseSubtitleResult {
  const { data, loading, error, refetch } = useQuery(GET_TRANSCRIPT, {
    variables: { videoId, language },
    skip: !videoId,
    fetchPolicy: "cache-first"
  })

  return {
    transcript: data?.getTranscript || null,
    loading,
    error: error?.message || null,
    refetch
  }
}
