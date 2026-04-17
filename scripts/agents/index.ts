import type { AgentDefinition } from './_types';
import { brainstorm } from './brainstorm';
import { research } from './research';

// Agents are imported + listed here as they're added.
// Each translation task appends one import + one array entry.

export const ALL_AGENTS: AgentDefinition[] = [brainstorm, research];
