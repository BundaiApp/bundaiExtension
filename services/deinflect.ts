// Deinflection system for Japanese - 10ten-ja-reader style
// Handles conjugation patterns to find dictionary base forms

export interface DeinflectResult {
  word: string
  type: number
  reasons: string[]
}

// Word type bitmasks
export const WordType = {
  Initial: 1 << 0,
  IchidanVerb: 1 << 1,
  GodanVerb: 1 << 2,
  IAdj: 1 << 3,
  NaAdj: 1 << 4,
  IrrealisStem: 1 << 5,
  MasuStem: 1 << 6,
  TaTeStem: 1 << 7,
  TeStem: 1 << 8,
  Abu: 1 << 9,
  Masu: 1 << 10,
  MasuForm: 1 << 11,
  Polite: 1 << 12,
  Negative: 1 << 13,
  Past: 1 << 14,
  Desu: 1 << 15,
  Darl: 1 << 16,
  被动: 1 << 17,
  使役: 1 << 18,
  可能: 1 << 19,
  意志: 1 << 20,
  命令: 1 << 21,
  ている: 1 << 22,
  たる: 1 << 23,
  だ: 1 << 24,
  ける: 1 << 25,
  さる: 1 << 26,
  ざる: 1 << 27,
  させる: 1 << 28
} as const

export type WordType = (typeof WordType)[keyof typeof WordType]

// Deinflection reasons
export const Reason = {
  Polite: "polite",
  Past: "past",
  Negative: "negative",
  MasuStem: "masu-stem",
  TeStem: "te-stem",
  TaTeStem: "ta-te-stem",
  Causative: "causative",
  Passive: "passive",
  Potential: "potential",
  Imperative: "imperative",
  Volitional: "volitional",
  Teiru: "te-iru",
  Tara: "tara",
  Abu: "abu",
  Desu: "desu",
  Darl: "darl"
} as const

export type Reason = (typeof Reason)[keyof typeof Reason]

// Deinflection rules: [from, to, fromType, toType, reasons[]]
const deinflectRuleData: Array<
  [
    string, // from ending
    string, // to base (empty = remove)
    number, // fromType (word type before deinflecting)
    number, // toType (word type after deinflecting)
    string[] // reasons for this transformation
  ]
