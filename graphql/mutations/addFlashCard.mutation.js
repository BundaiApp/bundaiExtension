const { gql } = require("@apollo/client");

const addFlashCardMutation = gql`
  mutation AddFlashCard(
    $userId: String
    $kanjiName: String
    $hiragana: String
    $meanings: [String]
    $quizAnswers: [String]
  ) {
    addFlashCard(
      userId: $userId
      kanjiName: $kanjiName
      hiragana: $hiragana
      meanings: $meanings
      quizAnswers: $quizAnswers
    ) {
      userId
      kanjiName
      hiragana
      meanings
      quizAnswers
    }
  }
`;

module.exports = addFlashCardMutation;
