// Unified Dictionary Service - integrates FlatFileDictionary with Deinflection
// Provides simple lookup interface with automatic deinflection

import { toHiragana } from "wanakana"

import { deinflect } from "./deinflect"
import flatFileDictionary, { type JMDictEntry } from "./flat-file-dictionary"

export interface DictionaryEntry {
  word: string
  reading?: string
  meanings: string[]
  partOfSpeech?: string[]
  entry: JMDictEntry
  alternates?: JMDictEntry[]
  isExact: boolean
  deinflectReasons?: string[]
}

export interface DictionaryService {
  lookup(word: string, options?: LookupOptions): Promise<DictionaryEntry | null>
  lookupWithDeinflect(
    word: string,
    options?: LookupOptions
  ): Promise<DictionaryEntry | null>
  initialize(): Promise<void>
  isReady(): boolean
}

export interface LookupOptions {
  reading?: string
  pos?: string
  posDetail1?: string
  contextBefore?: string
  contextAfter?: string
  spansMultipleTokens?: boolean
}

class UnifiedDictionaryService implements DictionaryService {
  private flatFile: typeof flatFileDictionary
  private ready = false
  private initPromise: Promise<void> | null = null

  constructor() {
    this.flatFile = flatFileDictionary
  }

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this._initialize()
    return this.initPromise
  }

  private async _initialize(): Promise<void> {
    await this.flatFile.initialize()
    this.ready = true
    console.log(
      "[DictionaryService] Initialized with FlatFileDictionary + Deinflection"
    )
  }

  isReady(): boolean {
    return this.ready
  }

  async lookup(
    word: string,
    options?: LookupOptions
  ): Promise<DictionaryEntry | null> {
    await this.initialize()

    const variants = generateVariants(word)
    for (const variant of variants) {
      const entries = await this.flatFile.lookup(variant)
      if (!entries || entries.length === 0) {
        continue
      }
    const { selected, alternates } = this.selectBestEntry(entries, options)
    return this.formatEntry(word, selected, true, undefined, alternates)
    }

    return null
  }

  async lookupWithDeinflect(
    word: string,
    options?: LookupOptions
  ): Promise<DictionaryEntry | null> {
    await this.initialize()

    const variants = generateVariants(word)
    for (const variant of variants) {
      const result = await this.flatFile.lookupWithDeinflect(variant, deinflect)
      if (!result || result.entries.length === 0) {
        continue
      }

    const { selected, alternates } = this.selectBestEntry(
      result.entries,
      options
    )
    return this.formatEntry(
      word,
      selected,
      result.isExact,
      result.deinflectReasons,
      alternates
    )
  }

    return null
  }

  private selectBestEntry(
    entries: JMDictEntry[],
    options?: LookupOptions
  ): { selected: JMDictEntry; alternates: JMDictEntry[] } {
    const reading = options?.reading
      ? toHiragana(options.reading)
      : undefined
    const posInfo = [options?.pos, options?.posDetail1]
      .filter(Boolean)
      .join(",")
    const posFiltered = filterEntriesByPos(entries, posInfo)
    const candidates = posFiltered.length > 0 ? posFiltered : entries
    const numericContext = isNumericContext(
      options?.contextBefore,
      options?.contextAfter,
      posInfo,
      options?.spansMultipleTokens
    )

    if (reading) {
      const match = candidates.find((entry) =>
        entry.kana?.some((kana) => kana === reading)
      )
      if (match) {
        return { selected: match, alternates: entries.filter((e) => e !== match) }
      }
    }

    const numericCandidates = candidates.filter((entry) =>
      isNumericEntry(entry)
    )
    const nonNumericCandidates = candidates.filter(
      (entry) => !isNumericEntry(entry)
    )

    let selected: JMDictEntry
    if (numericContext && numericCandidates.length > 0) {
      selected = numericCandidates[0]
    } else if (!numericContext && nonNumericCandidates.length > 0) {
      selected = nonNumericCandidates[0]
    } else {
      selected = candidates[0]
    }

    return { selected, alternates: entries.filter((e) => e !== selected) }
  }

  private formatEntry(
    word: string,
    entry: JMDictEntry,
    isExact: boolean,
    deinflectReasons?: string[],
    alternates?: JMDictEntry[]
  ): DictionaryEntry {
    const meanings: string[] = []
    let reading: string | undefined

    if (entry.senses) {
      for (const sense of entry.senses) {
        if (sense.gloss) {
          meanings.push(...sense.gloss)
        }
      }
    }

    if (entry.kana && entry.kana.length > 0) {
      reading = entry.kana[0]
    }

    const partOfSpeech = entry.senses?.[0]?.pos

    return {
      word,
      reading,
      meanings,
      partOfSpeech,
      entry,
      alternates,
      isExact,
      deinflectReasons
    }
  }

  async getEntryCount(): Promise<number> {
    await this.initialize()
    return this.flatFile.getEntryCount()
  }

  clearCache(): void {
    this.flatFile.clearCache()
  }
}

