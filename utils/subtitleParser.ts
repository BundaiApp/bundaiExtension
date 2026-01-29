export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export function parseSubtitleText(subtitleText: string): SubtitleCue[] {
  if (subtitleText.includes("WEBVTT")) {
    return parseVTT(subtitleText)
  } else if (subtitleText.match(/^\d+\s*$/m)) {
    return parseSRT(subtitleText)
  }
  return []
}

export function parseVTT(vttText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const lines = vttText.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.includes("-->")) {
      const timeMatch = line.match(/(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})/)
      if (timeMatch) {
        const startTime = parseTimeToSeconds(timeMatch[0].split("-->")[0].trim())
        const endTime = parseTimeToSeconds(timeMatch[0].split("-->")[1].trim())
        i++
        let text = ""
        while (i < lines.length && lines[i].trim() !== "") {
          if (text) text += " "
          text += lines[i].trim()
          i++
        }
        if (text) {
          cues.push({ start: startTime, end: endTime, text: text.replace(/<[^>]*>/g, "") })
        }
      }
    }
    i++
  }
  return cues
}

export function parseSRT(srtText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const blocks = srtText.split(/\n\s*\n/)
  for (const block of blocks) {
    const lines = block.trim().split("\n")
    if (lines.length >= 3) {
      const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/)
      if (timeMatch) {
        const startTime = parseTimeToSeconds(lines[1].split("-->")[0].trim().replace(",", "."))
        const endTime = parseTimeToSeconds(lines[1].split("-->")[1].trim().replace(",", "."))
        const text = lines.slice(2).join(" ").replace(/<[^>]*>/g, "")
        cues.push({ start: startTime, end: endTime, text })
      }
    }
  }
  return cues
}

export function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.match(/(?:(\d{2}):)?(\d{2}):(\d{2})[\.,](\d{3})/)
  if (!parts) return 0
  const hours = parseInt(parts[1] || "0")
  const minutes = parseInt(parts[2])
  const seconds = parseInt(parts[3])
  const milliseconds = parseInt(parts[4])
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

export function applyTimeOffset(cues: SubtitleCue[], offsetSeconds: number): SubtitleCue[] {
  return cues.map((cue) => ({
    ...cue,
    start: Math.max(0, cue.start + offsetSeconds),
    end: Math.max(0, cue.end + offsetSeconds)
  }))
}
