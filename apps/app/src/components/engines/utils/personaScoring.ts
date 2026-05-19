import type { Persona, PersonaTraits } from '@brighttale/shared/types/agents'

export interface PersonaGap {
  field: string
  label: string
  description: string
  weight: number
  current: number
}

export function computePersonaGaps(p: Persona): PersonaGap[] {
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
  const gaps: PersonaGap[] = []

  const bioWords = wordCount(p.bioLong ?? '')
  const bioCurrent = Math.min(1, bioWords / 600)
  if (bioCurrent < 1) gaps.push({
    field: 'bioLong',
    label: 'Biografia detalhada',
    description: bioCurrent === 0
      ? 'Não preenchida'
      : `Muito curta (${bioWords} palavra${bioWords !== 1 ? 's' : ''}, mínimo 600)`,
    weight: 30,
    current: bioCurrent,
  })

  const opinions = p.soulJson.strongOpinions?.length ?? 0
  if (opinions < 3) gaps.push({
    field: 'soulJson.strongOpinions',
    label: 'Opiniões fortes',
    description: opinions === 0 ? 'Nenhuma definida' : `Apenas ${opinions} (mínimo 3)`,
    weight: 15,
    current: opinions / 3,
  })

  const phrases = p.writingVoiceJson.signaturePhrases?.length ?? 0
  if (phrases < 3) gaps.push({
    field: 'writingVoiceJson.signaturePhrases',
    label: 'Frases características',
    description: phrases === 0 ? 'Nenhuma definida' : `Apenas ${phrases} (mínimo 3)`,
    weight: 15,
    current: phrases / 3,
  })

  const guardrails = p.soulJson.languageGuardrails?.length ?? 0
  if (guardrails < 2) gaps.push({
    field: 'soulJson.languageGuardrails',
    label: 'Guardrails de linguagem',
    description: guardrails === 0 ? 'Nenhum definido' : `Apenas ${guardrails} (mínimo 2)`,
    weight: 10,
    current: guardrails / 2,
  })

  if (!p.avatarUrl) gaps.push({
    field: 'avatarUrl',
    label: 'Avatar',
    description: 'Sem foto/avatar',
    weight: 10,
    current: 0,
  })

  if (!p.primaryDomain || !p.domainLens) gaps.push({
    field: 'primaryDomain',
    label: 'Domínio e perspectiva',
    description: 'Domínio principal ou lente analítica não preenchidos',
    weight: 10,
    current: (p.primaryDomain ? 0.5 : 0) + (p.domainLens ? 0.5 : 0),
  })

  const hasValues = (p.soulJson.values?.length ?? 0) >= 1
  const hasPhilosophy = !!p.soulJson.lifePhilosophy
  if (!hasValues || !hasPhilosophy) gaps.push({
    field: 'soulJson.values',
    label: 'Valores e filosofia',
    description: !hasValues && !hasPhilosophy
      ? 'Valores e filosofia não definidos'
      : !hasValues ? 'Valores não definidos' : 'Filosofia de vida não definida',
    weight: 5,
    current: (hasValues ? 0.5 : 0) + (hasPhilosophy ? 0.5 : 0),
  })

  if ((p.languagesJson?.length ?? 0) === 0) gaps.push({
    field: 'languagesJson',
    label: 'Idiomas',
    description: 'Nenhum idioma definido',
    weight: 5,
    current: 0,
  })

  return gaps.sort((a, b) => (b.weight * (1 - b.current)) - (a.weight * (1 - a.current)))
}

export function buildFixerContext(p: Persona, qualityScore: number): string {
  const gaps = computePersonaGaps(p)
  const actionable = gaps.filter(g => g.field !== 'avatarUrl')
  if (actionable.length === 0) {
    return `Nome: ${p.name}\nQualidade: ${qualityScore}% (excelente!)\nNenhuma lacuna significativa identificada.`
  }
  const gapLines = actionable
    .map(g => `- ${g.label}: ${g.description} (+${Math.round(g.weight * (1 - g.current))} pts)`)
    .join('\n')
  return `Nome: ${p.name}\nDomínio: ${p.primaryDomain || '(não definido)'}\nQualidade atual: ${qualityScore}%\n\nLacunas:\n${gapLines}`
}

export function buildFixerOpening(p: Persona, qualityScore: number): string {
  const gaps = computePersonaGaps(p).filter(g => g.field !== 'avatarUrl')
  if (gaps.length === 0) {
    return `A persona **${p.name}** está com **${qualityScore}%** de qualidade — ótimo trabalho!\n\nPosso ajudar a refinar algum aspecto específico se quiser.`
  }

  const top = gaps[0]
  const listLines = gaps.slice(0, 4)
    .map(g => `• **${g.label}** — ${g.description}`)
    .join('\n')

  const opener = top.field === 'bioLong'
    ? `Vamos começar pela **Biografia detalhada** — ela vale 30% da qualidade e é o coração da persona.\n\nMe conte a história de **${p.name}**: origens, experiências que a formaram, o que a faz diferente, e por que ela fala com autoridade sobre ${p.primaryDomain || 'o seu nicho'}.`
    : top.field.startsWith('soulJson.strongOpinions')
    ? `Vamos começar pelas **Opiniões fortes** — as crenças mais firmes de **${p.name}** sobre ${p.primaryDomain || 'o nicho'}.\n\nQuais são as 3 opiniões que fariam parte das pessoas concordar com entusiasmo e outras discordar completamente?`
    : top.field.startsWith('writingVoiceJson.signaturePhrases')
    ? `Vamos começar pelas **Frases características** de **${p.name}**.\n\nQuais são as expressões, gírias ou construções que ela usa com frequência — coisas que fariam um leitor identificar "isso foi escrito por ${p.name}"?`
    : `Vamos começar pelos **${top.label}** de **${p.name}**.`

  return `Analisei a persona **${p.name}** e encontrei **${gaps.length} ponto${gaps.length !== 1 ? 's' : ''}** para melhorar (qualidade atual: **${qualityScore}%**):\n\n${listLines}\n\n${opener}`
}

