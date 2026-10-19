// Exempt one standalone leading emoji per paragraph, including variation selectors, skin
// tones, joined emoji, and flags. Extra emoji still count toward the limit.
const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)(?:\s+|$)/u

export function refinementWordCount(text: string): number {
  return text.split(/\r?\n/u).reduce((total, paragraph) => {
    const content = paragraph.trim().replace(LEADING_EMOJI, '').trim()
    return total + (content ? content.split(/\s+/u).length : 0)
  }, 0)
}
