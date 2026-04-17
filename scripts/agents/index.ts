import type { AgentDefinition } from './_types';
import { brainstorm } from './brainstorm';
import { research } from './research';
import { contentCore } from './content-core';
import { blog } from './blog';
import { shorts } from './shorts';
import { podcast } from './podcast';
import { engagement } from './engagement';

// Agents are imported + listed here as they're added.
// Each translation task appends one import + one array entry.

export const ALL_AGENTS: AgentDefinition[] = [brainstorm, research, contentCore, blog, shorts, podcast, engagement];
