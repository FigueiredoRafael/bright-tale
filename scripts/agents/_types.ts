import type { SectionsJson } from '@brighttale/shared';

export interface AgentDefinition {
  slug: string;
  name: string;
  stage: string;
  recommendedProvider?: string | null;
  recommendedModel?: string | null;
  tools?: string[];
  sections: SectionsJson;
}
