import { gql } from "@apollo/client"

export interface AddFlashCardVariables {
  userId?: string
  kanjiName?: string
  hiragana?: string
  meanings?: string[]
  quizAnswers?: string[]
  source?: string
}

export interface AddFlashCardResponse {
  addFlashCard: {
    userId: string
    kanjiName: string
    hiragana: string
    meanings: string[]
    quizAnswers: string[]
  }
}

export const ADD_FLASH_CARD_MUTATION = gql`
  mutation AddFlashCard(
    $userId: String
    $kanjiName: String
    $hiragana: String
    $meanings: [String]
    $quizAnswers: [String]
    $source: String
  ) {
    addFlashCard(
      userId: $userId
      kanjiName: $kanjiName
      hiragana: $hiragana
      meanings: $meanings
      quizAnswers: $quizAnswers
      source: $source
    ) {
      userId
      kanjiName
      hiragana
      meanings
      quizAnswers
    }
  }
`
