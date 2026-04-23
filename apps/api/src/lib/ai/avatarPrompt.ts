export interface AvatarSuggestions {
  background?: string
  artStyle?: string
  faceMood?: string
  faceAppearance?: string
  noFaceElement?: string
}

/**
 * Builds a refined image generation prompt from persona data + user suggestions.
 * Called server-side; users see only the suggestion fields, not this function.
 */
export function buildAvatarPrompt(params: {
  personaName: string
  primaryDomain: string
  domainLens: string
  channelNiche?: string
  channelTone?: string
  suggestions: AvatarSuggestions
  agentInstruction?: string
}): string {
  const { personaName, primaryDomain, domainLens, channelNiche, channelTone, suggestions, agentInstruction } = params

  const nicheContext = channelNiche
    ? `Niche: ${channelNiche}.`
    : `Domain: ${primaryDomain} — ${domainLens}.`

  const toneHint = channelTone ? ` Visual tone should feel ${channelTone}.` : ''

  const faceDescription = suggestions.noFaceElement
    ? `No human face. Use instead: ${suggestions.noFaceElement}.`
    : [
        suggestions.faceMood ? `Expression: ${suggestions.faceMood}.` : '',
        suggestions.faceAppearance ? `Appearance: ${suggestions.faceAppearance}.` : '',
      ]
        .filter(Boolean)
        .join(' ')

  const styleBlock = [
    suggestions.artStyle ? `Art style: ${suggestions.artStyle}.` : 'Art style: professional illustrated portrait.',
    suggestions.background ? `Background: ${suggestions.background}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const base = agentInstruction
    ? `${agentInstruction}\n\nPersona: ${personaName}. ${nicheContext}${toneHint} ${styleBlock} ${faceDescription}`
    : `Professional avatar for ${personaName}, a ${primaryDomain} expert. ${nicheContext}${toneHint} ${styleBlock} ${faceDescription}`

  return base.trim()
}