> = [
  // Past form (た, だ)
  ["った", "", WordType.Initial, WordType.TaTeStem, [Reason.Past]],
  ["って", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["った", "", WordType.Initial, WordType.TaTeStem, [Reason.Tara]],
  ["んだ", "", WordType.Initial, WordType.TaTeStem, [Reason.Past]],
  ["んで", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["んだ", "", WordType.Initial, WordType.TaTeStem, [Reason.Tara]],

  // Polite form (ます)
  ["ました", "", WordType.Initial, WordType.MasuStem, [Reason.Polite]],
  [
    "ません",
    "",
    WordType.Initial,
    WordType.MasuStem,
    [Reason.Polite, Reason.Negative]
  ],
  [
    "ましたら",
    "",
    WordType.Initial,
    WordType.MasuStem,
    [Reason.Polite, Reason.Tara]
  ],
  [
    "ませんでした",
    "",
    WordType.Initial,
    WordType.MasuStem,
    [Reason.Polite, Reason.Past, Reason.Negative]
  ],

  // Negative form (ない, ぬ, ん)
  ["わない", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["えない", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["わない", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["ぬ", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["ん", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["なく", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],

  // Te form (て, で)
  ["いて", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["いて", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["えて", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["んで", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["んで", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["んで", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],

  // Masu stem (common conjugation base)
  ["し", "", WordType.Initial, WordType.GodanVerb, [Reason.MasuStem]],
  ["き", "", WordType.Initial, WordType.GodanVerb, [Reason.MasuStem]],
  ["ぎ", "", WordType.Initial, WordType.GodanVerb, [Reason.MasuStem]],
  ["ち", "", WordType.Initial, WordType.GodanVerb, [Reason.MasuStem]],
  ["り", "", WordType.Initial, WordType.GodanVerb, [Reason.MasuStem]],
  ["び", "", WordType.Initial, WordType.GodanVerb, [Reason.MasuStem]],
  ["み", "", WordType.Initial, WordType.IchidanVerb, [Reason.MasuStem]],
  ["に", "", WordType.Initial, WordType.GodanVerb, [Reason.MasuStem]],

  // Verb conjugations
  ["せる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Causative]],
  ["させる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Causative]],
  ["られる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Passive]],
  ["られる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Potential]],
  [
    "られる",
    "",
    WordType.Initial,
    WordType.IchidanVerb,
    [Reason.Causative, Reason.Passive]
  ],
  ["よう", "", WordType.Initial, WordType.GodanVerb, [Reason.Volitional]],
  ["よう", "", WordType.Initial, WordType.IchidanVerb, [Reason.Volitional]],
  ["たい", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],
  ["たら", "", WordType.Initial, WordType.IrrealisStem, [Reason.Tara]],
  ["なきゃ", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["なくちゃ", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],

  // Common conjugated forms
  ["ている", "", WordType.Initial, WordType.TeStem, [Reason.Teiru]],
  ["てる", "", WordType.Initial, WordType.TeStem, [Reason.Teiru]],
  [
    "ていた",
    "",
    WordType.Initial,
    WordType.TeStem,
    [Reason.Teiru, Reason.Past]
  ],
  [
    "ていない",
    "",
    WordType.Initial,
    WordType.TeStem,
    [Reason.Teiru, Reason.Negative]
  ],
  ["でいる", "", WordType.Initial, WordType.TeStem, [Reason.Teiru]],
  ["でる", "", WordType.Initial, WordType.TeStem, [Reason.Teiru]],

  // Adjective conjugations
  ["かった", "", WordType.Initial, WordType.IAdj, [Reason.Past]],
  ["くて", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],
  ["ければ", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],
  [
    "くなかった",
    "",
    WordType.Initial,
    WordType.IAdj,
    [Reason.Past, Reason.Negative]
  ],
  ["くなく", "", WordType.Initial, WordType.IAdj, [Reason.Negative]],

  // Special forms
  ["です", "", WordType.Initial, WordType.Desu, [Reason.Desu]],
  ["でした", "", WordType.Initial, WordType.Desu, [Reason.Desu, Reason.Past]],
  ["じゃあ", "", WordType.Initial, WordType.Darl, [Reason.Darl]],
  ["だっちゃ", "", WordType.Initial, WordType.Darl, [Reason.Darl]],
  ["なきゃ", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],

  // More verb conjugations
  ["ほしい", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],
  [
    "させたい",
    "",
    WordType.Initial,
    WordType.IchidanVerb,
    [Reason.Causative, Reason.Tara]
  ],
  [
    "られたい",
    "",
    WordType.Initial,
    WordType.IchidanVerb,
    [Reason.Potential, Reason.Tara]
  ],

  // Progressive forms
  ["ていく", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["てくる", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["ていく", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["てくる", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],

  // Giving/receiving
  ["てあげる", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["てくれる", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["てもらう", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],

  // Try/might
  ["てみる", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  [
    "てみよう",
    "",
    WordType.Initial,
    WordType.TeStem,
    [Reason.Tara, Reason.Volitional]
  ],

  // Need/must
  [
    "なければならない",
    "",
    WordType.Initial,
    WordType.IrrealisStem,
    [Reason.Negative]
  ],
  [
    "なきゃならない",
    "",
    WordType.Initial,
    WordType.IrrealisStem,
    [Reason.Negative]
  ],
  [
    "なくちゃならない",
    "",
    WordType.Initial,
    WordType.IrrealisStem,
    [Reason.Negative]
  ],

  // Common expressions
  ["すぎる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Causative]],
  ["すぎる", "", WordType.Initial, WordType.GodanVerb, [Reason.Causative]],
  ["やすい", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],
  ["にくい", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],
  ["ほしい", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],

  // Potential forms
  ["ける", "", WordType.Initial, WordType.IchidanVerb, [Reason.Potential]],
  ["げる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Potential]],
  ["ける", "", WordType.Initial, WordType.IchidanVerb, [Reason.Potential]],
  ["せる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Causative]],

  // Imperative
  ["しろ", "", WordType.Initial, WordType.GodanVerb, [Reason.Imperative]],
  ["しろ", "", WordType.Initial, WordType.GodanVerb, [Reason.Imperative]],
  [
    "してください",
    "",
    WordType.Initial,
    WordType.MasuStem,
    [Reason.Polite, Reason.Causative]
  ],
  ["気をつけて", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["してください", "", WordType.Initial, WordType.MasuStem, [Reason.Polite]],

  // More polite forms
  [
    "なさってください",
    "",
    WordType.Initial,
    WordType.MasuStem,
    [Reason.Polite]
  ],
  ["なさる", "", WordType.Initial, WordType.GodanVerb, [Reason.Polite]],

  // Common compound forms
  ["てほしい", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["ないで", "", WordType.Initial, WordType.TeStem, [Reason.Negative]],
  ["なくて", "", WordType.Initial, WordType.TeStem, [Reason.Negative]],
  [
    "なければならない",
    "",
    WordType.Initial,
    WordType.IrrealisStem,
    [Reason.Negative]
  ],

  // Honorific
  [
    "なさって",
    "",
    WordType.Initial,
    WordType.TeStem,
    [Reason.Polite, Reason.Tara]
  ],
  ["おいて", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],
  ["おいて", "", WordType.Initial, WordType.TeStem, [Reason.Tara]],

  // Very common casual forms
  ["なきゃ", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["なくちゃ", "", WordType.Initial, WordType.IrrealisStem, [Reason.Negative]],
  ["ちゃ", "", WordType.Initial, WordType.Darl, [Reason.Darl]],
  ["じゃ", "", WordType.Initial, WordType.Darl, [Reason.Darl]],

  // Progressive casual
  ["てる", "", WordType.Initial, WordType.TeStem, [Reason.Teiru]],
  ["でる", "", WordType.Initial, WordType.TeStem, [Reason.Teiru]],
  ["とる", "", WordType.Initial, WordType.TeStem, [Reason.Teiru]],

  // More verb endings
  ["やろう", "", WordType.Initial, WordType.GodanVerb, [Reason.Volitional]],
  ["やろう", "", WordType.Initial, WordType.GodanVerb, [Reason.Volitional]],
  ["よう", "", WordType.Initial, WordType.GodanVerb, [Reason.Volitional]],
  [
    "ましょう",
    "",
    WordType.Initial,
    WordType.MasuStem,
    [Reason.Polite, Reason.Volitional]
  ],

  // Requests
  ["くれ", "", WordType.Initial, WordType.GodanVerb, [Reason.Imperative]],
  ["ちょう", "", WordType.Initial, WordType.GodanVerb, [Reason.Imperative]],
  [
    "てちょう",
    "",
    WordType.Initial,
    WordType.TeStem,
    [Reason.Tara, Reason.Imperative]
  ],

  // Adjective + verb
  ["すぎる", "", WordType.Initial, WordType.GodanVerb, [Reason.Causative]],
  ["すぎる", "", WordType.Initial, WordType.IchidanVerb, [Reason.Causative]],

  // Recent/very casual
  ["じゃった", "", WordType.Initial, WordType.TaTeStem, [Reason.Past]],
  ["ちまった", "", WordType.Initial, WordType.TaTeStem, [Reason.Past]],
  ["じまった", "", WordType.Initial, WordType.TaTeStem, [Reason.Past]],

  // Conditional
  ["ければ", "", WordType.Initial, WordType.IAdj, [Reason.Tara]],
  [
    "なかったら",
    "",
    WordType.Initial,
    WordType.IAdj,
    [Reason.Past, Reason.Negative, Reason.Tara]
  ],

  // Light verb forms
  ["やる", "", WordType.Initial, WordType.GodanVerb, [Reason.Tara]],
  ["やる", "", WordType.Initial, WordType.GodanVerb, [Reason.Tara]]
]

// Create a map for faster lookup
const ruleMap = new Map<
  string,
  Array<[string, string, number, number, string[]]>
>()

for (const rule of deinflectRuleData) {
  const [from] = rule
  if (!ruleMap.has(from)) {
    ruleMap.set(from, [])
  }
  ruleMap.get(from)!.push(rule)
}

/**
 * Deinflect a word to find possible base forms
 */
export function deinflect(word: string): DeinflectResult[] {
  const results: DeinflectResult[] = []

  // Try deinflection for progressively shorter endings
  for (let len = Math.min(word.length, 10); len >= 1; len--) {
    const ending = word.slice(-len)

    if (ruleMap.has(ending)) {
      const rules = ruleMap.get(ending)!

      for (const [from, to, fromType, toType, reasons] of rules) {
        const base = word.slice(0, -from.length) + to

        results.push({
          word: base,
          type: toType,
          reasons
        })
      }
    }
  }

  // Also return the word itself as-is
  results.push({
    word,
    type: WordType.Initial,
    reasons: []
  })

  return results
}

/**
 * Check if a word type matches entry types
 */
export function matchesWordType(
  entryTypes: number[],
  targetType: number
): boolean {
  // Simple matching - if entry has any of the target types
  for (const type of entryTypes) {
    if (type & targetType) {
      return true
    }
  }
  return false
}

/**
 * Get word types from entry (based on POS tags)
 */
export function getWordTypesFromEntry(entry: any): number[] {
  const types: number[] = []

  if (!entry.senses) {
    return [WordType.Initial]
  }

  for (const sense of entry.senses) {
    const pos = sense.pos || []

    // Check for verb types
    if (pos.some((p: string) => p.startsWith("v1"))) {
      types.push(WordType.IchidanVerb)
    }
    if (pos.some((p: string) => p.startsWith("v5"))) {
      types.push(WordType.GodanVerb)
    }

    // Check for adjective types
    if (pos.some((p: string) => p === "adj-i")) {
      types.push(WordType.IAdj)
    }
    if (pos.some((p: string) => p === "adj-na")) {
      types.push(WordType.NaAdj)
    }
  }

  // If no types found, assume initial
  if (types.length === 0) {
    types.push(WordType.Initial)
  }

  return types
}

/**
 * Extended deinflect that checks type matching
 */
export function deinflectWithTypeCheck(
  word: string,
  entry: any
): DeinflectResult[] {
  const results: DeinflectResult[] = []
  const entryTypes = getWordTypesFromEntry(entry)

  const deinflections = deinflect(word)

  for (const result of deinflections) {
    // Check if the deinflected type matches entry types
    if (matchesWordType(entryTypes, result.type)) {
      results.push(result)
    }
  }

  // Also include the word itself
  if (matchesWordType(entryTypes, WordType.Initial)) {
    results.unshift({
      word,
      type: WordType.Initial,
      reasons: []
    })
  }

  return results
}