function filterEntriesByPos(
  entries: JMDictEntry[],
  posInfo: string
): JMDictEntry[] {
  if (!posInfo) {
    return []
  }

  const preferences = getPosPreferences(posInfo)
  if (preferences.length === 0) {
    return []
  }

  return entries.filter((entry) => entryMatchesPos(entry, preferences))
}

function getPosPreferences(posInfo: string): string[] {
  const preferences: string[] = []
  const has = (value: string) => posInfo.includes(value)

  if (has("副詞可能")) {
    return ["adv", "adj-na"]
  }
  if (has("形容動詞語幹")) {
    return ["adj-na"]
  }

  if (has("副詞") || has("副詞可能")) {
    preferences.push("adv")
  }
  if (has("形容動詞")) {
    preferences.push("adj-na")
  }
  if (has("形容詞")) {
    preferences.push("adj-i")
  }
  if (has("動詞")) {
    preferences.push("v")
  }
  if (has("名詞")) {
    preferences.push("n")
  }
  if (has("代名詞")) {
    preferences.push("pn")
  }
  if (has("接続詞")) {
    preferences.push("conj")
  }
  if (has("助詞")) {
    preferences.push("prt")
  }
  if (has("助動詞")) {
    preferences.push("aux")
  }

  return preferences
}

function entryMatchesPos(entry: JMDictEntry, preferences: string[]): boolean {
  if (!entry.senses) {
    return false
  }

  return entry.senses.some((sense) =>
    sense.pos?.some((pos) =>
      preferences.some((pref) =>
        pref === "v" ? pos.startsWith("v") : pos === pref || pos.startsWith(pref)
      )
    )
  )
}

function isNumericContext(
  before?: string,
  after?: string,
  posInfo?: string,
  spansMultipleTokens?: boolean
): boolean {
  const context = `${before || ""}${after || ""}`
  if (/[0-9０-９]/.test(context)) {
    return true
  }
  if (/[一二三四五六七八九十百千万億兆]/.test(context)) {
    return true
  }

  const suffixes = ["間", "前", "後", "以内", "以上", "以降", "まで"]
  if (suffixes.some((suffix) => (after || "").includes(suffix))) {
    return true
  }

  if (!spansMultipleTokens && (posInfo?.includes("数") || posInfo?.includes("助数詞"))) {
    return true
  }

  return false
}

function isNumericEntry(entry: JMDictEntry): boolean {
  const glosses =
    entry.senses?.flatMap((sense) => sense.gloss || []).join(" ") || ""
  return /\b(minute|minutes|hour|hours|second|seconds|day|days|week|weeks|month|months|year|years|percent)\b/i.test(
    glosses
  )
}

function generateVariants(word: string): string[] {
  const variants: string[] = []
  const seen = new Set<string>()

  const add = (value: string) => {
    if (!value || seen.has(value)) {
      return
    }
    seen.add(value)
    variants.push(value)
  }

  add(word)

  const normalized = safeNormalize(word)
  add(normalized)

  add(toFullWidthNumbers(word))
  add(toFullWidthNumbers(normalized))

  add(toHalfWidthNumbers(word))
  add(toHalfWidthNumbers(normalized))

  add(kyuujitaiToShinjitai(word))
  add(kyuujitaiToShinjitai(normalized))

  const withChoon = [...variants]
  for (const value of withChoon) {
    for (const expanded of expandChoon(value, 8)) {
      add(expanded)
    }
  }

  return variants
}

function safeNormalize(word: string): string {
  try {
    return word.normalize("NFKC")
  } catch {
    return word
  }
}

function toFullWidthNumbers(word: string): string {
  return word.replace(/[0-9]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) + 0xfee0)
  )
}

function toHalfWidthNumbers(word: string): string {
  return word.replace(/[０-９]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0)
  )
}

const KYUUJITAI_MAP: Record<string, string> = {
  學: "学",
  國: "国",
  體: "体",
  舊: "旧",
  會: "会",
  畫: "画",
  變: "変",
  來: "来",
  廣: "広",
  圍: "囲",
  驛: "駅",
  傳: "伝",
  讀: "読",
  聲: "声",
  萬: "万",
  亞: "亜",
  靈: "霊",
  齊: "斉",
  龍: "竜",
  惠: "恵",
  澤: "沢",
  神: "神",
  﨑: "崎",
  塚: "塚",
  羽: "羽",
  祥: "祥",
  靖: "靖",
  精: "精"
}

