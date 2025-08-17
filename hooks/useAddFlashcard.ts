import { useMutation } from "@apollo/client"
import { ADD_FLASH_CARD_MUTATION } from "../graphql/mutations/addFlashCard.mutation"
import { storage, storageReady } from "../utils/secure-storage"


function useAddFlashcard(entry: any, word: string, isLoading: boolean) {
  const [addFlashCard] = useMutation(ADD_FLASH_CARD_MUTATION)

  const handleAddFlashcard = async () => {
    if (!entry || isLoading || !word) return

    await storageReady
    const userId = await storage.get("userId")
    if (!userId) {
      console.log("No userId found in secure storage.")
      return
    }

    const kanjiName = entry.kanji && entry.kanji.length > 0 ? entry.kanji[0] : word
    const hiragana = entry.kana && entry.kana.length > 0 ? entry.kana[0] : word
    const meanings = entry.senses ? entry.senses.flatMap((s: any) => s.gloss).filter(Boolean) : []
    const quizAnswers = [
      ...(entry.kana || []),
      ...(entry.kanji || [])
    ].filter(Boolean)

    try {
      const result = await addFlashCard({
        variables: {
          userId,
          kanjiName,
          hiragana,
          meanings,
          quizAnswers
        }
      })
      console.log("Flashcard added:", result)
    } catch (err) {
      console.error("Failed to add flashcard:", err)
    }
  }

  return { handleAddFlashcard }
}