/**
 * pipeline-advance — fires after every terminal Stage Run transition.
 *
 * Listens to `pipeline/stage.run.finished` events emitted by Stage Run
 * jobs (brainstorm-generate today, others as they migrate) and delegates
 * to the Pipeline Orchestrator's `advanceAfter`, which decides whether
 * to enqueue the next Stage Run based on Mode/Paused/autopilot_config.
 *
 * This function is a thin Inngest adapter — all real logic lives in the
 * orchestrator module.
 */
import { inngest } from './client.js';
import { advanceAfter } from '../lib/pipeline/orchestrator.js';

interface PipelineStageRunFinishedEvent {
  name: 'pipeline/stage.run.finished';
  data: {
    stageRunId: string;
    projectId?: string;
  };
}

export const pipelineAdvance = inngest.createFunction(
  {
    id: 'pipeline-advance',
    retries: 0,
    triggers: [{ event: 'pipeline/stage.run.finished' }],
  },
  async ({ event }: { event: PipelineStageRunFinishedEvent }) => {
    await advanceAfter(event.data.stageRunId);
  },
);
