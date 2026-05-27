-- Backfill legacy orchestrator mode values to the canonical wizard taxonomy
-- used by engines + useAutoPilotTrigger. Projects created/toggled before the
-- canonical-vocab fix (ProjectModeControls used to write 'autopilot'|'manual')
-- never auto-fired in the UI because engines look for 'supervised'|'overview'.

UPDATE public.projects SET mode = 'supervised'   WHERE mode = 'autopilot';
UPDATE public.projects SET mode = 'step-by-step' WHERE mode = 'manual';
