export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export function parseSubtitleText(subtitleText: string, fileName?: string): SubtitleCue[] {
  // Detect format by file extension hint or content
  const lowerFileName = fileName?.toLowerCase() || ""
  
  if (lowerFileName.endsWith(".ass") || subtitleText.includes("[Script Info]") || subtitleText.includes("[V4+ Styles]")) {
    return parseASS(subtitleText)
  } else if (subtitleText.includes("WEBVTT")) {
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

export function parseASS(assText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const lines = assText.split("\n")
  
  let inEventsSection = false
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    
    // Check if we're entering the Events section
    if (trimmedLine === "[Events]") {
      inEventsSection = true
      continue
    }
    
    // Skip section headers and format lines
    if (trimmedLine.startsWith("[") || trimmedLine.startsWith("Format:")) {
      continue
    }
    
    // Parse Dialogue lines
    if (inEventsSection && trimmedLine.startsWith("Dialogue:")) {
      const cue = parseASSDialogue(trimmedLine)
      if (cue) cues.push(cue)
    }
  }
  
  return cues
}

function parseASSDialogue(line: string): SubtitleCue | null {
  // ASS format: Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
  // Example: Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello world
  
  const match = line.match(/^Dialogue:\s*[^,]*,([^,]+),([^,]+),[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,(.+)$/)
  if (!match) return null
  
  const startTime = parseASSTime(match[1])
  const endTime = parseASSTime(match[2])
  let text = match[3]
  
  // Remove ASS formatting tags like {\an8}, {\b1}, etc.
  text = text.replace(/\{[^}]*\}/g, "")
  
  // Replace ASS line breaks (\N) with spaces
  text = text.replace(/\\N/g, " ")
  text = text.replace(/\\n/g, " ")
  
  // Replace hard spaces
  text = text.replace(/\\h/g, " ")
  
  return { start: startTime, end: endTime, text: text.trim() }
}

function parseASSTime(timeStr: string): number {
  // ASS time format: H:MM:SS.cc or 0:00:00.00
  const parts = timeStr.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/)
  if (!parts) return 0
  
  const hours = parseInt(parts[1])
  const minutes = parseInt(parts[2])
  const seconds = parseInt(parts[3])
  const centiseconds = parseInt(parts[4])
  
  return hours * 3600 + minutes * 60 + seconds + centiseconds / 100
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
