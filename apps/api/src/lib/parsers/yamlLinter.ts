/**
 * YAML linter for BC_PRODUCTION_OUTPUT
 * Runs before yaml.load() to catch common LLM formatting mistakes
 * and report actionable issues per problem type.
 */

export interface LintResult {
  valid: boolean;
  issues: string[];
}

const REQUIRED_SECTIONS = ["blog", "video", "shorts", "podcast", "engagement"] as const;

// Checks if a section key appears at the top level or under BC_PRODUCTION_OUTPUT
function sectionPresent(raw: string, section: string): boolean {
  // Match "  blog:" (under BC_PRODUCTION_OUTPUT) or "blog:" at root
  return new RegExp(`(?:^|\\n)\\s{0,4}${section}\\s*:`).test(raw);
}

export function lintProductionYaml(raw: string): LintResult {
  const issues: string[] = [];

  // Em-dash (—, U+2014) — causes YAML parse failures
  if (/\u2014/.test(raw)) {
    issues.push('Em-dash (—) detectado. Substitua por hífen simples (-) ou dois hifens (--).');
  }

  // Curly/smart quotes (" " ' ') — cause YAML string parsing issues
  if (/[\u201C\u201D\u2018\u2019]/.test(raw)) {
    issues.push('Aspas curvas (\u201C\u201D ou \u2018\u2019) detectadas. Use aspas retas (" ou \').');
  }

  // Triple backticks — break YAML block scalar parsing
  if (/```/.test(raw)) {
    issues.push('Triple backticks (```) detectados. Remova blocos de código do YAML.');
  }

  // Check required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!sectionPresent(raw, section)) {
      issues.push(`Seção obrigatória ausente: "${section}". Verifique se o agente gerou todos os formatos.`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