function clamp(value: number, min = 1, max = 10): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function computePersonaTraits(p: Persona): PersonaTraits {
  const soul = p.soulJson
  const voice = p.writingVoiceJson
  const eeat = p.eeatSignalsJson

  const empatia = clamp(
    1
    + Math.min(3, soul.whatExcites?.length ?? 0) * 1.5
    + Math.min(2, soul.petPeeves?.length ?? 0) * 0.75
    + (soul.humorStyle && soul.humorStyle !== 'Sem humor (formal)' ? 1 : 0)
    + ((soul.values?.length ?? 0) >= 3 ? 1 : 0),
  )

  const profundidade = clamp(
    1
    + (eeat.analyticalLens?.length > 50 ? 3 : eeat.analyticalLens?.length > 20 ? 1.5 : 0)
    + Math.min(3, eeat.expertiseClaims?.length ?? 0) * 1.5
    + ((eeat.trustSignals?.length ?? 0) >= 2 ? 1 : 0),
  )

  const provocacao = clamp(
    1
    + Math.min(4, soul.strongOpinions?.length ?? 0) * 1.5
    + Math.min(2, voice.characteristicOpinions?.length ?? 0) * 1,
  )

  const singularidade = clamp(
    1
    + Math.min(3, voice.signaturePhrases?.length ?? 0) * 1.5
    + Math.min(2, soul.recurringJokes?.length ?? 0) * 1
    + Math.min(2, soul.languageGuardrails?.length ?? 0) * 1
    + Math.min(2, voice.characteristicOpinions?.length ?? 0) * 0.5,
  )

  const writingStyleLower = (voice.writingStyle ?? '').toLowerCase()
  const narrativa = clamp(
    1
    + (writingStyleLower.includes('narrativ') || writingStyleLower.includes('storytelling') ? 3 : 0)
    + (soul.lifePhilosophy?.length > 20 ? 2 : soul.lifePhilosophy?.length > 5 ? 1 : 0)
    + ((soul.values?.length ?? 0) >= 2 ? 1 : 0)
    + ((soul.whatExcites?.length ?? 0) >= 2 ? 1 : 0),
  )

  const autoridade = clamp(
    1
    + Math.min(3, eeat.trustSignals?.length ?? 0) * 1.5
    + Math.min(2, eeat.expertiseClaims?.length ?? 0) * 1.5
    + (p.domainLens?.length > 30 ? 1 : 0),
  )

  return { empatia, profundidade, provocacao, singularidade, narrativa, autoridade }
}

export function computePersonaQualityScore(p: Persona): number {
  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

  let score = 0
  score += Math.min(1, wordCount(p.bioLong) / 600) * 30
  score += Math.min(1, (p.soulJson.strongOpinions?.length ?? 0) / 3) * 15
  score += Math.min(1, (p.writingVoiceJson.signaturePhrases?.length ?? 0) / 3) * 15
  score += Math.min(1, (p.soulJson.languageGuardrails?.length ?? 0) / 2) * 10
  score += p.avatarUrl ? 10 : 0
  score += (p.primaryDomain && p.domainLens) ? 10 : 0
  score += ((p.soulJson.values?.length ?? 0) >= 1 && p.soulJson.lifePhilosophy) ? 5 : 0
  score += (p.languagesJson?.length ?? 0) >= 1 ? 5 : 0
  return Math.round(score)
}

interface ScoringContext {
  ideaTitle?: string
  ideaCoreTension?: string
  researchPrimaryKeyword?: string
  researchSecondaryKeywords?: string[]
  researchSearchIntent?: string
}

interface IdeaSignals {
  affiliateAngle?: string
  productCategories?: string[]
}

export function scorePersonaForContent(
  persona: Persona,
  context: ScoringContext,
  idea: IdeaSignals | undefined
): number {
  const signals = [
    context.ideaTitle ?? '',
    context.ideaCoreTension ?? '',
    context.researchPrimaryKeyword ?? '',
    ...(context.researchSecondaryKeywords ?? []),
    context.researchSearchIntent ?? '',
    idea?.affiliateAngle ?? '',
    ...(idea?.productCategories ?? []),
  ]
    .join(' ')
    .toLowerCase()

  const personaTerms = [
    ...persona.approvedCategories,
    persona.primaryDomain,
    persona.domainLens,
  ]
    .join(' ')
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3)

  return personaTerms.filter((term) => signals.includes(term)).length
}

export interface RankedPersona {
  persona: Persona
  score: number
  isRecommended: boolean
}

export function rankPersonas(
  personas: Persona[],
  context: ScoringContext,
  idea: IdeaSignals | undefined
): RankedPersona[] {
  const scored = personas.map((persona) => ({
    persona,
    score: scorePersonaForContent(persona, context, idea),
  }))
  // Stable sort: equal scores preserve original order
  scored.sort((a, b) => b.score - a.score)
  const maxScore = scored[0]?.score ?? 0
  return scored.map((item, i) => ({
    ...item,
    isRecommended: maxScore > 0 && i === 0,
  }))
}