function kyuujitaiToShinjitai(word: string): string {
  let converted = ""
  for (const char of word) {
    converted += KYUUJITAI_MAP[char] || char
  }
  return converted
}

function expandChoon(word: string, limit: number): string[] {
  if (!word.includes("ー")) {
    return []
  }

  const results = new Set<string>()

  const walk = (index: number, current: string) => {
    if (results.size >= limit) {
      return
    }
    if (index >= word.length) {
      if (current !== word) {
        results.add(current)
      }
      return
    }

    const char = word[index]
    if (char !== "ー") {
      walk(index + 1, current + char)
      return
    }

    const prev = current[current.length - 1]
    const vowel = kanaToVowel(prev)
    if (vowel) {
      walk(index + 1, current + vowel)
    }
    walk(index + 1, current)
  }

  walk(0, "")
  return [...results]
}

function kanaToVowel(kana?: string): string | null {
  if (!kana) {
    return null
  }

  const map: Record<string, string> = {
    あ: "あ",
    か: "あ",
    さ: "あ",
    た: "あ",
    な: "あ",
    は: "あ",
    ま: "あ",
    や: "あ",
    ら: "あ",
    わ: "あ",
    が: "あ",
    ざ: "あ",
    だ: "あ",
    ば: "あ",
    ぱ: "あ",
    ア: "ア",
    カ: "ア",
    サ: "ア",
    タ: "ア",
    ナ: "ア",
    ハ: "ア",
    マ: "ア",
    ヤ: "ア",
    ラ: "ア",
    ワ: "ア",
    ガ: "ア",
    ザ: "ア",
    ダ: "ア",
    バ: "ア",
    パ: "ア",
    い: "い",
    き: "い",
    し: "い",
    ち: "い",
    に: "い",
    ひ: "い",
    み: "い",
    り: "い",
    ぎ: "い",
    じ: "い",
    ぢ: "い",
    び: "い",
    ぴ: "い",
    イ: "イ",
    キ: "イ",
    シ: "イ",
    チ: "イ",
    ニ: "イ",
    ヒ: "イ",
    ミ: "イ",
    リ: "イ",
    ギ: "イ",
    ジ: "イ",
    ヂ: "イ",
    ビ: "イ",
    ピ: "イ",
    う: "う",
    く: "う",
    す: "う",
    つ: "う",
    ぬ: "う",
    ふ: "う",
    む: "う",
    ゆ: "う",
    る: "う",
    ぐ: "う",
    ず: "う",
    づ: "う",
    ぶ: "う",
    ぷ: "う",
    ウ: "ウ",
    ク: "ウ",
    ス: "ウ",
    ツ: "ウ",
    ヌ: "ウ",
    フ: "ウ",
    ム: "ウ",
    ユ: "ウ",
    ル: "ウ",
    グ: "ウ",
    ズ: "ウ",
    ヅ: "ウ",
    ブ: "ウ",
    プ: "ウ",
    え: "え",
    け: "え",
    せ: "え",
    て: "え",
    ね: "え",
    へ: "え",
    め: "え",
    れ: "え",
    げ: "え",
    ぜ: "え",
    で: "え",
    べ: "え",
    ぺ: "え",
    エ: "エ",
    ケ: "エ",
    セ: "エ",
    テ: "エ",
    ネ: "エ",
    ヘ: "エ",
    メ: "エ",
    レ: "エ",
    ゲ: "エ",
    ゼ: "エ",
    デ: "エ",
    ベ: "エ",
    ペ: "エ",
    お: "お",
    こ: "お",
    そ: "お",
    と: "お",
    の: "お",
    ほ: "お",
    も: "お",
    よ: "お",
    ろ: "お",
    を: "お",
    ご: "お",
    ぞ: "お",
    ど: "お",
    ぼ: "お",
    ぽ: "お",
    オ: "オ",
    コ: "オ",
    ソ: "オ",
    ト: "オ",
    ノ: "オ",
    ホ: "オ",
    モ: "オ",
    ヨ: "オ",
    ロ: "オ",
    ヲ: "オ",
    ゴ: "オ",
    ゾ: "オ",
    ド: "オ",
    ボ: "オ",
    ポ: "オ"
  }

  return map[kana] || null
}

export const dictionaryService = new UnifiedDictionaryService()
export default dictionaryService
