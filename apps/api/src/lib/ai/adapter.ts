import type { DiscoveryInput, DiscoveryOutput } from "@brighttale/shared/schemas/discovery";
import type {
  BrainstormInput,
  BrainstormOutput,
  ResearchInput,
  ResearchOutput,
  ProductionInput,
  ProductionOutput,
  ReviewInput,
  ReviewOutput,
} from "@brighttale/shared/types/agents";

export interface AIAdapter {
  generateDiscovery(input: DiscoveryInput): Promise<DiscoveryOutput>;
  generateBrainstorm?(input: BrainstormInput): Promise<BrainstormOutput>;
  generateResearch?(input: ResearchInput): Promise<ResearchOutput>;
  generateProduction?(input: ProductionInput): Promise<ProductionOutput>;
  generateReview?(input: ReviewInput): Promise<ReviewOutput>;
}
